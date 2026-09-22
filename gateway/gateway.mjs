// DSH 独立网关: 监听 GW_PORT(默认 3081), 反代 DSH 本体(默认 127.0.0.1:3080).
// 分流规则: Host 为 IP 字面量/localhost => 局域网直连, 免网关鉴权;
//           Host 为域名(Cloudflare Tunnel 进来) => 必须先过网关口令登录.
// 对上游一律改写 Host/Origin 为 loopback, 使 DSH 的浏览器信任围栏放行;
// HTTP 与 WebSocket(upgrade) 均透传. 零第三方依赖.
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = parseInt(process.env.GW_PORT || '3081', 10);
const UP_HOST = process.env.GW_UPSTREAM_HOST || '127.0.0.1';
const UP_PORT = parseInt(process.env.GW_UPSTREAM_PORT || '3080', 10);
const DSH_TOKEN = process.env.GW_DSH_TOKEN || '';
const SESSION_TTL_MS = (parseInt(process.env.GW_SESSION_TTL_H || '24', 10) || 24) * 3600 * 1000;
const DIR = process.env.GW_DIR || path.join(os.homedir(), '.dsh', 'gateway');
const HASH_FILE = path.join(DIR, '.gw_password');
const PW_FILE = path.join(DIR, '.gw_secret');
const CRED_FILE = process.env.GW_CRED_FILE || path.join(os.homedir(), '.dsh', '.credentials.yaml');
const DSH_TOKEN_FILE = path.join(DIR, '.dsh_token');
const COOKIE_NAME = 'gw_session';
const UP_ORIGIN = `http://${UP_HOST}:${UP_PORT}`;

fs.mkdirSync(DIR, { recursive: true });

function sha256hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
function loadHash() {
  try {
    const h = fs.readFileSync(HASH_FILE, 'utf8').trim();
    return /^[0-9a-f]{64}$/.test(h) ? h : null;
  } catch { return null; }
}
function makePassword(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
function loadSecret() {
  try {
    const s = fs.readFileSync(PW_FILE, 'utf8').trim();
    return s.length >= 6 && s.length <= 128 ? s : null;
  } catch { return null; }
}
function persistSecret(pw) {
  fs.writeFileSync(PW_FILE, pw + '\n', { mode: 0o600 });
  const hash = sha256hex(pw);
  fs.writeFileSync(HASH_FILE, hash + '\n', { mode: 0o600 });
  return hash;
}
let passwordHash = loadHash();
// 启动时若带 GW_PASSWORD, 以它为准并同步明文库(管理员本地改密的入口)
if (process.env.GW_PASSWORD) {
  persistSecret(process.env.GW_PASSWORD);
  passwordHash = loadHash();
  console.log('[gw] password updated from GW_PASSWORD');
}
if (!passwordHash) {
  // 老库只有 hash、无明文: 直接生成新口令, 保证展示/登录一致
  const fresh = makePassword(12);
  passwordHash = persistSecret(fresh);
  console.log(`[gw] FIRST_START_PASSWORD=${fresh}`);
} else if (!loadSecret()) {
  // hash 存在但明文丢失(历史版本只存了 hash): 生成新口令接管, 旧口令即刻失效
  const fresh = makePassword(12);
  passwordHash = persistSecret(fresh);
  console.log(`[gw] password rotated (plaintext store missing), NEW_PASSWORD=${fresh}`);
}

// ---- DSH browser-auth 代签: 复刻 dsh-client-connection 的 cookie 算法 ----
// cookie 名: 'dsh-auth-' + base64url(sha256(authority)); authority 恒为上游 127.0.0.1:3080
// (网关把 Host 改写成 loopback, DSH 看到的 authority 永远是上游地址)
const UP_AUTHORITY = `${UP_HOST}:${UP_PORT}`;
function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
function dshCookieName(authority) {
  return 'dsh-auth-' + b64urlEncode(crypto.createHash('sha256').update(authority).digest());
}
const DSH_COOKIE_NAME = dshCookieName(UP_AUTHORITY);
function dshSign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest();
}
function dshEncodeCookie(payload, secret) {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `v1.${body}.${b64urlEncode(dshSign(secret, body))}`;
}
function loadDshSecret() {
  try {
    const text = fs.readFileSync(CRED_FILE, 'utf8');
    const m = text.match(/client-connection\/browser-session:\s*\n(?:[ \t]+[^\n]*\n)*?[ \t]+secret:\s*([A-Za-z0-9_-]+)/);
    if (!m) return null;
    const raw = m[1];
    if (!/^[A-Za-z0-9_-]*$/.test(raw) || raw.length % 4 === 1) return null;
    const pad = '='.repeat((4 - (raw.length % 4)) % 4);
    const bytes = Buffer.from(raw.replaceAll('-', '+').replaceAll('_', '/') + pad, 'base64');
    if (bytes.byteLength !== 32) return null;
    // 规范校验: 重编码必须一致
    if (b64urlEncode(bytes) !== raw) return null;
    return bytes;
  } catch { return null; }
}
let dshSecret = loadDshSecret();
if (dshSecret) console.log('[gw] DSH browser secret loaded, co-sign enabled');
else console.log('[gw] DSH browser secret NOT found, fallback: token redirect only');

function loadDshToken() {
  if (DSH_TOKEN) return DSH_TOKEN;
  try {
    const t = fs.readFileSync(DSH_TOKEN_FILE, 'utf8').trim();
    return t || '';
  } catch { return ''; }
}
function dshAuthCookieHeader() {
  if (!dshSecret) return null;
  const now = Date.now();
  const ttl = 30 * 24 * 3600 * 1000;
  const payload = { version: 1, authority: UP_AUTHORITY, issuedAt: now, expiresAt: now + ttl };
  const value = dshEncodeCookie(payload, dshSecret);
  return `${DSH_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ttl / 1000)}`;
}
// 浏览器是否已带有效的 DSH cookie(只验格式, 真验由 DSH 做)
function clientHasDshCookie(req) {
  const v = parseCookies(req)[DSH_COOKIE_NAME];
  return typeof v === 'string' && v.startsWith('v1.');
}
// 直连(局域网/本机)请求: 网关自动代签, 浏览器无感. 隧道域名请求必须先过网关登录.
// 返回 true 表示本次需要给浏览器补种 DSH cookie(响应头合并 Set-Cookie)
function needsDirectCosign(req) {
  return !!dshSecret && !clientHasDshCookie(req) && isDirect(req);
}
function mergeSetCookie(headers, extra) {
  const out = { ...headers };
  const prev = out['set-cookie'];
  if (prev === undefined) out['set-cookie'] = [extra];
  else if (Array.isArray(prev)) out['set-cookie'] = [...prev, extra];
  else out['set-cookie'] = [prev, extra];
  return out;
}
// 登录成功后同时种下 DSH cookie(两个 Set-Cookie), 浏览器直达 DSH, 不再弹 token 页
function setLoginCookies(res, secure) {
  const tok = crypto.randomBytes(32).toString('hex');
  sessions.set(tok, Date.now() + SESSION_TTL_MS);
  const parts = [`${COOKIE_NAME}=${tok}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`];
  if (secure) parts.push('Secure');
  const cookies = [parts.join('; ')];
  const dsh = dshAuthCookieHeader();
  if (dsh) cookies.push(dsh + (secure ? '; Secure' : ''));
  res.setHeader('set-cookie', cookies);
}

// token -> expiresAt
const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [tok, exp] of sessions) if (exp <= now) sessions.delete(tok);
}, 60_000).unref();

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** 直连判定: Host 是 IP 字面量或 localhost => 局域网/本机, 免鉴权; 域名 => 隧道, 强制登录. */
function isDirect(req) {
  const host = (req.headers.host || '').split(':')[0].toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost') return true;
  return net.isIP(host) !== 0;
}

function hasSession(req) {
  const tok = parseCookies(req)[COOKIE_NAME];
  if (!tok || !/^[0-9a-f]{64}$/.test(tok)) return false;
  const exp = sessions.get(tok);
  if (!exp || exp <= Date.now()) {
    sessions.delete(tok);
    return false;
  }
  return true;
}

function allowed(req) {
  return isDirect(req) || hasSession(req);
}

function wantsJson(req) {
  if (req.url && req.url.startsWith('/api')) return true;
  const a = req.headers.accept || '';
  return a.includes('application/json') && !a.includes('text/html');
}

function deny(req, res) {
  if (wantsJson(req)) {
    res.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'gateway auth required', login: '/__gw/login' }));
  } else {
    res.writeHead(303, { location: '/__gw/login', 'cache-control': 'no-store' });
    res.end();
  }
}

function setSessionCookie(res, secure) {
  // 兼容保留: 新登录统一走 setLoginCookies(同时种 DSH cookie)
  setLoginCookies(res, secure);
}

function clearSessionCookie(res, req) {
  const tok = parseCookies(req)[COOKIE_NAME];
  if (tok) sessions.delete(tok);
  res.setHeader('set-cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function loginPage(error) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>DSH 远程网关验证</title>
  <style>
    :root {
      --bg: #090b10;
      --card-bg: rgba(18, 22, 34, 0.85);
      --border: rgba(255, 255, 255, 0.1);
      --border-focus: #3b82f6;
      --text-primary: #f3f4f6;
      --text-secondary: #9ca3af;
      --brand: #3b82f6;
      --brand-hover: #2563eb;
      --error: #ef4444;
      --error-bg: rgba(239, 68, 68, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.15) 0%, transparent 60%),
        radial-gradient(circle at 100% 100%, rgba(99, 102, 241, 0.08) 0%, transparent 40%);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      width: 100%;
      max-width: 380px;
      background: var(--card-bg);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 36px 28px;
      box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
      text-align: center;
      animation: fadeIn 0.3s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.96) translateY(6px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .icon-badge {
      width: 52px;
      height: 52px;
      margin: 0 auto 16px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.2));
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #60a5fa;
      box-shadow: 0 8px 16px -4px rgba(59, 130, 246, 0.2);
    }
    h1 {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    p {
      margin: 0 0 20px;
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }
    .alert {
      background: var(--error-bg);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: var(--error);
      padding: 9px 12px;
      border-radius: 10px;
      font-size: 13px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      animation: shake 0.35s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }
    @keyframes shake {
      10%, 90% { transform: translate3d(-1px, 0, 0); }
      20%, 80% { transform: translate3d(2px, 0, 0); }
      30%, 50%, 70% { transform: translate3d(-3px, 0, 0); }
      40%, 60% { transform: translate3d(3px, 0, 0); }
    }
    .pw-wrap {
      position: relative;
      margin-bottom: 18px;
    }
    input {
      width: 100%;
      background: rgba(10, 13, 20, 0.7);
      border: 1px solid var(--border);
      color: var(--text-primary);
      border-radius: 12px;
      padding: 12px 46px 12px 14px;
      font-size: 15px;
      outline: none;
      transition: all 0.2s;
    }
    input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
    }
    .pw-toggle {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 18px;
      cursor: pointer;
      padding: 6px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
    }
    .pw-toggle:hover { color: var(--text-primary); }
    button.submit {
      width: 100%;
      background: var(--brand);
      border: none;
      color: #ffffff;
      border-radius: 12px;
      padding: 12px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
      transition: all 0.2s;
    }
    button.submit:hover {
      background: var(--brand-hover);
      box-shadow: 0 6px 18px rgba(59, 130, 246, 0.45);
      transform: translateY(-1px);
    }
    button.submit:active { transform: translateY(0); }
    .hint {
      margin-top: 20px;
      font-size: 12px;
      color: #6b7280;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-badge">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    </div>
    <h1>DSH 远程安全网关</h1>
    <p>外网访问已受保护，请输入访问口令验证后进入桌面</p>
    ${error ? `<div class="alert"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> 口令错误，请重新输入</div>` : ''}
    <form method="post" action="/__gw/login">
      <div class="pw-wrap">
        <input id="pw" type="password" name="password" placeholder="请输入网关访问口令" autofocus autocomplete="current-password" required>
        <button class="pw-toggle" type="button" id="pwToggle" title="显示/隐藏口令" aria-label="显示/隐藏口令">
          <svg id="eyeOpen" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <svg id="eyeClosed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
        </button>
      </div>
      <button class="submit" type="submit">立即进入</button>
    </form>
    <div class="hint">同一局域网/WiFi 下直连网关 IP 可免密访问</div>
  </div>
  <script>
    (function(){
      var input = document.getElementById('pw');
      var btn = document.getElementById('pwToggle');
      var eyeOpen = document.getElementById('eyeOpen');
      var eyeClosed = document.getElementById('eyeClosed');
      btn.onclick = function() {
        var isText = input.type === 'text';
        input.type = isText ? 'password' : 'text';
        eyeOpen.style.display = isText ? 'block' : 'none';
        eyeClosed.style.display = isText ? 'none' : 'block';
      };
    })();
  </script>
</body>
</html>`;
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** 改写透传头: Host/Origin/Referer 指回 loopback 上游, 让 DSH 信任围栏放行. */
function upstreamHeaders(req, incomingHost) {
  const h = { ...req.headers };
  h.host = `${UP_HOST}:${UP_PORT}`;
  for (const k of ['origin', 'referer']) {
    if (typeof h[k] === 'string' && incomingHost) {
      h[k] = h[k].split(incomingHost).join(`${UP_HOST}:${UP_PORT}`);
    }
  }
  h['x-forwarded-host'] = incomingHost;
  h['x-forwarded-proto'] = isDirect(req) ? 'http' : 'https';
  delete h['proxy-authorization'];
  delete h['proxy-authenticate'];
  // 网关要对 HTML 做字符串注入, 必须拿到明文: 需要注入的请求声明只要
  // identity, 上游不再 gzip, 避免"压缩字节+无压缩头"导致浏览器乱码.
  // 非注入请求保持原 accept-encoding(透传压缩更省流量).
  if (req.__gwInject) h['accept-encoding'] = 'identity';
  // 直连首刷: 浏览器还没有 DSH cookie, 网关把代签 cookie 直接塞进上游请求,
  // DSH 当场 200(而不是 401), 首刷即进, 无需二次刷新
  if (needsDirectCosign(req)) {
    const full = dshAuthCookieHeader();
    const pair = full ? full.split(';')[0] : null;
    if (pair) {
      const prev = typeof h.cookie === 'string' && h.cookie ? h.cookie + '; ' : '';
      h.cookie = prev + pair;
    }
  }
  return h;
}

function proxyHttp(req, res) {
  const incomingHost = req.headers.host || '';
  // 根路径的 index.html 需要注入网关悬浮按钮(扫码/设置), 其它一律直透
  let pathname = '/';
  try { pathname = new URL(req.url || '/', 'http://gw.invalid').pathname; } catch { /* keep */ }
  const inject = req.method === 'GET' && (pathname === '/' || pathname === '/index.html');
  req.__gwInject = inject;
  const up = http.request(
    { host: UP_HOST, port: UP_PORT, method: req.method, path: req.url, headers: upstreamHeaders(req, incomingHost) },
    (upRes) => {
      const ctype = String(upRes.headers['content-type'] || '');
      const cosign = needsDirectCosign(req) ? dshAuthCookieHeader() : null;
      if (!inject || !ctype.includes('text/html')) {
        res.writeHead(upRes.statusCode || 502, cosign ? mergeSetCookie(upRes.headers, cosign) : upRes.headers);
        upRes.pipe(res);
        return;
      }
      const chunks = [];
      upRes.on('data', (c) => chunks.push(c));
      upRes.on('end', () => {
        try {
          let html = Buffer.concat(chunks).toString('utf8');
          html = injectWidget(html, incomingHost);
          let headers = { ...upRes.headers };
          delete headers['content-length'];
          delete headers['content-encoding'];
          if (cosign) headers = mergeSetCookie(headers, cosign);
          res.writeHead(upRes.statusCode || 200, headers);
          res.end(html);
        } catch {
          res.writeHead(upRes.statusCode || 502, cosign ? mergeSetCookie(upRes.headers, cosign) : upRes.headers);
          res.end(Buffer.concat(chunks));
        }
      });
      upRes.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
    }
  );
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('gateway: upstream unreachable\n');
  });
  req.pipe(up);
}

// ---- 页面注入: 右下角悬浮按钮 + 扫码/设置弹框 ----
function publicBase(incomingHost) {
  const host = String(incomingHost || '').split(':')[0].toLowerCase().replace(/^\[|\]$/g, '');
  const direct = host === 'localhost' || net.isIP(host) !== 0;
  return `${direct ? 'http' : 'https'}://${incomingHost}`;
}
// 二维码: 用网关目录自带的 qrcode 包实时生成 PNG(经过验证的可靠实现)
let QR_LIB = null;
try {
  const mod = await import('./node_modules/qrcode/lib/index.js');
  QR_LIB = mod.default || mod;
  console.log('[gw] qrcode lib loaded');
} catch (e) {
  console.log('[gw] qrcode lib missing, /__gw/qr disabled:', String((e && e.message) || e));
}
function qrPngBuffer(text) {
  if (!QR_LIB) throw new Error('qrcode unavailable');
  return new Promise((resolve, reject) => {
    QR_LIB.toBuffer(text, { width: 480, margin: 2 }, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}
function injectWidget(html, incomingHost) {
  // 侧栏已有插件入口(扫码远程按钮), 页面内悬浮按钮不再需要, 直接去掉避免重复。
  // 保留函数签名供 proxyHttp 调用, 仅返回原 HTML。
  return html;
}

function proxyUpgrade(req, socket, head) {
  const incomingHost = req.headers.host || '';
  const h = upstreamHeaders(req, incomingHost);
  const lines = [`${req.method} ${req.url} HTTP/1.1`];
  for (const [k, v] of Object.entries(h)) {
    if (Array.isArray(v)) {
      for (const item of v) lines.push(`${k}: ${item}`);
    } else if (v !== undefined) {
      lines.push(`${k}: ${v}`);
    }
  }
  const up = net.connect(UP_PORT, UP_HOST, () => {
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head && head.length) up.write(head);
    socket.pipe(up);
    up.pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://gw.invalid');
    if (url.pathname === '/__gw/login') {
      if (req.method === 'POST') {
        let body = '';
        try { body = await readBody(req); } catch { res.writeHead(413); res.end(); return; }
        const pw = new URLSearchParams(body).get('password') || '';
        const ok = passwordHash &&
          crypto.timingSafeEqual(Buffer.from(sha256hex(pw), 'hex'), Buffer.from(passwordHash, 'hex'));
        if (ok) {
          setLoginCookies(res, !isDirect(req));
          // DSH cookie 已代签, 直接进根路径; 极少数密钥轮换时 DSH 会再跳 token 页, 用户手动补一次即可
          const tok = loadDshToken();
          res.writeHead(303, { location: tok ? `/?token=${tok}` : '/', 'cache-control': 'no-store' });
          res.end();
        } else {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(loginPage(true));
        }
        return;
      }
      if (hasSession(req)) {
        const tok = loadDshToken();
        res.writeHead(303, { location: tok ? `/?token=${tok}` : '/', 'cache-control': 'no-store' });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(loginPage(false));
      return;
    }
    if (url.pathname === '/__gw/logout') {
      clearSessionCookie(res, req);
      res.writeHead(303, { location: '/__gw/login', 'cache-control': 'no-store' });
      res.end();
      return;
    }
    if (url.pathname === '/__gw/password') {
      // 改口令: 局域网直连(可信内网)或已登录 session 可调; 热重载 hash, 无需重启网关
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'POST only' }));
        return;
      }
      if (!isDirect(req) && !hasSession(req)) {
        deny(req, res);
        return;
      }
      let body = '';
      try { body = await readBody(req); } catch { res.writeHead(413); res.end(); return; }
      let pw = '';
      try {
        const parsed = JSON.parse(body);
        pw = String((parsed && parsed.password) || '');
      } catch {
        pw = new URLSearchParams(body).get('password') || '';
      }
      if (pw.length < 6 || pw.length > 128) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: '口令长度需 6-128 位' }));
        return;
      }
      passwordHash = persistSecret(pw);
      // 口令已换, 旧 session 全部作废(防旧口令持有者继续用)
      sessions.clear();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === '/__gw/reveal') {
      // 取回当前口令明文: 局域网直连(可信内网)或已登录 session 可调
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'POST only' }));
        return;
      }
      if (!allowed(req)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: '请先登录后再查看' }));
        return;
      }
      const secret = loadSecret();
      if (!secret) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: '口令库不可读' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, password: secret }));
      return;
    }
    if (url.pathname === '/__gw/rotate') {
      // 随机生成并立即更换口令: 局域网直连(可信内网)或已登录 session 可调
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'POST only' }));
        return;
      }
      if (!allowed(req)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: '请先登录后再更换' }));
        return;
      }
      const fresh = makePassword(12);
      passwordHash = persistSecret(fresh);
      sessions.clear();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, password: fresh }));
      return;
    }
    if (url.pathname === '/__gw/status') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        listen: PORT,
        upstream: `${UP_HOST}:${UP_PORT}`,
        direct: isDirect(req),
        authed: hasSession(req),
        dshCosign: !!dshSecret,
        time: new Date().toISOString(),
      }));
      return;
    }
    if (url.pathname === '/__gw/qr') {
      // 二维码内容: 默认当前访问域根地址(智能入口会自动跳登录页), 可用 ?u= 覆盖
      const target = url.searchParams.get('u') || publicBase(req.headers.host || '');
      if (!/^https?:\/\/[^/]+(\/.*)?$/.test(target) || target.length > 512) {
        res.writeHead(400);
        res.end('bad url');
        return;
      }
      try {
        const png = await qrPngBuffer(target);
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'content-length': png.length });
        res.end(png);
      } catch (e) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('qr unavailable\n');
      }
      return;
    }
    // 根路径智能入口(仅域名访问时): 未登录 -> 跳登录页; 已登录 -> 进 DSH。
    // 局域网直连保持原样直透(免登)。这样 https://<你的域名>/ 可直达，
    // 无需手动拼 /__gw/login。
    if ((url.pathname === '/' || url.pathname === '/index.html') && !isDirect(req) && req.method === 'GET') {
      if (!hasSession(req)) {
        res.writeHead(303, { location: '/__gw/login', 'cache-control': 'no-store' });
        res.end();
        return;
      }
    }
    if (!allowed(req)) {
      deny(req, res);
      return;
    }
    proxyHttp(req, res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500);
    res.end('gateway error\n');
  }
});

server.on('upgrade', (req, socket, head) => {
  if (!allowed(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\ncontent-length: 0\r\nconnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  proxyUpgrade(req, socket, head);
});

server.on('clientError', (_err, socket) => socket.destroy());
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[gw] listen 0.0.0.0:${PORT} -> ${UP_HOST}:${UP_PORT} (direct=bypass, domain=login)`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
