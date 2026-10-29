#!/bin/bash
# DSH 远程网关启停脚本: 网关(:3081) + cloudflared Quick Tunnel
# 用法: gw.sh start|stop|restart|status|qr|tunnel-stop
#       gw.sh password [新口令]      重设口令 (scrypt, 热加载, 无需重启; 不带参数则交互输入)
#       gw.sh key rotate             轮换内部管理密钥 (.gw_admin)
#       gw.sh keys                   查看密钥/凭证总览 (不含任何密钥值)
#       gw.sh sessions revoke        强制所有浏览器会话重新登录
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
GW_LOG="$DIR/gateway.log"
TN_LOG="$DIR/tunnel.log"
GW_PID="$DIR/gateway.pid"
TN_PID="$DIR/tunnel.pid"
ADMIN_FILE="$DIR/.gw_admin"

gw_port() { echo "${GW_PORT:-3081}"; }

# 内部管理密钥: 网关/插件共用, 0600 持久化; 这里只在缺失时创建
ensure_admin_token() {
  if [ ! -s "$ADMIN_FILE" ]; then
    ( umask 077; node -e "const fs=require('fs'),c=require('crypto');fs.writeFileSync(process.argv[1], c.randomBytes(32).toString('base64url')+'\n', {mode:0o600, flag:'wx'})" "$ADMIN_FILE" ) 2>/dev/null || true
  fi
}

# 带内部密钥调用网关 (缺失密钥时退化为匿名调用)
gw_curl() {
  local method="$1" path="$2" body="${3:-}"
  local -a args=(-s -X "$method")
  if [ -s "$ADMIN_FILE" ]; then args+=(-H "x-gw-admin: $(cat "$ADMIN_FILE")"); fi
  if [ -n "$body" ]; then args+=(-H "content-type: application/json" -d "$body"); fi
  curl "${args[@]}" "http://127.0.0.1:$(gw_port)$path"
}

# pid 文件里的进程是否真的还在跑(可带命令行特征), 避免陈旧 pid 或 pid 复用误判"已在运行"
pid_running() {
  local pid_file="$1" marker="${2:-}" pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  if [ -n "$marker" ]; then
    ps -p "$pid" -o command= 2>/dev/null | grep -q -- "$marker" || return 1
  fi
  return 0
}

# 自定义地址选中时跳过 Quick Tunnel: 有 activeId 且对应地址存在 => 不起隧道
needs_quick_tunnel() {
  node -e "
try {
  const fs = require('fs');
  const s = JSON.parse(fs.readFileSync('$DIR/remotes.json', 'utf8'));
  const ok = !!(s && s.activeId && Array.isArray(s.remotes) && s.remotes.some((r) => r && r.id === s.activeId && r.baseUrl));
  process.exit(ok ? 1 : 0);
} catch { process.exit(0); }
" 2>/dev/null
}

kill_tunnel() {
  local killed=0
  [ -f "$TN_PID" ] && { kill "$(cat "$TN_PID")" 2>/dev/null && killed=1; rm -f "$TN_PID"; }
  pkill -f "cloudflared tunnel --url http://127.0.0.1:$(gw_port)" 2>/dev/null && killed=1 || true
  rm -f "$DIR/tunnel.url"
  return $killed
}

do_start() {
  mkdir -p "$DIR"
  ensure_admin_token
  if pid_running "$GW_PID" "gateway.mjs"; then
    echo "gateway already running (pid $(cat "$GW_PID"))"
  else
    [ -z "${GW_PASSWORD:-}" ] && [ ! -f "$DIR/.gw_password" ] && echo "提示: 首次启动将自动生成随机口令, 见 gateway.log 的 FIRST_START_PASSWORD"
    GW_PORT="$(gw_port)" nohup node "$DIR/gateway.mjs" >> "$GW_LOG" 2>&1 &
    echo $! > "$GW_PID"
    echo "gateway started on :$(gw_port) (pid $!)"
    sleep 1
    gw_curl GET /__gw/status || echo "gateway not responding yet"
    echo
  fi
  if needs_quick_tunnel; then
    if pid_running "$TN_PID" "cloudflared"; then
      echo "tunnel already running (pid $(cat "$TN_PID"))"
    else
      nohup cloudflared tunnel --url "http://127.0.0.1:$(gw_port)" --no-autoupdate >> "$TN_LOG" 2>&1 &
      echo $! > "$TN_PID"
      echo "tunnel starting (pid $!)..."
      for i in $(seq 1 15); do
        sleep 2
        URL=$(grep -o -E "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" "$TN_LOG" 2>/dev/null | head -1)
        [ -n "$URL" ] && { echo "tunnel URL: $URL"; echo "$URL" > "$DIR/tunnel.url"; break; }
      done
      [ -f "$DIR/tunnel.url" ] && cat "$DIR/tunnel.url" || echo "tunnel URL not ready, check $TN_LOG"
    fi
  else
    # 已选中自定义外网地址: Quick Tunnel 不需要, 有残留就关掉
    if kill_tunnel; then
      echo "custom address active, quick tunnel stopped (not needed)"
    else
      echo "custom address active, quick tunnel not started"
    fi
  fi
}

do_stop() {
  if kill_tunnel; then echo "tunnel stopped"; else echo "tunnel not running"; fi
  [ -f "$GW_PID" ] && { kill "$(cat "$GW_PID")" 2>/dev/null && echo "gateway stopped"; rm -f "$GW_PID"; } || echo "gateway not running"
}

do_status() {
  echo "--- gateway ---"
  if pid_running "$GW_PID" "gateway.mjs"; then echo "running (pid $(cat "$GW_PID"))"; else echo "stopped"; fi
  gw_curl GET /__gw/status 2>/dev/null || echo "(no local response)"
  echo; echo "--- tunnel ---"
  if pid_running "$TN_PID" "cloudflared"; then echo "running (pid $(cat "$TN_PID"))"; else echo "stopped"; fi
  [ -f "$DIR/tunnel.url" ] && { echo -n "URL: "; cat "$DIR/tunnel.url"; echo; }
}

do_qr() {
  URL="$(cat "$DIR/tunnel.url" 2>/dev/null || echo "")"
  [ -z "$URL" ] && { echo "no tunnel URL yet, run: gw.sh start"; exit 1; }
  node -e "
require('qrcode').toFile('$DIR/qr-login.png', '$URL', { width: 480, margin: 2 }).then(() => console.log('qr: $DIR/qr-login.png'));
" 2>/dev/null || { cd /tmp && node -e "
require('qrcode').toFile('$DIR/qr-login.png', '$URL', { width: 480, margin: 2 }).then(() => console.log('qr: $DIR/qr-login.png'));
"; }
  echo "scan target: $URL"
}

# 重设口令: 只存 scrypt 哈希; 通过 stdin 传给 node, 不进 ps; 网关热加载无需重启
do_password() {
  local pw="${1:-}"
  if [ -z "$pw" ]; then
    printf '新口令 (至少 6 位, 输入不回显): ' >&2
    IFS= read -rs pw || true
    printf '\n再次输入: ' >&2
    local again=""
    IFS= read -rs again || true
    printf '\n' >&2
    [ "$pw" = "$again" ] || { echo "两次输入不一致" >&2; exit 1; }
  fi
  [ ${#pw} -ge 6 ] || { echo "口令至少 6 位" >&2; exit 1; }
  printf '%s' "$pw" | node -e '
    const fs = require("fs"), crypto = require("crypto");
    const file = process.argv[1];
    const pw = fs.readFileSync(0, "utf8");
    const salt = crypto.randomBytes(16).toString("hex");
    const d = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
    fs.writeFileSync(file, `scrypt$16384$8$1$${salt}$${d}\n`, { mode: 0o600 });
  ' "$DIR/.gw_password"
  echo "口令哈希已更新 (scrypt 加盐)"
  if pid_running "$GW_PID" "gateway.mjs"; then
    local out
    out="$(gw_curl POST /__gw/admin/reload)"
    case "$out" in
      *'"ok":true'*) echo "网关已热加载新口令, 全部会话已失效 (无需重启)" ;;
      *) echo "热加载未成功: $out" >&2; echo "可重启网关生效: gw.sh restart" >&2 ;;
    esac
  else
    echo "网关未运行, 下次启动生效"
  fi
}

do_key_rotate() {
  ensure_admin_token
  local out
  out="$(gw_curl POST /__gw/admin/rotate-key)"
  case "$out" in
    *'"ok":true'*) echo "内部管理密钥已轮换: $ADMIN_FILE (插件会立刻使用新密钥)" ;;
    *) echo "轮换失败: $out" >&2; exit 1 ;;
  esac
}

do_keys() {
  gw_curl GET /__gw/admin/keys
  echo
}

do_sessions_revoke() {
  local out
  out="$(gw_curl POST /__gw/admin/revoke-sessions)"
  case "$out" in
    *'"ok":true'*) echo "已撤销全部登录会话 (所有浏览器需重新登录)" ;;
    *) echo "撤销失败: $out" >&2; exit 1 ;;
  esac
}

case "${1:-status}" in
  start) do_start ;;
  stop) do_stop ;;
  restart) do_stop; sleep 1; do_start ;;
  status) do_status ;;
  qr) do_qr ;;
  tunnel-stop) kill_tunnel && echo "quick tunnel stopped" || echo "quick tunnel not running" ;;
  password) shift; do_password "${1:-}" ;;
  key)
    case "${2:-}" in
      rotate) do_key_rotate ;;
      *) echo "usage: gw.sh key rotate" >&2; exit 1 ;;
    esac
    ;;
  keys) do_keys ;;
  sessions)
    case "${2:-}" in
      revoke) do_sessions_revoke ;;
      *) echo "usage: gw.sh sessions revoke" >&2; exit 1 ;;
    esac
    ;;
  *) echo "usage: gw.sh start|stop|restart|status|qr|tunnel-stop|password [pw]|key rotate|keys|sessions revoke" >&2; exit 1 ;;
esac
