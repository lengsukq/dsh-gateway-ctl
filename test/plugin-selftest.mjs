// 插件 Host 侧自检: node test/plugin-selftest.mjs
// 用一个"只认内部管理密钥"的假网关, 验证 lib/index.js 里每个 /api/gw/* 路由
// 都确实带上了 x-gw-admin、并且同源校验真的拦得住跨站 POST。
// 这一步能抓住"网关侧自检通过、但插件忘了带密钥"这类只在线上才暴露的问题。
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  if (!ok) failed += 1;
  const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${mark} ${name}${ok || !detail ? '' : `\n    ${detail}`}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-plugin-selftest-'));
const adminKey = crypto.randomBytes(32).toString('base64url');
fs.writeFileSync(path.join(dir, '.gw_admin'), adminKey + '\n', { mode: 0o600 });

const port = await freePort();
const seen = [];

const FULL_STATUS = {
  ok: true,
  listen: port,
  authed: true,
  upstream: '127.0.0.1:3080',
  clientIp: '203.0.113.9',
  config: { deviceTtlDays: 365, pairTtlSeconds: 90 },
  overlayCidrs: ['10.0.111.0/24'],
  port3080Exposed: false,
  dshCosign: true,
  sessions: 1,
  devices: 12,
  adminKeyPresent: true,
};

const gateway = http.createServer((req, res) => {
  const authed = req.headers['x-gw-admin'] === adminKey;
  seen.push({ method: req.method, path: req.url, authed });
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const guard = () => {
    if (authed) return true;
    send(403, { ok: false, error: 'unauthorized' });
    return false;
  };
  if (req.url === '/__gw/status') {
    send(200, authed ? FULL_STATUS : { ok: true, listen: port, authed: false, time: new Date().toISOString() });
    return;
  }
  if (!guard()) return;
  if (req.url === '/__gw/devices') { send(200, { ok: true, devices: [{ id: 'dev_1', name: 'iPhone · Safari', status: 'active', expiresAt: '2027-09-22T00:00:00.000Z' }] }); return; }
  if (req.url === '/__gw/pair/create') { send(200, { ok: true, token: 'tok-abcdefghijklmnopqrstuvwxyz', expiresAt: Date.now() + 90000, ttlSeconds: 90 }); return; }
  if (req.url === '/__gw/admin/keys') { send(200, { ok: true, admin: { exists: true, ageDays: 0 }, sessions: { count: 1 }, devices: { active: 12 } }); return; }
  if (req.url === '/__gw/logs') { send(200, { ok: true, logs: [] }); return; }
  if (req.url === '/__gw/devices/revoke') { send(200, { ok: true, revoked: 1 }); return; }
  if (req.url === '/__gw/config') { send(200, { ok: true, config: { deviceTtlDays: 365, pairTtlSeconds: 90 } }); return; }
  send(404, { ok: false, error: 'not found' });
});

await new Promise((resolve) => gateway.listen(port, '127.0.0.1', resolve));

process.env.DSH_GW_DIR = dir;
process.env.GW_PORT = String(port);

const routes = new Map();
const tools = new Map();
const ctx = {
  logger: () => ({ info() {}, warn() {}, error() {} }),
  inject(deps, fn) {
    if (deps.includes('webServer')) {
      fn({ webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path); } } });
    }
    if (deps.includes('tools')) {
      fn({ tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name); } } });
    }
  },
};

function callRoute(pathname, { method = 'GET', body, headers = {}, noCsrf = false } = {}) {
  return new Promise((resolve, reject) => {
    const handler = routes.get(pathname);
    if (!handler) {
      reject(new Error(`route not registered: ${pathname}`));
      return;
    }
    const payload = body === undefined ? '' : JSON.stringify(body);
    const baseHeaders = { host: '127.0.0.1:3080', ...headers };
    if (method !== 'GET' && !noCsrf && !baseHeaders['x-gw-request']) baseHeaders['x-gw-request'] = '1';
    const req = {
      method,
      url: pathname,
      headers: baseHeaders,
      on(event, cb) {
        if (event === 'data' && payload) cb(Buffer.from(payload));
        if (event === 'end') cb();
        return req;
      },
      destroy() {},
    };
    const res = {
      statusCode: 0,
      headers: {},
      body: '',
      writeHead(code, hdrs) { this.statusCode = code; this.headers = hdrs || {}; return this; },
      end(chunk) {
        this.body = chunk ? String(chunk) : '';
        let parsed = null;
        try { parsed = JSON.parse(this.body); } catch { parsed = null; }
        resolve({ status: this.statusCode, body: parsed, raw: this.body, headers: this.headers });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

try {
  const mod = await import('../lib/index.js');
  check('插件导出 name=gateway-ctl 与 apply', mod.name === 'gateway-ctl' && typeof mod.apply === 'function');
  mod.apply(ctx, { autoStart: false });
  await new Promise((resolve) => setTimeout(resolve, 50));

  check('注册了 /api/gw/* 路由', ['/api/gw/status', '/api/gw/keys', '/api/gw/devices', '/api/gw/config'].every((p) => routes.has(p)), [...routes.keys()].join(','));
  check('注册了 gw_gateway 工具', tools.has('gw_gateway'), [...tools.keys()].join(','));

  // 核心回归: 探测状态时必须带内部管理密钥, 否则只有最小字段
  const status = await callRoute('/api/gw/status');
  check('/api/gw/status 返回全量网关状态', status.status === 200 && status.body.gateway && status.body.gateway.authed === true, JSON.stringify(status.body && status.body.gateway));
  check('/api/gw/status 带出 config / overlayCidrs', Boolean(status.body.gateway.config && status.body.gateway.config.deviceTtlDays === 365 && Array.isArray(status.body.gateway.overlayCidrs)), JSON.stringify(status.body.gateway));

  const keys = await callRoute('/api/gw/keys');
  check('/api/gw/keys 通过内部密钥认证', keys.status === 200 && keys.body.ok === true && keys.body.admin.exists === true, keys.raw);

  const devices = await callRoute('/api/gw/devices');
  check('/api/gw/devices 通过内部密钥认证', devices.status === 200 && Array.isArray(devices.body.devices), devices.raw);

  const pair = await callRoute('/api/gw/pair/create', { method: 'POST' });
  check('/api/gw/pair/create 通过内部密钥认证', pair.status === 200 && typeof pair.body.token === 'string', pair.raw);

  const configCross = await callRoute('/api/gw/config', {
    method: 'POST',
    body: { deviceTtlDays: 30 },
    headers: { origin: 'https://evil.example' },
  });
  check('跨站 POST /api/gw/config 被同源校验拦下', configCross.status === 403, configCross.raw);

  const configSame = await callRoute('/api/gw/config', {
    method: 'POST',
    body: { deviceTtlDays: 30 },
    headers: { origin: 'http://127.0.0.1:3080' },
  });
  check('同源 POST /api/gw/config 正常转发', configSame.status === 200 && configSame.body.config.deviceTtlDays === 365, configSame.raw);

  const revokeCross = await callRoute('/api/gw/devices/revoke', { method: 'POST', body: { all: true }, headers: { referer: 'https://evil.example/x' } });
  check('跨站 POST /api/gw/devices/revoke 被拦下', revokeCross.status === 403, revokeCross.raw);

  const controlCross = await callRoute('/api/gw/control', { method: 'POST', body: { action: 'restart' }, headers: { origin: 'https://evil.example' } });
  check('跨站 POST /api/gw/control 被拦下', controlCross.status === 403, controlCross.raw);

  const remotesCross = await callRoute('/api/gw/remotes', { method: 'POST', body: { op: 'activate', id: null }, headers: { origin: 'https://evil.example' } });
  check('跨站 POST /api/gw/remotes 被拦下', remotesCross.status === 403, remotesCross.raw);

  const noCsrf = await callRoute('/api/gw/remotes', { method: 'POST', body: { op: 'activate', id: null }, noCsrf: true });
  check('缺 x-gw-request 的改动请求被拦下', noCsrf.status === 403 && /x-gw-request/.test(noCsrf.raw), noCsrf.raw);

  const statusDevice = await callRoute('/api/gw/status', { headers: { 'x-gw-auth': 'device' } });
  check('x-gw-auth=device → canManage=false', statusDevice.status === 200 && statusDevice.body.canManage === false, String(statusDevice.body && statusDevice.body.canManage));

  const statusLocal = await callRoute('/api/gw/status');
  check('无 x-gw-auth（本机直连）→ canManage=true', statusLocal.status === 200 && statusLocal.body.canManage === true, String(statusLocal.body && statusLocal.body.canManage));

  check('所有网关调用都带了 x-gw-admin', seen.length > 0 && seen.every((entry) => entry.authed), JSON.stringify(seen.filter((e) => !e.authed)));
} catch (error) {
  check('插件自检未抛异常', false, String((error && error.stack) || error));
} finally {
  await new Promise((resolve) => gateway.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}

const total = results.length;
console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${total - failed}/${total} 断言通过\x1b[0m`);
process.exit(failed === 0 ? 0 : 1);
