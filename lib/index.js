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
 */
import { execFile } from 'node:child_process';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import crypto from 'node:crypto';

/** Stable cordis plugin name. */
export const name = 'gateway-ctl';

const DIR = join(homedir(), '.dsh', 'gateway');
const GW_SH = join(DIR, 'gw.sh');
const GW_PORT = 3081;
const REMOTES_FILE = join(DIR, 'remotes.json');
const PW_FILE = join(DIR, '.gw_secret');
const HASH_FILE = join(DIR, '.gw_password');

function makeRandomPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function sha256hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
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
    execFile(GW_SH, [action], { cwd: DIR, timeout: timeoutMs }, (error, stdout, stderr) => {
      const output = String(stdout || '') + String(stderr || '');
      if (error) resolve({ ok: false, action, output: output || String(error.message || error) });
      else resolve({ ok: true, action, output });
    });
  });
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

/**
 * Mount the gw_gateway tool + the /api/gw/* HTTP routes for the browser half.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
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
            try {
              const qrcodeModule = await import('/Users/leo/.dsh/gateway/node_modules/qrcode/lib/index.js');
              const qrcode = qrcodeModule.default || qrcodeModule;
              const buf = await qrcode.toBuffer(u, { width: 360, margin: 2 });
              res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
              res.end(buf);
              return;
            } catch (err) {
              const proxyRes = await fetch(`http://127.0.0.1:${GW_PORT}/__gw/qr?u=${encodeURIComponent(u)}`);
              if (proxyRes.ok) {
                const buf = Buffer.from(await proxyRes.arrayBuffer());
                res.writeHead(200, { 'content-type': proxyRes.headers.get('content-type') || 'image/png', 'cache-control': 'no-store' });
                res.end(buf);
                return;
              }
              json(res, 502, { ok: false, error: 'qr generation failed' });
            }
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
            if (req.method === 'GET') {
              let pw = '';
              try { pw = (await readFile(PW_FILE, 'utf8')).trim(); } catch {}
              if (!pw) {
                json(res, 404, { ok: false, error: '口令文件不存在' });
                return;
              }
              json(res, 200, { ok: true, password: pw });
              return;
            }
            if (req.method === 'POST') {
              let body;
              try { body = await readJsonBody(req); } catch {
                json(res, 400, { ok: false, error: 'bad json' });
                return;
              }
              const action = body && body.action;
              let newPw = '';
              if (action === 'rotate') {
                newPw = makeRandomPassword(12);
              } else if (action === 'set') {
                newPw = String(body.password || '').trim();
                if (newPw.length < 6) {
                  json(res, 400, { ok: false, error: '口令长度至少 6 位' });
                  return;
                }
              } else {
                json(res, 400, { ok: false, error: 'action must be set or rotate' });
                return;
              }

              const hash = sha256hex(newPw);
              await mkdir(DIR, { recursive: true });
              await writeFile(PW_FILE, newPw + '\n', { mode: 0o600 });
              await writeFile(HASH_FILE, hash + '\n', { mode: 0o600 });

              // 同步通知正在运行的网关更新口令并清除旧 session
              try {
                await fetch(`http://127.0.0.1:${GW_PORT}/__gw/password`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ password: newPw }),
                });
              } catch {}

              json(res, 200, { ok: true, password: newPw });
              return;
            }
            json(res, 405, { ok: false, error: 'GET or POST only' });
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
