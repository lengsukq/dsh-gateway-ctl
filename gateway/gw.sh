#!/bin/bash
# DSH 远程网关启停脚本: 网关(:3081) + cloudflared Quick Tunnel
# 用法: gw.sh start|stop|status|qr|password <new>
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
GW_LOG="$DIR/gateway.log"
TN_LOG="$DIR/tunnel.log"
GW_PID="$DIR/gateway.pid"
TN_PID="$DIR/tunnel.pid"

gw_port() { echo "${GW_PORT:-3081}"; }

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
  if [ -f "$GW_PID" ] && kill -0 "$(cat "$GW_PID")" 2>/dev/null; then
    echo "gateway already running (pid $(cat "$GW_PID"))"
  else
    [ -z "${GW_PASSWORD:-}" ] && [ ! -f "$DIR/.gw_password" ] && echo "提示: 首次启动将自动生成随机口令, 见 gateway.log 的 FIRST_START_PASSWORD"
    GW_PORT="$(gw_port)" nohup node "$DIR/gateway.mjs" >> "$GW_LOG" 2>&1 &
    echo $! > "$GW_PID"
    echo "gateway started on :$(gw_port) (pid $!)"
    sleep 1
    curl -s "http://127.0.0.1:$(gw_port)/__gw/status" || echo "gateway not responding yet"
    echo
  fi
  if needs_quick_tunnel; then
    if [ -f "$TN_PID" ] && kill -0 "$(cat "$TN_PID")" 2>/dev/null; then
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
  ([ -f "$GW_PID" ] && kill -0 "$(cat "$GW_PID")" 2>/dev/null && echo "running (pid $(cat "$GW_PID"))") || echo "stopped"
  curl -s "http://127.0.0.1:$(gw_port)/__gw/status" 2>/dev/null || echo "(no local response)"
  echo; echo "--- tunnel ---"
  ([ -f "$TN_PID" ] && kill -0 "$(cat "$TN_PID")" 2>/dev/null && echo "running (pid $(cat "$TN_PID"))") || echo "stopped"
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

case "${1:-status}" in
  start) do_start ;;
  stop) do_stop ;;
  restart) do_stop; sleep 1; do_start ;;
  status) do_status ;;
  qr) do_qr ;;
  tunnel-stop) kill_tunnel && echo "quick tunnel stopped" || echo "quick tunnel not running" ;;
  password)
    [ -z "${2:-}" ] && { echo "usage: gw.sh password <new-password>"; exit 1; }
    GW_PORT="$(gw_port)" GW_PASSWORD="$2" node -e "1" 2>/dev/null || true
    node -e "
const crypto=require('crypto'),fs=require('fs');
fs.writeFileSync('$DIR/.gw_password', crypto.createHash('sha256').update(process.argv[1],'utf8').digest('hex')+'\n',{mode:0o600});
console.log('password updated (gateway 必须 restart 生效: gw.sh restart)');
" "$2"
    ;;
  *) echo "usage: gw.sh start|stop|restart|status|qr|tunnel-stop|password <new>"; exit 1 ;;
esac
