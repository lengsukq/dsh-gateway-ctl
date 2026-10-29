// DSH 独立网关: 监听 GW_PORT(默认 3081), 反代 DSH 本体(默认 127.0.0.1:3080).
// 安全模型 (统一门禁, 没有任何按来源 IP 的信任):
// 1. 除登录页/配对/二维码/最小状态外, 任何来源(本机回环、局域网、组网、隧道、公网)
//    都必须持有有效凭证: 网页会话 (gw_session) / 设备凭证 (gw_device) / 内部管理密钥 (x-gw-admin, 仅回环)
// 2. 一次性配对令牌 (默认 90 秒, 单次, 防重放) 是唯一可免输口令的凭证, 只能由已登录所有者签发
// 3. 持久化凭证与密钥: .gw_admin(内部管理密钥) / .gw_password(scrypt) / sessions.json(仅哈希) /
//    devices.json(仅哈希 + 到期时间); 全部 0600 + tmp/rename 原子写
// 4. 设备凭证服务端到期校验, 支持单台撤销与全部撤销; 改口令可同时撤销全部设备
// 5. 登录失败限流与指数退避（5次失败后锁定）
// 6. 结构化访问审计日志与自动轮转 (~/.dsh/gateway/access.log)
// 7. DSH 3080 端口暴露主动检测与防穿透警示
// 8. CORS 严格白名单收敛 (回环 + remotes.json 精确 origin)
// 9. 客户端 IP 仅用于展示/审计, 不参与任何鉴权判定; 只从可信代理读取转发头, 缺失即视为未知
// 10. 不再把 DSH launch token 拼进跳转 URL, 一律依赖代签 Cookie
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = parseInt(process.env.GW_PORT || '3081', 10);
const BIND_HOST = process.env.GW_BIND || '0.0.0.0';
const UP_HOST = process.env.GW_UPSTREAM_HOST || '127.0.0.1';
const UP_PORT = parseInt(process.env.GW_UPSTREAM_PORT || '3080', 10);
const SESSION_TTL_MS = (parseInt(process.env.GW_SESSION_TTL_H || '24', 10) || 24) * 3600 * 1000;
const DIR = process.env.GW_DIR || path.join(os.homedir(), '.dsh', 'gateway');
const HASH_FILE = path.join(DIR, '.gw_password');
const PW_FILE = path.join(DIR, '.gw_secret');
const ADMIN_FILE = path.join(DIR, '.gw_admin');
const CONFIG_FILE = path.join(DIR, 'config.json');
const ACCESS_LOG_FILE = path.join(DIR, 'access.log');
const DEVICES_FILE = path.join(DIR, 'devices.json');
const SESSIONS_FILE = path.join(DIR, 'sessions.json');
const REMOTES_FILE = path.join(DIR, 'remotes.json');
const CRED_FILE = process.env.GW_CRED_FILE || path.join(os.homedir(), '.dsh', '.credentials.yaml');
const COOKIE_NAME = 'gw_session';
const DEVICE_COOKIE_NAME = 'gw_device';
const UP_ORIGIN = `http://${UP_HOST}:${UP_PORT}`;
const DAY_MS = 24 * 3600 * 1000;

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

// ---- 密钥/凭证文件原子写 (0600, tmp + rename) ----
function writeSecretAtomic(filePath, text) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
  try { fs.chmodSync(filePath, 0o600); } catch {}
}

function readSecretText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

// ---- 网关全局安全配置 (config.json) ----
// lanAuth 已废弃: 保留字段只为兼容旧文件, 不再参与任何鉴权判定。
const DEFAULT_CONFIG = { deviceTtlDays: 365, pairTtlSeconds: 90 };

function loadConfig() {
  const cfg = { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      const ttl = Number(parsed.deviceTtlDays);
      if (Number.isInteger(ttl) && ttl >= 1 && ttl <= 3650) cfg.deviceTtlDays = ttl;
      const pair = Number(parsed.pairTtlSeconds);
      if (Number.isInteger(pair) && pair >= 30 && pair <= 600) cfg.pairTtlSeconds = pair;
      if (parsed.lanAuth === false) {
        console.warn('\x1b[33m[gw-security] config.lanAuth=false 已废弃并被忽略: 任何来源都必须通过口令或配对令牌校验\x1b[0m');
      }
    }
  } catch {
    /* 没有配置文件时使用默认值 */
  }
  const envTtl = parseInt(process.env.GW_DEVICE_TTL_D || '', 10);
  if (Number.isInteger(envTtl) && envTtl >= 1 && envTtl <= 3650) cfg.deviceTtlDays = envTtl;
  return cfg;
}

function saveConfig(cfg) {
  try {
    writeSecretAtomic(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
  } catch (e) {
    console.error('[gw] saveConfig error:', e);
  }
}

let gwConfig = loadConfig();

function deviceTtlMs() {
  return gwConfig.deviceTtlDays * DAY_MS;
}

function pairTtlMs() {
  return gwConfig.pairTtlSeconds * 1000;
}

// ---- 内部管理密钥 (.gw_admin): 插件/脚本控制面凭证, 仅回环 peer + 正确头部才生效 ----
function ensureAdminToken() {
  const existing = readSecretText(ADMIN_FILE);
  if (existing) return existing;
  const token = crypto.randomBytes(32).toString('base64url');
  try {
    fs.writeFileSync(ADMIN_FILE, token + '\n', { mode: 0o600, flag: 'wx' });
    console.log(`[gw-security] ✓ internal admin key created: ${ADMIN_FILE} (0600)`);
    return token;
  } catch (e) {
    if (e && e.code === 'EEXIST') return readSecretText(ADMIN_FILE) || null;
    console.error('[gw-security] failed to create internal admin key:', (e && e.message) || e);
    return null;
  }
}

let adminKeyCache = { value: null, mtimeMs: -1 };

/** 读取内部管理密钥 (按 mtime 热重载, 轮换后立刻生效; 缺失即失败关闭). */
function adminKey() {
  try {
    const st = fs.statSync(ADMIN_FILE);
    if (st.mtimeMs !== adminKeyCache.mtimeMs) {
      adminKeyCache = { value: readSecretText(ADMIN_FILE) || null, mtimeMs: st.mtimeMs };
      if (adminKeyCache.value) console.log('[gw-security] internal admin key (re)loaded');
    }
    return adminKeyCache.value;
  } catch {
    adminKeyCache = { value: null, mtimeMs: -1 };
    return null;
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isLoopbackPeer(req) {
  const ip = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '').trim();
  return ip === '127.0.0.1' || ip === '::1';
}

/** 内部管理密钥只认回环 peer: 即使密钥泄露也无法从公网/局域网使用. */
function isAdminRequest(req) {
  if (!isLoopbackPeer(req)) return false;
  const expected = adminKey();
  if (!expected) return false;
  return safeEqual(req.headers['x-gw-admin'], expected);
}

function rotateAdminKey() {
  const token = crypto.randomBytes(32).toString('base64url');
  writeSecretAtomic(ADMIN_FILE, token + '\n');
  adminKeyCache = { value: token, mtimeMs: -1 };
  console.log('[gw-security] internal admin key rotated');
  return token;
}

ensureAdminToken();

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
  writeSecretAtomic(HASH_FILE, hash + '\n');
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
// 记录字段: { id, name, tokenHash, createdIp, createdAt, expiresAt, lastActiveAt, lastIp, status, ua, revokedAt?, expiredAt? }
// 服务端强制校验 expiresAt; 缺字段的历史记录按 createdAt + deviceTtlDays 补齐 (迁移前写 .bak)
function loadDevices() {
  let list;
  try {
    const parsed = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    list = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (e && e.code !== 'ENOENT') {
      try { fs.renameSync(DEVICES_FILE, `${DEVICES_FILE}.corrupt-${Date.now()}`); } catch {}
      console.error('[gw-security] devices.json unreadable, started empty:', (e && e.message) || e);
    }
    return [];
  }
  let migrated = 0;
  for (const dev of list) {
    if (!dev || typeof dev !== 'object') continue;
    if (typeof dev.expiresAt !== 'string' || !Number.isFinite(Date.parse(dev.expiresAt))) {
      const created = Date.parse(dev.createdAt);
      const base = Number.isFinite(created) ? created : Date.now();
      dev.expiresAt = new Date(base + deviceTtlMs()).toISOString();
      migrated += 1;
    }
    if (typeof dev.tokenHash !== 'string' || !dev.tokenHash) {
      dev.status = 'revoked';
      dev.revokedAt = dev.revokedAt || new Date().toISOString();
    }
  }
  if (migrated > 0) {
    try {
      if (fs.existsSync(DEVICES_FILE)) fs.copyFileSync(DEVICES_FILE, `${DEVICES_FILE}.bak`);
      saveDevices(list);
      console.log(`[gw-security] devices.json migrated: ${migrated} record(s) got expiresAt (backup: devices.json.bak)`);
    } catch (e) {
      console.error('[gw] devices migration failed:', (e && e.message) || e);
    }
  }
  return list;
}

function saveDevices(list) {
  try {
    writeSecretAtomic(DEVICES_FILE, JSON.stringify(list, null, 2) + '\n');
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
const MAX_PAIRING_TOKENS = 8;

function createPairingToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const record = {
    token,
    createdAt: now,
    expiresAt: now + pairTtlMs(),
    used: false,
  };
  pairingTokens.set(token, record);
  // 未消费令牌上限, 避免长期运行堆积
  while (pairingTokens.size > MAX_PAIRING_TOKENS) {
    const oldest = pairingTokens.keys().next();
    if (oldest.done) break;
    pairingTokens.delete(oldest.value);
  }
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

// ---- 客户端 IP 提取 (仅用于展示/审计) 与 CIDR 工具 ----
function ipv4ToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return parts.reduce((acc, octet) => ((acc << 8) + (parseInt(octet, 10) & 0xff)) >>> 0, 0);
}

function inIpv4Cidr(ip, cidr) {
  const [netIp, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ipv4ToLong(ip) & mask) >>> 0) === ((ipv4ToLong(netIp) & mask) >>> 0);
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

// ---- 虚拟网卡/组网网段 (EasyTier、Clash tun 等): 仅用于前端"IP 来源"分类展示 ----
function longToIpv4(value) {
  const v = Number(value) >>> 0;
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff].join('.');
}

function maskToPrefix(netmask) {
  const long = ipv4ToLong(netmask);
  let bits = 0;
  for (let i = 31; i >= 0; i -= 1) {
    if ((long >>> i) & 1) bits += 1;
    else break;
  }
  return bits;
}

let overlayCache = { at: 0, value: [] };

function overlayCidrs() {
  if (Date.now() - overlayCache.at < 60_000) return overlayCache.value;
  const out = new Set(['100.64.0.0/10', '198.18.0.0/15']);
  try {
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
      if (!/^(utun|tun|tap|ppp|wg|zt|tailscale|clash|easy|meta)/i.test(name)) continue;
      for (const iface of list || []) {
        if (!iface || iface.family !== 'IPv4' || !iface.netmask) continue;
        const bits = maskToPrefix(iface.netmask);
        if (!Number.isInteger(bits) || bits < 0 || bits > 32) continue;
        const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
        const netIp = longToIpv4((ipv4ToLong(iface.address) & mask) >>> 0);
        out.add(`${netIp}/${bits}`);
      }
    }
  } catch {}
  overlayCache = { at: Date.now(), value: Array.from(out) };
  return overlayCache.value;
}

/** 可信反向代理 (默认仅回环): 只有这些 peer 的转发头会被采信. */
const TRUSTED_PROXIES = (() => {
  const raw = String(process.env.GW_TRUSTED_PROXIES || '').trim();
  const items = raw ? raw.split(',') : ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  return items.map((s) => s.trim()).filter(Boolean);
})();

function ipInList(ip, list) {
  if (!ip) return false;
  for (const entry of list) {
    if (!entry) continue;
    if (entry === ip) return true;
    if (entry.includes('/') && net.isIPv4(ip)) {
      const [netIp, bitsStr] = entry.split('/');
      const bits = parseInt(bitsStr, 10);
      if (net.isIPv4(netIp) && Number.isInteger(bits) && bits >= 0 && bits <= 32 && inIpv4Cidr(ip, entry)) return true;
    }
  }
  return false;
}

function peerIp(req) {
  return String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '').trim();
}

function isTrustedProxy(ip) {
  return ipInList(ip, TRUSTED_PROXIES);
}

/**
 * 客户端 IP: 只用于展示/审计, 不参与任何鉴权判定.
 * - peer 命中可信代理: 采信 cf-connecting-ip / x-forwarded-for[0] / x-real-ip; 三者皆无 -> unknown
 * - peer 不在可信列表: 直接用 peer IP, 忽略全部转发头 (防伪造)
 */
function getClientIp(req) {
  const peer = peerIp(req);
  if (isTrustedProxy(peer)) {
    const cf = req.headers['cf-connecting-ip'];
    const xff = req.headers['x-forwarded-for'];
    const real = req.headers['x-real-ip'];
    const candidate =
      (typeof cf === 'string' && cf.trim()) ||
      (typeof xff === 'string' && xff.split(',')[0].trim()) ||
      (typeof real === 'string' && real.trim()) ||
      '';
    const clean = String(candidate).replace(/^::ffff:/, '').trim();
    if (clean && (net.isIPv4(clean) || net.isIPv6(clean))) return clean;
  }
  return peer || 'unknown';
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
// DSH 代签密钥按 mtime 热重载: DSH 轮换 secret 后不必重启网关
let dshSecret = null;
let dshSecretMtime = -1;

function refreshDshSecret(force = false) {
  try {
    const st = fs.statSync(CRED_FILE);
    if (!force && st.mtimeMs === dshSecretMtime) return dshSecret;
    dshSecretMtime = st.mtimeMs;
    const next = loadDshSecret();
    if (!next) console.log('\x1b[33m[gw-security] DSH browser secret NOT found: 登录/配对会提示不可用 (不回退到 Token 跳转)\x1b[0m');
    else console.log('[gw] DSH browser secret loaded, co-sign enabled');
    dshSecret = next;
  } catch {
    if (!dshSecret) console.log('\x1b[33m[gw-security] DSH credential file unreadable: 代签不可用\x1b[0m');
  }
  return dshSecret;
}

refreshDshSecret(true);

function dshAuthCookieHeader() {
  const secret = refreshDshSecret();
  if (!secret) return null;
  const now = Date.now();
  const payload = {
    version: 1,
    authority: UP_AUTHORITY,
    issuedAt: now,
    expiresAt: now + 30 * 24 * 3600 * 1000,
  };
  const val = dshEncodeCookie(payload, secret);
  return `${DSH_COOKIE_NAME}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}`;
}

function isReqHttps(req) {
  return (req.headers && req.headers['x-forwarded-proto'] === 'https') || !!(req.socket && req.socket.encrypted);
}

// ---- 会话存储 (sessions.json: 只保存 token 的 sha256, 不保存原始 Cookie) ----
// key: sha256(session token) -> { createdAt, expiresAt, lastSeenAt, ip, ua }
const sessions = new Map();
let sessionsDirty = false;

function loadSessions() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const list = parsed && Array.isArray(parsed.sessions) ? parsed.sessions : [];
    const now = Date.now();
    let pruned = 0;
    for (const rec of list) {
      if (!rec || typeof rec.id !== 'string' || !/^[0-9a-f]{64}$/.test(rec.id)) continue;
      const exp = Date.parse(rec.expiresAt);
      if (!Number.isFinite(exp) || exp <= now) {
        pruned += 1;
        continue;
      }
      sessions.set(rec.id, {
        createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : new Date(now).toISOString(),
        expiresAt: exp,
        lastSeenAt: typeof rec.lastSeenAt === 'string' ? rec.lastSeenAt : new Date(now).toISOString(),
        ip: typeof rec.ip === 'string' ? rec.ip : '',
        ua: typeof rec.ua === 'string' ? rec.ua.slice(0, 200) : '',
      });
    }
    console.log(`[gw] session store loaded: ${sessions.size} active${pruned ? `, pruned ${pruned} expired` : ''}`);
  } catch (e) {
    if (e && e.code !== 'ENOENT') {
      try { fs.renameSync(SESSIONS_FILE, `${SESSIONS_FILE}.corrupt-${Date.now()}`); } catch {}
      console.error('[gw-security] sessions.json unreadable, started empty:', (e && e.message) || e);
    }
  }
}

function persistSessions(force = false) {
  if (!force && !sessionsDirty) return;
  try {
    const list = [];
    for (const [id, rec] of sessions) {
      list.push({
        id,
        createdAt: rec.createdAt,
        expiresAt: new Date(rec.expiresAt).toISOString(),
        lastSeenAt: rec.lastSeenAt,
        ip: rec.ip,
        ua: rec.ua,
      });
    }
    writeSecretAtomic(SESSIONS_FILE, JSON.stringify({ version: 1, sessions: list }, null, 2) + '\n');
    sessionsDirty = false;
  } catch (e) {
    console.error('[gw] persistSessions error:', (e && e.message) || e);
  }
}

function addSession(token, req) {
  const now = Date.now();
  const id = hashToken(token);
  sessions.set(id, {
    createdAt: new Date(now).toISOString(),
    expiresAt: now + SESSION_TTL_MS,
    lastSeenAt: new Date(now).toISOString(),
    ip: getClientIp(req),
    ua: String((req && req.headers && req.headers['user-agent']) || '').slice(0, 200),
  });
  sessionsDirty = true;
  persistSessions(true);
  return id;
}

function dropSession(token) {
  if (!token) return false;
  const id = hashToken(token);
  if (!sessions.delete(id)) return false;
  sessionsDirty = true;
  persistSessions(true);
  return true;
}

function revokeAllSessions() {
  const count = sessions.size;
  sessions.clear();
  sessionsDirty = true;
  persistSessions(true);
  return count;
}

loadSessions();

setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, rec] of sessions) {
    if (rec.expiresAt <= now) {
      sessions.delete(id);
      changed = true;
    }
  }
  if (changed) sessionsDirty = true;
  persistSessions();
}, 60_000).unref();

// 登录成功: 新建会话 (落盘仅哈希) + 种 Cookie (含 DSH 代签)
function setLoginCookies(res, req, secure) {
  const tok = crypto.randomBytes(32).toString('hex');
  addSession(tok, req);
  const parts = [`${COOKIE_NAME}=${tok}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`];
  if (secure) parts.push('Secure');
  const cookies = [parts.join('; ')];
  const dsh = dshAuthCookieHeader();
  if (dsh) cookies.push(dsh + (secure ? '; Secure' : ''));
  res.setHeader('set-cookie', cookies);
  return tok;
}

// 为配对成功的设备签发专属设备凭证 (Cookie 生命周期 = 凭证剩余有效期)
function setDeviceCookies(res, deviceRawToken, expiresAtMs, secure) {
  const remainSec = Math.max(60, Math.floor((expiresAtMs - Date.now()) / 1000));
  const parts = [`${DEVICE_COOKIE_NAME}=${deviceRawToken}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${remainSec}`];
  if (secure) parts.push('Secure');
  const cookies = [parts.join('; ')];
  const dsh = dshAuthCookieHeader();
  if (dsh) cookies.push(dsh + (secure ? '; Secure' : ''));
  res.setHeader('set-cookie', cookies);
}

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

// 鉴权判定：普通会话 (gw_session) 或 独立设备凭证 (gw_device)，设备凭证强制校验到期
function hasSession(req) {
  const cookies = parseCookies(req);

  // 1. 网页会话 (sessions.json 只保存 token 哈希)
  const sessTok = cookies[COOKIE_NAME];
  if (sessTok && /^[0-9a-f]{64}$/.test(sessTok)) {
    const id = hashToken(sessTok);
    const rec = sessions.get(id);
    if (rec) {
      if (rec.expiresAt > Date.now()) {
        const now = Date.now();
        const last = Date.parse(rec.lastSeenAt);
        if (!Number.isFinite(last) || now - last > 5 * 60 * 1000) {
          rec.lastSeenAt = new Date(now).toISOString();
          sessionsDirty = true;
        }
        return true;
      }
      sessions.delete(id);
      sessionsDirty = true;
      persistSessions();
    }
  }

  // 2. 设备凭证 (服务端到期校验)
  const devTok = cookies[DEVICE_COOKIE_NAME];
  if (devTok && typeof devTok === 'string' && devTok.length >= 32) {
    const thash = hashToken(devTok);
    const devices = loadDevices();
    const hit = devices.find((d) => d.tokenHash === thash && d.status === 'active');
    if (hit) {
      const expiresAt = Date.parse(hit.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        hit.status = 'expired';
        hit.expiredAt = new Date().toISOString();
        saveDevices(devices);
        appendAccessLog({
          ip: getClientIp(req),
          method: req.method,
          path: '/',
          status: 'DEVICE_EXPIRED',
          ua: req.headers['user-agent'] || '',
          note: `device ${hit.id}`,
        });
        return false;
      }
      // 触碰活跃时间 (每 5 分钟更新一次避免频繁写盘)
      const now = Date.now();
      const last = hit.lastActiveAt ? Date.parse(hit.lastActiveAt) : 0;
      if (!Number.isFinite(last) || now - last > 5 * 60 * 1000) {
        hit.lastActiveAt = new Date(now).toISOString();
        hit.lastIp = getClientIp(req);
        saveDevices(devices);
      }
      return true;
    }
  }

  return false;
}

/**
 * 统一门禁: 内部管理密钥 (仅回环) / 网页会话 / 设备凭证.
 * 没有按来源 IP 的信任 —— 本机、局域网、组网、隧道、公网同一把尺子.
 */
function authenticated(req) {
  return isAdminRequest(req) || hasSession(req);
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
  if (tok) dropSession(tok);
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

// ---- 响应辅助 ----
const HTML_SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function sendJson(res, code, value) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(JSON.stringify(value));
}

function sendHtml(res, code, html) {
  res.writeHead(code, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...HTML_SECURITY_HEADERS,
  });
  res.end(html);
}

function homeRedirect(req, res) {
  res.writeHead(303, {
    location: '/',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  res.end();
}

// 受信任 Origin: 回环 + remotes.json 里精确配置的外网地址 (不再私网通吃)
function isTrustedOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    try {
      if (fs.existsSync(REMOTES_FILE)) {
        const s = JSON.parse(fs.readFileSync(REMOTES_FILE, 'utf8'));
        if (s && Array.isArray(s.remotes)) {
          if (s.remotes.some((r) => r && r.baseUrl && new URL(r.baseUrl).origin === origin)) return true;
        }
      }
    } catch {}
  } catch {}
  return false;
}

/** 密钥/凭证总览: 只返回元信息, 绝不返回任何密钥或哈希值. */
function secretSummary() {
  const now = Date.now();
  let admin = { exists: false };
  try {
    const st = fs.statSync(ADMIN_FILE);
    admin = {
      exists: true,
      updatedAt: new Date(st.mtimeMs).toISOString(),
      ageDays: Math.floor((now - st.mtimeMs) / DAY_MS),
      mode: (st.mode & 0o777).toString(8),
    };
  } catch {}
  let password = { exists: false };
  try {
    const st = fs.statSync(HASH_FILE);
    password = { exists: true, updatedAt: new Date(st.mtimeMs).toISOString() };
  } catch {}
  const devices = loadDevices();
  let active = 0;
  let expired = 0;
  let revoked = 0;
  for (const d of devices) {
    const exp = Date.parse(d.expiresAt);
    if (d.status === 'revoked') revoked += 1;
    else if (d.status === 'expired' || !Number.isFinite(exp) || exp <= now) expired += 1;
    else active += 1;
  }
  let oldestIssuedAt = null;
  let lastSeenAt = null;
  for (const rec of sessions.values()) {
    if (!oldestIssuedAt || rec.createdAt < oldestIssuedAt) oldestIssuedAt = rec.createdAt;
    if (!lastSeenAt || rec.lastSeenAt > lastSeenAt) lastSeenAt = rec.lastSeenAt;
  }
  return {
    admin,
    password,
    sessions: {
      count: sessions.size,
      oldestIssuedAt,
      lastSeenAt,
      ttlHours: Math.round(SESSION_TTL_MS / 3600000),
    },
    devices: { active, expired, revoked, total: devices.length, ttlDays: gwConfig.deviceTtlDays },
    dshCosign: { ok: Boolean(refreshDshSecret()) },
    trustedProxies: TRUSTED_PROXIES,
    bind: BIND_HOST,
  };
}

function configPayload() {
  return {
    deviceTtlDays: gwConfig.deviceTtlDays,
    pairTtlSeconds: gwConfig.pairTtlSeconds,
  };
}

// ---- HTTP 服务核心路由调度 ----
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://gw.invalid');
    const clientIp = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const authed = authenticated(req);

    // CORS 支持: 仅在受信任的 Origin 列表里才放行，杜绝泛反射
    if (url.pathname.startsWith('/__gw/')) {
      const origin = req.headers.origin;
      if (origin && isTrustedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gw-admin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(origin && isTrustedOrigin(origin) ? 204 : 403);
        res.end();
        return;
      }
    }

    // ==========================================
    // 公开端点 1: 一次性 Pairing Token 消费 (扫码配对)
    // 令牌是唯一可免输口令的凭证: 由已登录所有者签发, 一次性, 防重放
    // ==========================================
    if (url.pathname === '/__gw/pair') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'GET only' });
        return;
      }
      if (!refreshDshSecret()) {
        appendAccessLog({ ip: clientIp, method: 'GET', path: '/__gw/pair', status: 'PAIR_UNAVAILABLE', ua, note: 'dsh browser secret missing' });
        sendHtml(res, 503, pairErrorPage('网关暂时无法完成 DSH 代签：找不到 DSH 的浏览器会话密钥。请确认 DSH 已启动后再刷新二维码，或改用口令登录。'));
        return;
      }
      const record = consumePairingToken(url.searchParams.get('t'));
      if (!record) {
        appendAccessLog({ ip: clientIp, method: 'GET', path: '/__gw/pair', status: 'PAIR_INVALID', ua, note: 'token expired or reused' });
        sendHtml(res, 400, pairErrorPage('该配对二维码已失效或已被使用，请在电脑端刷新后重新扫码。'));
        return;
      }

      // 生成独立设备专属 Token (32 字节高熵随机器)
      const deviceRawToken = crypto.randomBytes(32).toString('base64url');
      const deviceId = 'dev_' + Date.now().toString(36) + Math.floor(Math.random() * 0x1000).toString(36);
      const deviceName = parseDeviceName(ua);
      const devices = loadDevices();
      const now = Date.now();
      const expiresAt = now + deviceTtlMs();

      devices.push({
        id: deviceId,
        name: deviceName,
        tokenHash: hashToken(deviceRawToken),
        createdIp: clientIp,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        lastActiveAt: new Date(now).toISOString(),
        lastIp: clientIp,
        status: 'active',
        ua,
      });
      saveDevices(devices);

      // 种入专属 HttpOnly 设备凭证 Cookie，并代签 DSH 访问凭证
      setDeviceCookies(res, deviceRawToken, expiresAt, isReqHttps(req));
      appendAccessLog({ ip: clientIp, method: 'GET', path: '/__gw/pair', status: 'PAIR_SUCCESS', ua, note: `paired device: ${deviceName} (${deviceId})` });
      homeRedirect(req, res);
      return;
    }

    // ==========================================
    // 管理端点 1: 签发一次性 Pairing Token (需有效凭证)
    // ==========================================
    if (url.pathname === '/__gw/pair/create') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' });
        return;
      }
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized', login: '/__gw/login' });
        return;
      }
      const pairRec = createPairingToken();
      appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/pair/create', status: 'PAIR_CREATED', ua });
      sendJson(res, 200, {
        ok: true,
        token: pairRec.token,
        expiresAt: pairRec.expiresAt,
        ttlSeconds: gwConfig.pairTtlSeconds,
      });
      return;
    }

    // ==========================================
    // 设备管理 (查询 / 撤销单台 / 撤销全部)
    // ==========================================
    if (url.pathname === '/__gw/devices') {
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized' });
        return;
      }
      // 脱敏输出，不泄露 tokenHash
      const devices = loadDevices().map(({ tokenHash, ...safe }) => safe);
      sendJson(res, 200, { ok: true, devices });
      return;
    }

    if (url.pathname === '/__gw/devices/revoke') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' });
        return;
      }
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized' });
        return;
      }
      let body = {};
      try { body = JSON.parse(await readBody(req)); } catch { body = {}; }
      const devices = loadDevices();
      const stamp = new Date().toISOString();
      let revoked = 0;
      if (body && body.all === true) {
        for (const d of devices) {
          if (d.status === 'active') {
            d.status = 'revoked';
            d.revokedAt = stamp;
            revoked += 1;
          }
        }
      } else {
        const deviceId = String((body && body.deviceId) || '').trim();
        if (!deviceId) {
          sendJson(res, 400, { ok: false, error: 'missing deviceId (或 {"all":true})' });
          return;
        }
        const hit = devices.find((d) => d.id === deviceId);
        if (hit && hit.status === 'active') {
          hit.status = 'revoked';
          hit.revokedAt = stamp;
          revoked = 1;
        }
      }
      if (revoked > 0) saveDevices(devices);
      appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/devices/revoke', status: 'DEVICE_REVOKED', ua, note: `revoked ${revoked} device(s)` });
      sendJson(res, 200, { ok: true, revoked });
      return;
    }

    // ==========================================
    // 公开端点 2: 口令登录 (唯一的人工凭证入口)
    // ==========================================
    if (url.pathname === '/__gw/login') {
      if (req.method === 'POST') {
        const limit = checkRateLimit(clientIp);
        if (!limit.allowed) {
          appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/login', status: 'RATE_LIMIT', ua, note: `locked remain ${limit.remainSec}s` });
          sendHtml(res, 429, loginPage(`尝试失败次数过多，已被临时锁定，请等待 ${limit.remainSec} 秒后再试`, limit.remainSec));
          return;
        }

        let body = '';
        try { body = await readBody(req); } catch { res.writeHead(413); res.end(); return; }
        const pw = new URLSearchParams(body).get('password') || '';
        const ok = verifyPassword(pw, passwordHash);

        if (ok) {
          resetLoginFailure(clientIp);
          if (!refreshDshSecret()) {
            appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/login', status: 'LOGIN_NO_COSIGN', ua });
            sendHtml(res, 503, loginPage('网关暂时无法完成 DSH 代签（找不到 DSH 浏览器会话密钥）。请确认 DSH 已启动后重试。', 0));
            return;
          }
          setLoginCookies(res, req, isReqHttps(req));
          appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/login', status: 'LOGIN_OK', ua });
          homeRedirect(req, res);
        } else {
          recordLoginFailure(clientIp);
          const afterLimit = checkRateLimit(clientIp);
          const lockedSec = !afterLimit.allowed ? afterLimit.remainSec : 0;
          const errText = lockedSec > 0
            ? `连续失败次数过多，已被临时锁定，请等待 ${lockedSec} 秒后再试`
            : '口令错误，请重新输入';
          appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/login', status: 'LOGIN_FAIL', ua, note: lockedSec > 0 ? `now locked ${lockedSec}s` : 'bad password' });
          sendHtml(res, 200, loginPage(errText, lockedSec));
        }
        return;
      }

      if (authed) {
        homeRedirect(req, res);
        return;
      }

      const limit = checkRateLimit(clientIp);
      sendHtml(res, 200, loginPage(limit.allowed ? '' : `尝试失败次数过多，已被临时锁定，请等待 ${limit.remainSec} 秒后再试`, limit.allowed ? 0 : limit.remainSec));
      return;
    }

    if (url.pathname === '/__gw/logout') {
      clearSessionCookie(res, req);
      appendAccessLog({ ip: clientIp, method: req.method, path: '/__gw/logout', status: 'LOGOUT', ua });
      sendHtml(res, 200, '<!doctype html><meta charset="utf-8"><title>已退出</title><p style="font:14px -apple-system,sans-serif;padding:24px">已退出登录。<a href="/__gw/login">重新登录</a></p>');
      return;
    }

    // ==========================================
    // 管理端点 2: 重设口令 (仅存 scrypt 哈希) / 读取配置
    // ==========================================
    if (url.pathname === '/__gw/password') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' });
        return;
      }
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized', login: '/__gw/login' });
        return;
      }
      let body = '';
      try { body = await readBody(req); } catch { res.writeHead(413); res.end(); return; }
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { parsed = null; }
      const pw = parsed ? String((parsed && parsed.password) || '') : (new URLSearchParams(body).get('password') || '');
      const revokeDevices = Boolean(parsed && parsed.revokeDevices === true);
      if (pw.length < 6 || pw.length > 128) {
        sendJson(res, 400, { ok: false, error: '口令长度需 6-128 位' });
        return;
      }
      persistPasswordHash(pw);
      const sessionsCleared = revokeAllSessions();
      let devicesRevoked = 0;
      if (revokeDevices) {
        const devices = loadDevices();
        const stamp = new Date().toISOString();
        for (const d of devices) {
          if (d.status === 'active') {
            d.status = 'revoked';
            d.revokedAt = stamp;
            devicesRevoked += 1;
          }
        }
        if (devicesRevoked > 0) saveDevices(devices);
      }
      appendAccessLog({
        ip: clientIp,
        method: 'POST',
        path: '/__gw/password',
        status: 'PASSWORD_CHANGED',
        ua,
        note: `sessions cleared: ${sessionsCleared}, devices revoked: ${devicesRevoked}`,
      });
      sendJson(res, 200, { ok: true, sessionsCleared, devicesRevoked });
      return;
    }

    if (url.pathname === '/__gw/config') {
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized' });
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        try { body = await readBody(req); } catch { res.writeHead(400); res.end(); return; }
        try {
          const parsed = JSON.parse(body) || {};
          const changes = [];
          if (parsed.deviceTtlDays !== undefined) {
            const ttl = Number(parsed.deviceTtlDays);
            if (!Number.isInteger(ttl) || ttl < 1 || ttl > 3650) {
              sendJson(res, 400, { ok: false, error: 'deviceTtlDays 需为 1-3650 的整数' });
              return;
            }
            gwConfig.deviceTtlDays = ttl;
            changes.push(`deviceTtlDays=${ttl}`);
          }
          if (parsed.pairTtlSeconds !== undefined) {
            const pair = Number(parsed.pairTtlSeconds);
            if (!Number.isInteger(pair) || pair < 30 || pair > 600) {
              sendJson(res, 400, { ok: false, error: 'pairTtlSeconds 需为 30-600 的整数' });
              return;
            }
            gwConfig.pairTtlSeconds = pair;
            changes.push(`pairTtlSeconds=${pair}`);
          }
          if (parsed.lanAuth !== undefined) {
            sendJson(res, 400, { ok: false, error: 'lanAuth 已废弃: 任何来源都必须通过口令或配对令牌校验' });
            return;
          }
          if (changes.length > 0) {
            saveConfig(gwConfig);
            appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/config', status: 'CONFIG_UPDATED', ua, note: changes.join(', ') });
          }
        } catch {
          sendJson(res, 400, { ok: false, error: 'bad json' });
          return;
        }
      }
      sendJson(res, 200, { ok: true, config: configPayload() });
      return;
    }

    // ==========================================
    // 管理端点 3: 密钥/凭证总览与轮换
    // ==========================================
    if (url.pathname === '/__gw/admin/keys') {
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized' });
        return;
      }
      sendJson(res, 200, { ok: true, ...secretSummary() });
      return;
    }

    if (url.pathname === '/__gw/admin/rotate-key') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' });
        return;
      }
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized' });
        return;
      }
      rotateAdminKey();
      appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/admin/rotate-key', status: 'KEY_ROTATED', ua });
      sendJson(res, 200, { ok: true, rotatedAt: new Date().toISOString() });
      return;
    }

    if (url.pathname === '/__gw/admin/reload') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' });
        return;
      }
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized' });
        return;
      }
      const reloaded = [];
      gwConfig = loadConfig();
      reloaded.push('config');
      const nextHash = loadHash();
      if (nextHash) {
        passwordHash = nextHash;
        reloaded.push('password');
      }
      refreshDshSecret(true);
      reloaded.push('dsh-cosign');
      const sessionsCleared = revokeAllSessions();
      appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/admin/reload', status: 'ADMIN_RELOAD', ua, note: `reloaded: ${reloaded.join(',')}; sessions cleared: ${sessionsCleared}` });
      sendJson(res, 200, { ok: true, reloaded, sessionsCleared });
      return;
    }

    if (url.pathname === '/__gw/admin/revoke-sessions') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' });
        return;
      }
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized' });
        return;
      }
      const revoked = revokeAllSessions();
      appendAccessLog({ ip: clientIp, method: 'POST', path: '/__gw/admin/revoke-sessions', status: 'SESSIONS_REVOKED', ua, note: `revoked ${revoked} session(s)` });
      sendJson(res, 200, { ok: true, revoked });
      return;
    }

    // ==========================================
    // 管理端点 4: 审计日志 (最近 50 条)
    // ==========================================
    if (url.pathname === '/__gw/logs') {
      if (!authed) {
        sendJson(res, 403, { ok: false, error: 'unauthorized' });
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
      sendJson(res, 200, { ok: true, logs });
      return;
    }

    // ==========================================
    // 公开端点 3: 状态 (最小字段; 携带凭证时返回全量)
    // ==========================================
    if (url.pathname === '/__gw/status') {
      const base = { ok: true, listen: PORT, authed, time: new Date().toISOString() };
      if (!authed) {
        sendJson(res, 200, base);
        return;
      }
      const exposure = await checkPort3080Exposure();
      sendJson(res, 200, {
        ...base,
        upstream: `${UP_HOST}:${UP_PORT}`,
        bind: BIND_HOST,
        clientIp,
        peerIp: peerIp(req),
        isPrivateLan: isPrivateLanIp(clientIp),
        config: configPayload(),
        overlayCidrs: overlayCidrs(),
        port3080Exposed: exposure.exposed,
        port3080CheckedIp: exposure.checkedIp,
        dshCosign: Boolean(refreshDshSecret()),
        sessions: sessions.size,
        devices: loadDevices().filter((d) => d.status === 'active').length,
        adminKeyPresent: Boolean(adminKey()),
      });
      return;
    }

    // ==========================================
    // 公开端点 4: 二维码图片
    // ==========================================
    if (url.pathname === '/__gw/qr') {
      const target = url.searchParams.get('u') || `http://${clientIp === 'unknown' ? '127.0.0.1' : clientIp}:${PORT}`;
      if (!/^https?:\/\/[^/]+(\/.*)?$/.test(target) || target.length > 512) {
        res.writeHead(400, { 'x-content-type-options': 'nosniff' });
        res.end('bad url');
        return;
      }
      try {
        const png = await qrPngBuffer(target);
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'content-length': png.length, 'x-content-type-options': 'nosniff' });
        res.end(png);
      } catch (e) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('qr unavailable\n');
      }
      return;
    }

    // 统一门禁: 其余一切 (含 DSH 页面、静态资源、API、WebSocket) 都必须持有有效凭证
    if (!authed) {
      if (url.pathname === '/' || url.pathname === '/index.html') {
        appendAccessLog({ ip: clientIp, method: req.method, path: url.pathname, status: 'AUTH_REQUIRED', ua });
        res.writeHead(303, { location: '/__gw/login', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
        res.end();
        return;
      }
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
  if (!authenticated(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\ncontent-length: 0\r\nconnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  proxyUpgrade(req, socket, head);
});

server.on('clientError', (_err, socket) => socket.destroy());
server.listen(PORT, BIND_HOST, () => {
  console.log(`[gw] listen ${BIND_HOST}:${PORT} -> ${UP_HOST}:${UP_PORT} (uniform gate: login / pairing token / device credential)`);
  console.log(`[gw-security] ✓ 所有来源(含本机回环)都必须通过口令或配对令牌校验; 内部管理密钥: ${ADMIN_FILE}`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
