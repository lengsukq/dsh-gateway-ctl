/**
 * dsh-gateway-ctl — self-written Host control plane for the standalone DSH
 * remote gateway.
 *
 * The gateway itself (`~/.dsh/gateway/gateway.mjs`, port 3081) is an
 * independent node process: reverse proxy + LAN bypass / tunnel-login split
 * + DSH cookie co-sign + page widget injection. This plugin only manages
 * that process (start/stop/restart/status via `gw.sh`) and exposes the
 * `gw_gateway` model tool, so every session can control remote access
 * without a third-party remote plugin.
 *
 * Lifetime: port probe + child spawn through plain node APIs. The
 * gateway/tunnel processes are deliberately detached from DSH so they
 * survive a DSH restart; `gw.sh` pid files let a fresh DSH re-adopt them.
 * When nothing is listening on :3081 at boot, the plugin starts the gateway
 * itself (`DSH_GW_AUTOSTART=0` opts out).
 */
import { execFile } from 'node:child_process';
import { homedir, networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { readFile, writeFile, mkdir, copyFile, chmod, appendFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

/** Stable cordis plugin name. */
export const name = 'gateway-ctl';

/** This package's own root: source of the shipped gateway bundle, first qrcode fallback. */
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GATEWAY_SOURCE = join(PKG_ROOT, 'gateway');

/** Runtime directory of the standalone gateway. Override with DSH_GW_DIR. */
const DIR = (process.env.DSH_GW_DIR || '').trim() || join(homedir(), '.dsh', 'gateway');
const GW_SH = join(DIR, 'gw.sh');
const GW_PORT = Number(process.env.GW_PORT) || 3081;
const REMOTES_FILE = join(DIR, 'remotes.json');
const HASH_FILE = join(DIR, '.gw_password');
const PLUGIN_LOG = join(DIR, 'plugin.log');

/** Extra PATH entries so `gw.sh` still finds node/cloudflared when DSH was launched from GUI/launchd. */
const PATH_FALLBACK = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];

function childEnv() {
  const path = [process.env.PATH, ...PATH_FALLBACK].filter(Boolean).join(':');
  return { ...process.env, PATH: path, GW_PORT: String(GW_PORT) };
}

/** Append one line to `~/.dsh/gateway/plugin.log` (boot diagnostics survive a DSH restart). */
async function logLine(ctx, message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  try {
    const logger = ctx && typeof ctx.logger === 'function' ? ctx.logger('gateway-ctl') : null;
    if (logger && typeof logger.info === 'function') logger.info(message);
  } catch {
    /* logger is optional */
  }
  try {
    await mkdir(DIR, { recursive: true });
    await appendFile(PLUGIN_LOG, line + '\n', { mode: 0o600 });
  } catch {
    /* diagnostics must never break the plugin */
  }
}

function makeRandomPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function hashPasswordScrypt(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${derived}`;
}

// ---- 自定义外网地址表 ----
// 用户在 Cloudflare Dashboard(或其它穿透)配好域名 -> 网关端口后,
// 把地址填进来, 插件的二维码/登录链接就用它, 不再依赖 Quick Tunnel 临时域名。
// 文件格式: { activeId: string|null, remotes: [{id, label, baseUrl}] }
async function loadRemotes() {
  try {
    const raw = await readFile(REMOTES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.remotes)) return { activeId: null, remotes: [] };
    return {
      activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
      remotes: parsed.remotes.filter((r) => r && typeof r.id === 'string' && typeof r.baseUrl === 'string'),
    };
  } catch {
    return { activeId: null, remotes: [] };
  }
}

async function saveRemotes(state) {
  await mkdir(DIR, { recursive: true });
  await writeFile(REMOTES_FILE, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

function normalizeBaseUrl(input) {
  let s = String(input || '').trim().replace(/\/+$/, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || u.username || u.password) return null;
    u.pathname = '';
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function newRemoteId() {
  return 'r' + Date.now().toString(36) + Math.floor(Math.random() * 0x10000).toString(36);
}

// 有效外网地址优先级: 选中的自定义地址 > Quick Tunnel
function pickPublicUrl(state, quickUrl) {
  const active = state.activeId ? state.remotes.find((r) => r.id === state.activeId) : null;
  if (active) return { baseUrl: active.baseUrl, source: 'custom', remote: active };
  if (quickUrl) return { baseUrl: quickUrl, source: 'quick', remote: null };
  return { baseUrl: '', source: 'none', remote: null };
}

function runGw(action, timeoutMs = 45000) {
  return new Promise((resolve) => {
    execFile(GW_SH, [action], { cwd: DIR, timeout: timeoutMs, env: childEnv() }, (error, stdout, stderr) => {
      const output = String(stdout || '') + String(stderr || '');
      if (error) resolve({ ok: false, action, output: output || String(error.message || error) });
      else resolve({ ok: true, action, output });
    });
  });
}

/**
 * Import a module by bare specifier, absolute path, or URL; unwraps the namespace default.
 * Relative paths resolve against this package's root so they never depend on the cwd.
 */
function importModule(entryOrSpecifier) {
  let spec = entryOrSpecifier;
  if (/^\.\.?\//.test(entryOrSpecifier)) spec = pathToFileURL(join(PKG_ROOT, entryOrSpecifier)).href;
  else if (entryOrSpecifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(entryOrSpecifier)) spec = pathToFileURL(entryOrSpecifier).href;
  return import(spec).then((mod) => mod.default || mod);
}

/** Cached optional `qrcode` module; resolved lazily so a missing dependency never breaks boot. */
let qrcodeModule = null;

/**
 * Resolve the optional `qrcode` package without hard-coding any machine path.
 * Order: DSH_GW_QRCODE (module specifier or absolute path) → this plugin's own
 * node_modules → the gateway dir's node_modules.
 * @returns A module exposing the classic `qrcode.toBuffer(text, options)` API.
 */
async function loadQrcode() {
  if (qrcodeModule) return qrcodeModule;
  const override = String(process.env.DSH_GW_QRCODE || '').trim();
  const attempts = [];
  if (override) attempts.push([`DSH_GW_QRCODE=${override}`, () => importModule(override)]);
  attempts.push(['qrcode (plugin dependency)', () => importModule('qrcode')]);
  for (const base of [PKG_ROOT, DIR]) {
    attempts.push([
      `${base}/node_modules/qrcode`,
      () => importModule(createRequire(join(base, 'package.json')).resolve('qrcode')),
    ]);
  }
  const failures = [];
  for (const [label, load] of attempts) {
    try {
      const mod = await load();
      if (mod && typeof mod.toBuffer === 'function') {
        qrcodeModule = mod;
        return mod;
      }
      failures.push(`${label}: 模块缺少 toBuffer()`);
    } catch (err) {
      failures.push(`${label}: ${String((err && err.message) || err)}`);
    }
  }
  throw new Error(`qrcode 不可用（设置 DSH_GW_QRCODE，或在 ${DIR} 执行 npm i qrcode）: ${failures.join(' | ')}`);
}

async function tunnelUrl() {
  try {
    return (await readFile(join(DIR, 'tunnel.url'), 'utf8')).trim();
  } catch {
    return '';
  }
}

async function gatewayAlive(fetchTimeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${GW_PORT}/__gw/status`, { signal: ctrl.signal });
    if (!res.ok) return { alive: false };
    return { alive: true, status: await res.json().catch(() => null) };
  } catch {
    return { alive: false };
  } finally {
    clearTimeout(timer);
  }
}

function lanIps() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list || []) {
      if (iface && iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

function readJsonBody(req, limit = 4096) {
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
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function json(res, code, value) {
  const body = JSON.stringify(value);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function gwStatusPayload() {
  const probe = await gatewayAlive();
  const url = await tunnelUrl();
  const store = await loadRemotes();
  const pub = pickPublicUrl(store, url);
  return {
    ok: true,
    alive: probe.alive,
    port: GW_PORT,
    gateway: probe.status || null,
    tunnelUrl: url,
    loginUrl: pub.baseUrl ? pub.baseUrl : '',
    publicSource: pub.source,
    activeRemote: pub.remote,
    remotes: store.remotes,
    lanIps: lanIps(),
    qrUrl: (lan) => `http://${lan || '127.0.0.1'}:${GW_PORT}/__gw/qr`,
  };
}

// ---- 开机自启 ----
// DSH 启动时如果 :3081 没人在听, 就直接把网关拉起来, 不用再手动 gw.sh start。
// 网关/隧道仍是独立进程(nohup 脱离), DSH 退出不影响它们; 再次启动 DSH 时只是
// 探测到已在运行, 什么也不做。设置 DSH_GW_AUTOSTART=0 可关闭。

/** Deploy `gateway.mjs` / `gw.sh` from the plugin package, keeping `~/.dsh/gateway` current. */
async function ensureGatewayFiles() {
  await mkdir(DIR, { recursive: true });
  const deployed = [];
  for (const file of ['gateway.mjs', 'gw.sh']) {
    const source = join(GATEWAY_SOURCE, file);
    if (!existsSync(source)) continue;
    const target = join(DIR, file);
    const installed = existsSync(target);
    if (installed) {
      // 只在包内的版本更新时覆盖; 本地改过的副本(时间戳更新)保留。
      const [src, dst] = await Promise.all([stat(source).catch(() => null), stat(target).catch(() => null)]);
      if (!src || !dst || src.mtimeMs <= dst.mtimeMs) continue;
    }
    await copyFile(source, target);
    if (file.endsWith('.sh')) await chmod(target, 0o755);
    deployed.push(installed ? `${file}(updated)` : file);
  }
  const pkgFile = join(DIR, 'package.json');
  if (!existsSync(pkgFile)) {
    // 只是给 `npm i` 用的占位清单: 二维码依赖缺失时本地一次性补齐即可。
    const manifest = { name: 'dsh-gateway', private: true, dependencies: { qrcode: '^1.5.4' } };
    await writeFile(pkgFile, JSON.stringify(manifest, null, 2) + '\n');
  }
  if (deployed.length > 0) await logLine(null, `deployed ${deployed.join(', ')} into ${DIR}`);
  return existsSync(GW_SH);
}

async function autoStartGateway(ctx) {
  let ready = false;
  try {
    ready = await ensureGatewayFiles();
  } catch (err) {
    await logLine(ctx, `auto-start: could not prepare ${DIR}: ${String((err && err.message) || err)}`);
    return;
  }
  if (!ready) {
    await logLine(ctx, `auto-start: ${GW_SH} 不存在, 跳过 (安装见 dsh-gateway-ctl/README.md)`);
    return;
  }
  if ((await gatewayAlive(1500)).alive) {
    await logLine(ctx, `auto-start: gateway already running on :${GW_PORT}`);
    return;
  }
  const result = await runGw('start', 60000);
  const firstLine = result.output.split('\n').find((line) => line.trim()) || '';
  await logLine(ctx, `auto-start: gw.sh start ${result.ok ? 'ok' : 'failed'} — ${firstLine.trim()}`);
}

let bootTask = null;

/** Run {@link autoStartGateway} once per DSH process, off the boot path. */
function scheduleAutoStart(ctx, enabled) {
  if (bootTask) return bootTask;
  if (!enabled) {
    bootTask = Promise.resolve();
    return bootTask;
  }
  bootTask = (async () => {
    // 让 DSH 自己的 3080 先稳定下来, 再拉起会把流量转给它的网关。
    await new Promise((resolve) => setTimeout(resolve, 1200));
    try {
      await autoStartGateway(ctx);
    } catch (err) {
      await logLine(ctx, `auto-start failed: ${String((err && err.message) || err)}`);
    }
  })();
  return bootTask;
}

/**
 * Mount the gw_gateway tool + the /api/gw/* HTTP routes for the browser half.
 * @param ctx - Host plugin context.
 * @param config - Plugin config; `autoStart: false` (or DSH_GW_AUTOSTART=0) disables boot start-up.
 */
export function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {};
  ctx.inject(['webServer'], (webCtx) => {
    // The web server is up: this is the point where "DSH started" is true for real.
    const autoStart =
      cfg.autoStart !== false && !['0', 'false', 'off', 'no'].includes(String(process.env.DSH_GW_AUTOSTART || '').trim().toLowerCase());
    scheduleAutoStart(ctx, autoStart);
    const disposers = [
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/status',
        handler: async (_req, res) => {
          try {
            const payload = await gwStatusPayload();
            // functions don't cross JSON; expand qrUrl into per-LAN entries
            const { qrUrl, ...rest } = payload;
            json(res, 200, { ...rest, qrBase: `__LAN__:${GW_PORT}`, lanQr: rest.lanIps.map((ip) => ({ ip, qr: `http://${ip}:${GW_PORT}/__gw/qr` })) });
          } catch (e) {
            json(res, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/control',
        handler: async (req, res) => {
          if (req.method !== 'POST') {
            json(res, 405, { ok: false, error: 'POST only' });
            return;
          }
          let body;
          try {
            body = await readJsonBody(req);
          } catch {
            json(res, 400, { ok: false, error: 'bad json' });
            return;
          }
          const action = body && body.action;
          if (!['start', 'stop', 'restart'].includes(action)) {
            json(res, 400, { ok: false, error: 'action must be start|stop|restart' });
            return;
          }
          const result = await runGw(action);
          const store = await loadRemotes();
          const url = await tunnelUrl();
          const pub = pickPublicUrl(store, url);
          json(res, result.ok ? 200 : 500, { ...result, tunnelUrl: url, loginUrl: pub.baseUrl ? pub.baseUrl : '', publicSource: pub.source });
        },
      }),
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/remotes',
        handler: async (req, res) => {
          try {
            if (req.method === 'GET') {
              const store = await loadRemotes();
              const url = await tunnelUrl();
              json(res, 200, { ok: true, ...store, quickUrl: url });
              return;
            }
            if (req.method !== 'POST') {
              json(res, 405, { ok: false, error: 'GET or POST only' });
              return;
            }
            let body;
            try {
              body = await readJsonBody(req);
            } catch {
              json(res, 400, { ok: false, error: 'bad json' });
              return;
            }
            const op = body && body.op;
            const store = await loadRemotes();
            if (op === 'add') {
              const baseUrl = normalizeBaseUrl(body.baseUrl);
              if (!baseUrl) {
                json(res, 400, { ok: false, error: 'baseUrl 无效, 示例: https://dsh.example.com' });
                return;
              }
              if (store.remotes.some((r) => r.baseUrl === baseUrl)) {
                json(res, 400, { ok: false, error: '该地址已存在' });
                return;
              }
              const remote = { id: newRemoteId(), label: String(body.label || baseUrl).slice(0, 60), baseUrl };
              store.remotes.push(remote);
              // 第一个新增的地址自动设为当前
              if (!store.activeId) store.activeId = remote.id;
              await saveRemotes(store);
              json(res, 200, { ok: true, remote, ...store });
              return;
            }
            if (op === 'remove') {
              const id = String(body.id || '');
              store.remotes = store.remotes.filter((r) => r.id !== id);
              if (store.activeId === id) store.activeId = store.remotes.length > 0 ? store.remotes[0].id : null;
              await saveRemotes(store);
              json(res, 200, { ok: true, ...store });
              return;
            }
            if (op === 'activate') {
              const id = body.id === null ? null : String(body.id || '');
              if (id !== null && !store.remotes.some((r) => r.id === id)) {
                json(res, 400, { ok: false, error: '未知 id' });
                return;
              }
              store.activeId = id;
              await saveRemotes(store);
              json(res, 200, { ok: true, ...store });
              return;
            }
            json(res, 400, { ok: false, error: 'op must be add|remove|activate' });
          } catch (e) {
            json(res, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/qr',
        handler: async (req, res) => {
          try {
            const u = new URL(req.url, 'http://127.0.0.1').searchParams.get('u');
            if (!u) {
              json(res, 400, { ok: false, error: 'missing u param' });
              return;
            }
            let localError = '';
            try {
              const qrcode = await loadQrcode();
              const buf = await qrcode.toBuffer(u, { width: 360, margin: 2 });
              res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
              res.end(buf);
              return;
            } catch (err) {
              localError = String((err && err.message) || err);
            }
            // 网关进程自己按同目录 node_modules 解析 qrcode, 本地解析不了时借它一手。
            try {
              const proxyRes = await fetch(`http://127.0.0.1:${GW_PORT}/__gw/qr?u=${encodeURIComponent(u)}`);
              if (proxyRes.ok) {
                const buf = Buffer.from(await proxyRes.arrayBuffer());
                res.writeHead(200, { 'content-type': proxyRes.headers.get('content-type') || 'image/png', 'cache-control': 'no-store' });
                res.end(buf);
                return;
              }
            } catch {
              /* gateway down: report the local failure below */
            }
            json(res, 502, { ok: false, error: `qr generation failed: ${localError}` });
          } catch (e) {
            json(res, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/password',
        handler: async (req, res) => {
          try {
            if (req.method === 'POST') {
              let body;
              try { body = await readJsonBody(req); } catch {
                json(res, 400, { ok: false, error: 'bad json' });
                return;
              }
              const action = body && body.action;
              let newPw = '';
              if (action === 'set') {
                newPw = String(body.password || '').trim();
                if (newPw.length < 6) {
                  json(res, 400, { ok: false, error: '口令长度至少 6 位' });
                  return;
                }
              } else {
                json(res, 400, { ok: false, error: 'action must be set' });
                return;
              }

              const hash = hashPasswordScrypt(newPw);
              await mkdir(DIR, { recursive: true });
              await writeFile(HASH_FILE, hash + '\n', { mode: 0o600 });

              // 同步通知正在运行的网关更新口令并清除旧 session
              try {
                await fetch(`http://127.0.0.1:${GW_PORT}/__gw/password`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ password: newPw }),
                });
              } catch {}

              json(res, 200, { ok: true });
              return;
            }
            json(res, 405, { ok: false, error: 'POST only' });
          } catch (e) {
            json(res, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/pair/create',
        handler: async (req, res) => {
          try {
            const gwRes = await fetch(`http://127.0.0.1:${GW_PORT}/__gw/pair/create`, {
              method: 'POST',
            });
            const d = await gwRes.json();
            json(res, gwRes.status, d);
          } catch (e) {
            json(res, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/devices',
        handler: async (req, res) => {
          try {
            const gwRes = await fetch(`http://127.0.0.1:${GW_PORT}/__gw/devices`);
            const d = await gwRes.json();
            json(res, gwRes.status, d);
          } catch (e) {
            json(res, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/devices/revoke',
        handler: async (req, res) => {
          try {
            const body = await readJsonBody(req);
            const gwRes = await fetch(`http://127.0.0.1:${GW_PORT}/__gw/devices/revoke`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            });
            const d = await gwRes.json();
            json(res, gwRes.status, d);
          } catch (e) {
            json(res, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/config',
        handler: async (req, res) => {
          try {
            const gwRes = await fetch(`http://127.0.0.1:${GW_PORT}/__gw/config`, {
              method: req.method,
              headers: { 'content-type': 'application/json' },
              body: req.method === 'POST' ? JSON.stringify(await readJsonBody(req)) : undefined,
            });
            const d = await gwRes.json();
            json(res, gwRes.status, d);
          } catch (e) {
            json(res, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
      webCtx.webServer.register({
        kind: 'exact',
        path: '/api/gw/logs',
        handler: async (req, res) => {
          try {
            const gwRes = await fetch(`http://127.0.0.1:${GW_PORT}/__gw/logs`);
            const d = await gwRes.json();
            json(res, gwRes.status, d);
          } catch (e) {
            json(res, 500, { ok: false, error: String((e && e.message) || e) });
          }
        },
      }),
    ];
    return () => {
      for (const d of disposers) d();
    };
  });
  ctx.inject(['tools'], (toolsCtx) => {
    const tools = toolsCtx.tools;
    // NOTE: tools.register takes COMPILED (raw JSON Schema) shapes, unlike
    // harness.defineTool which compiles the author spec form. So `required`
    // lives on the object level as an array here.
    const dispose = tools.register({
      name: 'gw_gateway',
      description:
        'Manage the self-written DSH remote gateway (port 3081), its Cloudflare Quick Tunnel, and custom public addresses. ' +
        'Actions: status, start, stop, restart, qr (regenerate QR), remote-list, remote-add (needs baseUrl + optional label), remote-remove (needs id), remote-use (needs id, empty id falls back to Quick Tunnel).',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'status, start, stop, restart, qr, remote-list, remote-add, remote-remove, remote-use' },
          baseUrl: { type: 'string', description: 'custom public base URL for remote-add, e.g. https://dsh.example.com' },
          label: { type: 'string', description: 'optional display name for remote-add' },
          id: { type: 'string', description: 'remote id for remote-remove / remote-use (empty = Quick Tunnel fallback)' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: { type: 'string' },
            output: { type: 'string' },
            tunnelUrl: { type: 'string' },
            loginUrl: { type: 'string' },
            alive: { type: 'boolean' },
          },
          required: ['action', 'output'],
        },
        render: (_args, value) => [{ type: 'text', text: value.output || '' }],
      },
      async execute(args) {
        const action = args.action;
        const store = await loadRemotes();
        const quickUrl = await tunnelUrl();
        const fmtRemotes = () => store.remotes.length === 0
          ? '(no custom addresses)'
          : store.remotes.map((r) => `${r.id === store.activeId ? '* ' : '  '}${r.label} <${r.baseUrl}> [${r.id}]`).join('\n');
        if (action === 'remote-list') {
          const pub = pickPublicUrl(store, quickUrl);
          const out = `custom addresses:\n${fmtRemotes()}\nactive: ${pub.source === 'custom' ? pub.remote.label + ' <' + pub.remote.baseUrl + '>' : pub.source === 'quick' ? 'Quick Tunnel <' + quickUrl + '>' : '(none)'}`;
          return { action, output: out, tunnelUrl: quickUrl, loginUrl: pub.baseUrl ? pub.baseUrl : '' };
        }
        if (action === 'remote-add') {
          const baseUrl = normalizeBaseUrl(args.baseUrl);
          if (!baseUrl) throw new Error('remote-add needs a valid baseUrl, e.g. https://dsh.example.com');
          if (store.remotes.some((r) => r.baseUrl === baseUrl)) throw new Error('该地址已存在');
          const remote = { id: newRemoteId(), label: String(args.label || baseUrl).slice(0, 60), baseUrl };
          store.remotes.push(remote);
          if (!store.activeId) store.activeId = remote.id;
          await saveRemotes(store);
          return { action, output: `added: ${remote.label} <${remote.baseUrl}> [${remote.id}]\n${fmtRemotes()}`, tunnelUrl: quickUrl, loginUrl: baseUrl };
        }
        if (action === 'remote-remove') {
          const id = String(args.id || '');
          if (!id) throw new Error('remote-remove needs id (see remote-list)');
          store.remotes = store.remotes.filter((r) => r.id !== id);
          if (store.activeId === id) store.activeId = store.remotes.length > 0 ? store.remotes[0].id : null;
          await saveRemotes(store);
          return { action, output: `removed ${id}\n${fmtRemotes()}`, tunnelUrl: quickUrl, loginUrl: '' };
        }
        if (action === 'remote-use') {
          const id = args.id ? String(args.id) : null;
          if (id !== null && !store.remotes.some((r) => r.id === id)) throw new Error('未知 id (see remote-list)');
          store.activeId = id;
          await saveRemotes(store);
          const pub = pickPublicUrl(store, quickUrl);
          return { action, output: `active: ${pub.source === 'custom' ? pub.remote.label + ' <' + pub.remote.baseUrl + '>' : pub.source === 'quick' ? 'Quick Tunnel' : '(none)'}`, tunnelUrl: quickUrl, loginUrl: pub.baseUrl ? pub.baseUrl : '' };
        }
        if (!['status', 'start', 'stop', 'restart', 'qr'].includes(action)) {
          throw new Error(`gw_gateway: unknown action ${JSON.stringify(action)}`);
        }
        const probe = await gatewayAlive();
        const result = await runGw(action);
        const pub = pickPublicUrl(store, quickUrl);
        const lines = [result.output.trim()];
        if (action === 'status') lines.push(`probe: gateway ${probe.alive ? 'alive' : 'down'} on :${GW_PORT}`);
        if (pub.baseUrl) lines.push(`public (${pub.source}): ${pub.baseUrl}`);
        else if (quickUrl) lines.push(`tunnel: ${quickUrl}`);
        return {
          action,
          output: lines.filter(Boolean).join('\n'),
          tunnelUrl: quickUrl,
          loginUrl: pub.baseUrl ? pub.baseUrl : '',
          alive: Boolean(probe && probe.alive),
        };
      },
    });
    return dispose;
  });
}
