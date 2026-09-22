// DSH 独立网关: 监听 GW_PORT(默认 3081), 反代 DSH 本体(默认 127.0.0.1:3080).
// 安全模型:
// 1. Pairing Token + Device Credential: 一次性扫码配对令牌 (90秒)，彻底消除 URL 中的主密码
// 2. 独立设备体系 (devices.json): 每台扫码设备分配独立 Device Token，支持设备列表展示与一键撤销
// 3. 彻底抹除明文密码存储: 仅保留加盐 scrypt 哈希 (.gw_password)，安全擦除 .gw_secret
// 4. 基于真实客户端 IP & CIDR 规范判定局域网，杜绝 Host 头伪造
// 5. 局域网密码保护可选开关 (lanAuth: true/false)
// 6. 登录失败限流与指数退避（5次失败后锁定）
// 7. 结构化访问审计日志与自动轮转 (~/.dsh/gateway/access.log)
// 8. DSH 3080 端口暴露主动检测与防穿透警示
// 9. CORS 严格白名单收敛，杜绝带凭证的任意 Origin 泛反射
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
const DEVICE_TTL_MS = 365 * 24 * 3600 * 1000; // 设备凭证默认有效期 1 年 (可在控制台随时撤销)
const DIR = process.env.GW_DIR || path.join(os.homedir(), '.dsh', 'gateway');
const HASH_FILE = path.join(DIR, '.gw_password');
const PW_FILE = path.join(DIR, '.gw_secret');
const CONFIG_FILE = path.join(DIR, 'config.json');
const ACCESS_LOG_FILE = path.join(DIR, 'access.log');
const DEVICES_FILE = path.join(DIR, 'devices.json');
const REMOTES_FILE = path.join(DIR, 'remotes.json');
const CRED_FILE = process.env.GW_CRED_FILE || path.join(os.homedir(), '.dsh', '.credentials.yaml');
const DSH_TOKEN_FILE = path.join(DIR, '.dsh_token');
const COOKIE_NAME = 'gw_session';
const DEVICE_COOKIE_NAME = 'gw_device';
const UP_ORIGIN = `http://${UP_HOST}:${UP_PORT}`;

fs.mkdirSync(DIR, { recursive: true });

// ---- 安全擦除历史明文密码文件 (.gw_secret) ----
function secureShredFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const zeros = Buffer.alloc(stat.size);
      fs.writeFileSync(filePath, zeros);
      fs.unlinkSync(filePath);
      console.log(`[gw-security] ✓ securely shredded legacy plaintext secret file: ${filePath}`);
    }
  } catch (e) {
    console.error(`[gw-security] failed to shred ${filePath}:`, e.message);
  }
}

// 启动时立即安全擦除明文密码文件
secureShredFile(PW_FILE);

// ---- 网关全局安全配置 (config.json) ----
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      // 默认开启局域网密码保护，除非用户在 config.json 明确设为 false
      lanAuth: parsed && typeof parsed.lanAuth === 'boolean' ? parsed.lanAuth : true,
    };
  } catch {
    return { lanAuth: true };
  }
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  } catch (e) {
    console.error('[gw] saveConfig error:', e);
  }
}

let gwConfig = loadConfig();

// ---- 密码加盐 scrypt 散列与旧 SHA-256 兼容验证 ----
function hashPasswordScrypt(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${derived}`;
}

function verifyPassword(pw, stored) {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 6) return false;
    const [, N, r, p, salt, hash] = parts;
    const derived = crypto.scryptSync(pw, salt, 64, { N: parseInt(N, 10), r: parseInt(r, 10), p: parseInt(p, 10) });
    const expected = Buffer.from(hash, 'hex');
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  }
  // 兼容旧版纯 SHA-256 (64 hex)
  const h = crypto.createHash('sha256').update(pw, 'utf8').digest('hex');
  const expected = Buffer.from(stored, 'hex');
  const actual = Buffer.from(h, 'hex');
  const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (match) {
    // 验证成功后升级为 scrypt
    try {
      persistPasswordHash(pw);
      console.log('[gw] auto-upgraded legacy SHA-256 hash to scrypt');
    } catch {}
  }
  return match;
}

function loadHash() {
  try {
    const h = fs.readFileSync(HASH_FILE, 'utf8').trim();
    return h ? h : null;
  } catch { return null; }
}

function makeRandomPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function persistPasswordHash(pw) {
  const hash = hashPasswordScrypt(pw);
  fs.writeFileSync(HASH_FILE, hash + '\n', { mode: 0o600 });
  passwordHash = hash;
  return hash;
}

let passwordHash = loadHash();
if (process.env.GW_PASSWORD) {
  persistPasswordHash(process.env.GW_PASSWORD);
  console.log('[gw] password updated from GW_PASSWORD');
}

if (!passwordHash) {
  const fresh = makeRandomPassword(12);
  passwordHash = persistPasswordHash(fresh);
  console.log(`\x1b[32m[gw] FIRST_START_PASSWORD=${fresh} (请妥善保存此密码，可在本机终端通过 gw.sh password <new> 重置)\x1b[0m`);
}

// ---- 设备凭证管理 (devices.json) ----
function loadDevices() {
  try {
    const raw = fs.readFileSync(DEVICES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDevices(list) {
  try {
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(list, null, 2) + '\n', { mode: 0o600 });
  } catch (e) {
    console.error('[gw] saveDevices error:', e);
  }
}

function parseDeviceName(ua) {
  if (!ua) return '移动设备';
  let os = '未知设备';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = '';
  if (/MicroMessenger/i.test(ua)) browser = '微信';
  else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Edg/i.test(ua)) browser = 'Edge';

  return browser ? `${os} · ${browser}` : os;
}

function hashToken(tok) {
  return crypto.createHash('sha256').update(tok, 'utf8').digest('hex');
}

// ---- 一次性配对令牌 (Pairing Token) 管理 ----
// key: pairToken (base64url) -> { createdAt, expiresAt, used }
const pairingTokens = new Map();

function createPairingToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const ttlMs = 90 * 1000; // 90 秒有效
  const record = {
    token,
    createdAt: now,
    expiresAt: now + ttlMs,
    used: false,
  };
  pairingTokens.set(token, record);
  return record;
}

function consumePairingToken(token) {
  if (!token || typeof token !== 'string') return null;
  const record = pairingTokens.get(token);
  if (!record) return null;
  const now = Date.now();
  if (record.used || record.expiresAt <= now) {
    pairingTokens.delete(token);
    return null;
  }
  // 消费即标记作废
  record.used = true;
  pairingTokens.delete(token);
  return record;
}

setInterval(() => {
  const now = Date.now();
  for (const [t, r] of pairingTokens) {
    if (r.expiresAt <= now || r.used) pairingTokens.delete(t);
  }
}, 30_000).unref();

// ---- 真实客户端 IP 提取与私网 CIDR 判定算法 ----
function getClientIp(req) {
  const sockIp = (req.socket && req.socket.remoteAddress) || '';
  const cleanSock = sockIp.replace(/^::ffff:/, '').trim();

  // 若直接连接来自回环 (127.0.0.1 / ::1 / localhost)，信任反代头
  if (cleanSock === '127.0.0.1' || cleanSock === '::1') {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim().replace(/^::ffff:/, '');
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const first = xff.split(',')[0].trim().replace(/^::ffff:/, '');
      if (first) return first;
    }
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real.trim()) return real.trim().replace(/^::ffff:/, '');
  }

  return cleanSock || '127.0.0.1';
}

function ipv4ToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return parts.reduce((acc, octet) => ((acc << 8) + (parseInt(octet, 10) & 0xff)) >>> 0, 0);
}

function inIpv4Cidr(ip, cidr) {
  const [netIp, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(netIp) & mask);
}

function isPrivateLanIp(ip) {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (/^fe80:/i.test(ip) || /^fc00:/i.test(ip) || /^fd00:/i.test(ip)) return true;
  if (!net.isIPv4(ip)) return false;

  if (inIpv4Cidr(ip, '127.0.0.0/8')) return true;
  if (inIpv4Cidr(ip, '10.0.0.0/8')) return true;
  if (inIpv4Cidr(ip, '172.16.0.0/12')) return true;
  if (inIpv4Cidr(ip, '192.168.0.0/16')) return true;
  if (inIpv4Cidr(ip, '100.64.0.0/10')) return true; // Tailscale / CGNAT
  if (inIpv4Cidr(ip, '169.254.0.0/16')) return true; // Link-local
  return false;
}

function isLocalhostRequest(req) {
  const sockIp = (req.socket && req.socket.remoteAddress) || '';
  const cleanSock = sockIp.replace(/^::ffff:/, '').trim();
  if (cleanSock !== '127.0.0.1' && cleanSock !== '::1') return false;
  if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip']) {
    return false;
  }
  return true;
}

// ---- 防暴力破解限流器 (RateLimiter) ----
const failedAttempts = new Map();

function checkRateLimit(ip) {
  const record = failedAttempts.get(ip);
  if (!record) return { allowed: true };
  if (record.lockedUntil && record.lockedUntil > Date.now()) {
    const remainSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { allowed: false, remainSec };
  }
  return { allowed: true };
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const record = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) {
    const exponent = Math.min(record.count - 5, 4);
    const delays = [30, 60, 120, 300, 900];
    const delaySec = delays[exponent];
    record.lockedUntil = now + delaySec * 1000;
  }
  failedAttempts.set(ip, record);
}

function resetLoginFailure(ip) {
  failedAttempts.delete(ip);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of failedAttempts) {
    if (rec.lockedUntil && rec.lockedUntil <= now && rec.count >= 5) {
      failedAttempts.delete(ip);
    }
  }
}, 60_000).unref();

// ---- 结构化安全访问审计日志 (access.log) ----
function appendAccessLog(event) {
  try {
    try {
      const st = fs.statSync(ACCESS_LOG_FILE);
      if (st.size > 2 * 1024 * 1024) {
        fs.renameSync(ACCESS_LOG_FILE, ACCESS_LOG_FILE + '.1');
      }
    } catch {}

    const entry = JSON.stringify({
      time: new Date().toISOString(),
      ...event,
    });
    fs.appendFileSync(ACCESS_LOG_FILE, entry + '\n', 'utf8');
  } catch (e) {
    console.error('[gw] log error:', e);
  }
}

// ---- DSH 3080 端口暴露主动检测 ----
function checkPort3080Exposure() {
  return new Promise((resolve) => {
    let lanIps = [];
    try {
      for (const list of Object.values(os.networkInterfaces())) {
        for (const iface of list || []) {
          if (iface && iface.family === 'IPv4' && !iface.internal) {
            lanIps.push(iface.address);
          }
        }
      }
    } catch {}

    const targetIp = lanIps.find((ip) => isPrivateLanIp(ip) && !ip.startsWith('127.'));
    if (!targetIp) {
      resolve({ exposed: false, checkedIp: 'none' });
      return;
    }

    const sock = new net.Socket();
    let settled = false;
    sock.setTimeout(1200);

    sock.on('connect', () => {
      if (!settled) {
        settled = true;
        sock.destroy();
        resolve({ exposed: true, checkedIp: targetIp });
      }
    });
    sock.on('timeout', () => {
      if (!settled) {
        settled = true;
        sock.destroy();
        resolve({ exposed: false, checkedIp: targetIp });
      }
    });
    sock.on('error', () => {
      if (!settled) {
        settled = true;
        sock.destroy();
        resolve({ exposed: false, checkedIp: targetIp });
      }
    });

    sock.connect(UP_PORT, targetIp);
  });
}

checkPort3080Exposure().then((res) => {
  if (res.exposed) {
    console.warn(`\x1b[31m[gw-security] ⚠️ 警告: 检测到 DSH 3080 端口已直接暴露在局域网 IP (${res.checkedIp})！\x1b[0m`);
  } else {
    console.log(`[gw-security] ✓ DSH 3080 端口受限状态正常（未向局域网暴露）`);
  }
});

// ---- DSH browser-auth 代签: 复刻 dsh-client-connection 的 cookie 算法 ----
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
  const payload = {
    version: 1,
    authority: UP_AUTHORITY,
    issuedAt: now,
    expiresAt: now + 30 * 24 * 3600 * 1000,
  };
  const val = dshEncodeCookie(payload, dshSecret);
  return `${DSH_COOKIE_NAME}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`;
}

function isReqHttps(req) {
  return (req.headers && req.headers['x-forwarded-proto'] === 'https') || !!(req.socket && req.socket.encrypted);
}

// 登录成功后种下会话 Cookie (含 DSH 代签)
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

// 为配对成功的设备签发专属设备凭证
function setDeviceCookies(res, deviceRawToken, secure) {
  const parts = [`${DEVICE_COOKIE_NAME}=${deviceRawToken}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(DEVICE_TTL_MS / 1000)}`];
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

// 鉴权判定：同时支持 普通会话 (gw_session) 或 独立设备凭证 (gw_device)
function hasSession(req) {
  const cookies = parseCookies(req);

  // 1. 检查短期网页会话
  const sessTok = cookies[COOKIE_NAME];
  if (sessTok && /^[0-9a-f]{64}$/.test(sessTok)) {
    const exp = sessions.get(sessTok);
    if (exp && exp > Date.now()) return true;
    if (exp) sessions.delete(sessTok);
  }

  // 2. 检查独立设备凭证
  const devTok = cookies[DEVICE_COOKIE_NAME];
  if (devTok && typeof devTok === 'string' && devTok.length >= 32) {
    const thash = hashToken(devTok);
    const devices = loadDevices();
    const hit = devices.find((d) => d.tokenHash === thash && d.status === 'active');
    if (hit) {
      // 触碰活跃时间 (每 5 分钟更新一次避免频繁写盘)
      const now = Date.now();
      const last = hit.lastActiveAt ? new Date(hit.lastActiveAt).getTime() : 0;
      if (now - last > 5 * 60 * 1000) {
        hit.lastActiveAt = new Date().toISOString();
        hit.lastIp = getClientIp(req);
        saveDevices(devices);
      }
      return true;
    }
  }

  return false;
}

/** 访问放行核心判定: 基于 IP、CIDR 与安全配置 */
function allowed(req) {
  if (isLocalhostRequest(req)) return true;
  if (hasSession(req)) return true;

  const clientIp = getClientIp(req);
  if (isPrivateLanIp(clientIp)) {
    if (gwConfig.lanAuth) return false;
    return true;
  }
  return false;
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

function clearSessionCookie(res, req) {
  const tok = parseCookies(req)[COOKIE_NAME];
  if (tok) sessions.delete(tok);
  res.setHeader('set-cookie', [
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    `${DEVICE_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  ]);
}

function loginPage(errorText, lockedSec) {
  const isLocked = Boolean(lockedSec && lockedSec > 0);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>DSH 远程网关验证</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --border-focus: #0284c7;
      --text-primary: #0f172a;
      --text-secondary: #64748b;
      --brand: #0284c7;
      --brand-hover: #0369a1;
      --error: #ef4444;
      --error-bg: #fef2f2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(14, 165, 233, 0.15) 0%, transparent 65%),
        radial-gradient(circle at 100% 100%, rgba(56, 189, 248, 0.08) 0%, transparent 40%);
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
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 36px 28px;
      box-shadow: 0 20px 45px -10px rgba(14, 116, 144, 0.12), 0 0 0 1px rgba(226, 232, 240, 0.6);
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
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0284c7;
      box-shadow: 0 6px 16px -4px rgba(2, 132, 199, 0.2);
    }
    h1 {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
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
      border: 1px solid #fecdd3;
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
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: var(--text-primary);
      border-radius: 12px;
      padding: 12px 46px 12px 14px;
      font-size: 15px;
      outline: none;
      transition: all 0.2s;
    }
    input:focus {
      background: #ffffff;
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.2);
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
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
      transition: all 0.2s;
    }
    button.submit:hover:not(:disabled) {
      background: var(--brand-hover);
      box-shadow: 0 6px 18px rgba(2, 132, 199, 0.45);
      transform: translateY(-1px);
    }
    button.submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }
    .hint {
      margin-top: 20px;
      font-size: 12px;
      color: #94a3b8;
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
    <p>访问已受安全防护，请输入访问口令验证后进入桌面</p>
    ${errorText ? `<div class="alert"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> ${errorText}</div>` : ''}
    <form method="post" action="/__gw/login">
      <div class="pw-wrap">
        <input id="pw" type="password" name="password" placeholder="请输入网关访问口令" autofocus autocomplete="current-password" required ${isLocked ? 'disabled' : ''}>
        <button class="pw-toggle" type="button" id="pwToggle" title="显示/隐藏口令" aria-label="显示/隐藏口令" ${isLocked ? 'disabled' : ''}>
          <svg id="eyeOpen" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <svg id="eyeClosed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
        </button>
      </div>
      <button class="submit" id="subBtn" type="submit" ${isLocked ? 'disabled' : ''}>${isLocked ? `已锁定 (${lockedSec}s)` : '立即进入'}</button>
    </form>
    <div class="hint">安全提示：支持一次性二维码配对、设备独立撤销与加盐 scrypt 强哈希防护</div>
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
      var locked = ${lockedSec || 0};
      if (locked > 0) {
        var subBtn = document.getElementById('subBtn');
        var timer = setInterval(function() {
          locked--;
          if (locked <= 0) {
            clearInterval(timer);
            location.reload();
          } else {
            subBtn.textContent = '已锁定 (' + locked + 's)';
          }
        }, 1000);
      }
    })();
  </script>
</body>
</html>`;
}

function pairErrorPage(msg) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>配对失效 - DSH 远程网关</title>
  <style>
    body {
      margin: 0; min-height: 100vh; background: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .card {
      max-width: 360px; width: 100%; background: #ffffff; border: 1px solid #e2e8f0;
      border-radius: 20px; padding: 32px 24px; text-align: center;
      box-shadow: 0 20px 40px -10px rgba(0,0,0,0.08);
    }
    .icon { font-size: 40px; margin-bottom: 12px; }
    h1 { font-size: 18px; margin: 0 0 8px; color: #0f172a; }
    p { font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 20px; }
    a {
      display: inline-block; background: #0284c7; color: #fff; text-decoration: none;
      padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⌛</div>
    <h1>配对链接已失效</h1>
    <p>${msg || '该一次性配对令牌已过期或已被使用。为保障安全，请在电脑端重新刷新二维码后再次扫码。'}</p>
    <a href="/__gw/login">前往普通口令登录</a>
  </div>
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
  h['x-forwarded-proto'] = isReqHttps(req) ? 'https' : 'http';
  delete h['proxy-authorization'];
  delete h['proxy-authenticate'];
  if (req.__gwInject) h['accept-encoding'] = 'identity';
  return h;
}

function proxyHttp(req, res) {
  const incomingHost = req.headers.host || '';
  const pathname = new URL(req.url || '/', 'http://x').pathname;
  const clientIp = getClientIp(req);

  const opts = {
    host: UP_HOST,
    port: UP_PORT,
    method: req.method,
    path: req.url,
    headers: upstreamHeaders(req, incomingHost),
  };

  const up = http.request(opts, (upRes) => {
    let headers = { ...upRes.headers };
    if (upRes.statusCode >= 300 && upRes.statusCode < 400 && headers.location) {
      headers.location = headers.location.split(`${UP_HOST}:${UP_PORT}`).join(incomingHost);
    }
    res.writeHead(upRes.statusCode || 200, headers);
    upRes.pipe(res);
  });

  up.on('error', (err) => {
    console.error(`[gw] upstream error for ${req.url}:`, err.message);
    appendAccessLog({ ip: clientIp, method: req.method, path: pathname, status: 'UPSTREAM_ERROR', ua: req.headers['user-agent'] || '', note: err.message });
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`gateway bad gateway: upstream ${UP_HOST}:${UP_PORT} unreachable\n`);
    }
  });

  req.pipe(up);
}

function proxyUpgrade(req, socket, head) {
  const incomingHost = req.headers.host || '';
  const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
  const h = upstreamHeaders(req, incomingHost);
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

let qrcodeLib = null;
async function qrPngBuffer(text) {
  if (!qrcodeLib) {
    try {
      const qm = await import('./node_modules/qrcode/lib/index.js');
      qrcodeLib = qm.default || qm;
    } catch {
      const qm = await import('qrcode');
      qrcodeLib = qm.default || qm;
    }
  }
  return qrcodeLib.toBuffer(text, { width: 360, margin: 2, errorCorrectionLevel: 'M' });
}

// 检查是否为合法的受信任 Origin (CORS 白名单)
function isTrustedOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    // 1. 本机与回环
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    // 2. 局域网私网
    if (isPrivateLanIp(host)) return true;
    // 3. remotes.json 中配置的合法远程域
    try {
      if (fs.existsSync(REMOTES_FILE)) {
        const s = JSON.parse(fs.readFileSync(REMOTES_FILE, 'utf8'));
        if (s && Array.isArray(s.remotes)) {
          if (s.remotes.some((r) => r && r.baseUrl && new URL(r.baseUrl).origin === origin)) {
            return true;
          }
        }
      }
    } catch {}
  } catch {}
  return false;
}

// ---- HTTP 服务核心路由调度 ----
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://gw.invalid');
    const clientIp = getClientIp(req);
    const ua = req.headers['user-agent'] || '';

    // CORS 支持: 仅在受信任的 Origin 列表里才放行，杜绝泛反射
    if (url.pathname.startsWith('/__gw/')) {
      const origin = req.headers.origin;
      if (origin && isTrustedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(origin && isTrustedOrigin(origin) ? 204 : 403);
        res.end();
        return;
      }
    }

    // ==========================================
    // 核心安全功能 1: 一次性 Pairing Token 配对消费端点
    // ==========================================
    if (url.pathname === '/__gw/pair' && req.method === 'GET') {
      const token = url.searchParams.get('t');
      const record = consumePairingToken(token);

      if (!record) {
        appendAccessLog({ ip: clientIp, method: 'GET', path: '/__gw/pair', status: 'PAIR_INVALID', ua, note: 'token expired or reused' });
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(pairErrorPage('该配对二维码已失效或已被使用，请在电脑端刷新后重新扫码。'));
        return;
      }

      // 生成独立设备专属 Token (32 字节高熵随机器)
      const deviceRawToken = crypto.randomBytes(32).toString('base64url');
      const deviceId = 'dev_' + Date.now().toString(36) + Math.floor(Math.random() * 0x1000).toString(36);
      const deviceName = parseDeviceName(ua);
      const devices = loadDevices();

      const newDevice = {
        id: deviceId,
        name: deviceName,
        tokenHash: hashToken(deviceRawToken),
        createdIp: clientIp,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        lastIp: clientIp,
        status: 'active',
        ua,
      };

      devices.push(newDevice);
      saveDevices(devices);

      // 种入专属 HttpOnly 设备凭证 Cookie，并代签 DSH 访问凭证
      setDeviceCookies(res, deviceRawToken, isReqHttps(req));
      appendAccessLog({ ip: clientIp, method: 'GET', path: '/__gw/pair', status: 'PAIR_SUCCESS', ua, note: `paired device: ${deviceName} (${deviceId})` });

      const tok = loadDshToken();
      // 303 跳转进入纯净根路径
      res.writeHead(303, { location: tok ? `/?token=${tok}` : '/', 'cache-control': 'no-store' });
      res.end();
      return;
    }

    // ==========================================
    // 核心安全功能 2: 生成一次性 Pairing Token (受限)
    // ==========================================
    if (url.pathname === '/__gw/pair/create' && (req.method === 'POST' || req.method === 'GET')) {
      if (!allowed(req)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
      const pairRec = createPairingToken();
      appendAccessLog({ ip: clientIp, method: req.method, path: '/__gw/pair/create', status: 'PAIR_CREATED', ua });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        token: pairRec.token,
        expiresAt: pairRec.expiresAt,
        ttlSeconds: 90,
      }));
      return;
    }

    // ==========================================
    // 核心安全功能 3: 独立设备管理接口 (查询、撤销、重命名)
    // ==========================================
    if (url.pathname === '/__gw/devices') {
      if (!allowed(req)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
      const devices = loadDevices();
      // 脱敏输出，不泄露 tokenHash
      const safeList = devices.map(({ tokenHash, ...safe }) => safe);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, devices: safeList }));
      return;
    }

    if (url.pathname === '/__gw/devices/revoke' && req.method === 'POST') {
      if (!allowed(req)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { body = {}; }
      const deviceId = String(body.deviceId || '').trim();
      if (!deviceId) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'missing deviceId' }));
        return;
      }
      const devices = loadDevices();
      const hit = devices.find((d) => d.id === deviceId);
      if (hit) {
        hit.status = 'revoked';
        hit.revokedAt = new Date().toISOString();
        saveDevices(devices);
        appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/devices/revoke', status: 'DEVICE_REVOKED', ua, note: `revoked deviceId: ${deviceId}` });
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, deviceId }));
      return;
    }

    // 普通密码登录页面 & 提交验证 (作为应急后备手段)
    if (url.pathname === '/__gw/login') {
      if (req.method === 'POST') {
        const limit = checkRateLimit(clientIp);
        if (!limit.allowed) {
          res.writeHead(429, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(loginPage(`尝试失败次数过多，已被临时锁定，请等待 ${limit.remainSec} 秒后再试`, limit.remainSec));
          appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/login', status: 'RATE_LIMIT', ua, note: `locked remain ${limit.remainSec}s` });
          return;
        }

        let body = '';
        try { body = await readBody(req); } catch { res.writeHead(413); res.end(); return; }
        const pw = new URLSearchParams(body).get('password') || '';
        const ok = verifyPassword(pw, passwordHash);

        if (ok) {
          resetLoginFailure(clientIp);
          setLoginCookies(res, isReqHttps(req));
          appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/login', status: 'LOGIN_OK', ua });
          const tok = loadDshToken();
          res.writeHead(303, { location: tok ? `/?token=${tok}` : '/', 'cache-control': 'no-store' });
          res.end();
        } else {
          recordLoginFailure(clientIp);
          const afterLimit = checkRateLimit(clientIp);
          const lockedSec = !afterLimit.allowed ? afterLimit.remainSec : 0;
          const errText = lockedSec > 0
            ? `连续失败次数过多，已被临时锁定，请等待 ${lockedSec} 秒后再试`
            : '口令错误，请重新输入';
          appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/login', status: 'LOGIN_FAIL', ua, note: lockedSec > 0 ? `now locked ${lockedSec}s` : 'bad password' });
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(loginPage(errText, lockedSec));
        }
        return;
      }

      if (hasSession(req)) {
        const tok = loadDshToken();
        res.writeHead(303, { location: tok ? `/?token=${tok}` : '/', 'cache-control': 'no-store' });
        res.end();
        return;
      }

      const limit = checkRateLimit(clientIp);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(loginPage(limit.allowed ? '' : `尝试失败次数过多，已被临时锁定，请等待 ${limit.remainSec} 秒后再试`, limit.allowed ? 0 : limit.remainSec));
      return;
    }

    if (url.pathname === '/__gw/logout') {
      clearSessionCookie(res, req);
      appendAccessLog({ ip: clientIp, method: req.method, path: '/__gw/logout', status: 'LOGOUT', ua });
      res.writeHead(303, { location: '/__gw/login', 'cache-control': 'no-store' });
      res.end();
      return;
    }

    // 重设口令 (仅存 scrypt 哈希，不留任何明文)
    if (url.pathname === '/__gw/password') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'POST only' }));
        return;
      }
      if (!allowed(req)) {
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
      persistPasswordHash(pw);
      sessions.clear();
      appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/password', status: 'PASSWORD_CHANGED', ua });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // 网关安全配置读写 (lanAuth 开关)
    if (url.pathname === '/__gw/config') {
      if (!allowed(req)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        try { body = await readBody(req); } catch { res.writeHead(400); res.end(); return; }
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.lanAuth === 'boolean') {
            gwConfig.lanAuth = parsed.lanAuth;
            saveConfig(gwConfig);
            appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/config', status: 'CONFIG_UPDATED', ua, note: `lanAuth=${gwConfig.lanAuth}` });
          }
        } catch {}
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, config: gwConfig }));
      return;
    }

    // 审计日志读取接口 (最近 50 条)
    if (url.pathname === '/__gw/logs') {
      if (!allowed(req)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
      let logs = [];
      try {
        if (fs.existsSync(ACCESS_LOG_FILE)) {
          const lines = fs.readFileSync(ACCESS_LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
          logs = lines.slice(-50).map((l) => {
            try { return JSON.parse(l); } catch { return { raw: l }; }
          }).reverse();
        }
      } catch (e) {
        console.error('[gw] read logs error:', e);
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, logs }));
      return;
    }

    // 状态查询
    if (url.pathname === '/__gw/status') {
      const isDirectClient = isPrivateLanIp(clientIp);
      const isLocalHost = isLocalhostRequest(req);
      const exposure = await checkPort3080Exposure();

      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        listen: PORT,
        upstream: `${UP_HOST}:${UP_PORT}`,
        clientIp,
        isPrivateLan: isDirectClient,
        isLocalhost: isLocalHost,
        lanAuth: gwConfig.lanAuth,
        port3080Exposed: exposure.exposed,
        port3080CheckedIp: exposure.checkedIp,
        direct: !gwConfig.lanAuth && isDirectClient,
        authed: hasSession(req),
        dshCosign: !!dshSecret,
        time: new Date().toISOString(),
      }));
      return;
    }

    // 二维码图片
    if (url.pathname === '/__gw/qr') {
      const target = url.searchParams.get('u') || `http://${clientIp}:${PORT}`;
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

    // 根路径智能入口: 未登录 -> 跳登录页; 已登录 -> 进 DSH
    if ((url.pathname === '/' || url.pathname === '/index.html') && req.method === 'GET') {
      if (!allowed(req)) {
        appendAccessLog({ ip: clientIp, method: req.method, path: url.pathname, status: 'AUTH_REQUIRED', ua });
        res.writeHead(303, { location: '/__gw/login', 'cache-control': 'no-store' });
        res.end();
        return;
      }
    }

    if (!allowed(req)) {
      appendAccessLog({ ip: clientIp, method: req.method, path: url.pathname, status: 'DENIED', ua });
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
  console.log(`[gw] listen 0.0.0.0:${PORT} -> ${UP_HOST}:${UP_PORT} (Pairing & Device token engine ready)`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
