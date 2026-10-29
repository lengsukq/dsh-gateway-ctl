// DSH 远程网关自检 (零依赖): node gateway/selftest.mjs
// 在临时 GW_DIR + 随机端口 + 假 upstream 上验证"统一门禁 / 持久化凭证 / 设备到期"的全部断言。
// 任何一条失败都会以非零状态退出, 便于 CI 或部署前手工跑一遍。
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATEWAY = fileURLToPath(new URL('./gateway.mjs', import.meta.url));
const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
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

function startUpstream() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`UPSTREAM_OK ${req.url}`);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function startGateway(dir, port, upstreamPort) {
  const child = spawn(process.execPath, [GATEWAY], {
    env: { ...process.env, GW_DIR: dir, GW_PORT: String(port), GW_UPSTREAM_PORT: String(upstreamPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { child, out: '' };
  child.stdout.on('data', (d) => { state.out += String(d); });
  child.stderr.on('data', (d) => { state.out += String(d); });
  return state;
}

async function waitForGateway(port, state, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state && state.child.exitCode !== null) throw new Error(`gateway exited early:\n${state.out}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__gw/status`, { redirect: 'manual' });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`gateway did not answer on :${port}\n${state ? state.out : ''}`);
}

function stopGateway(state) {
  return new Promise((resolve) => {
    if (!state || state.child.exitCode !== null) {
      resolve();
      return;
    }
    state.child.once('exit', () => resolve());
    state.child.kill('SIGTERM');
    setTimeout(() => {
      try { state.child.kill('SIGKILL'); } catch {}
    }, 2000).unref();
  });
}

async function call(port, method, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers,
    body: options.body,
    redirect: 'manual',
  });
  const text = await res.text();
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, headers: res.headers, text, setCookies };
}

function pickCookie(setCookies, name) {
  for (const raw of setCookies) {
    const first = raw.split(';')[0];
    const eq = first.indexOf('=');
    if (eq < 0) continue;
    if (first.slice(0, eq).trim() === name) return first.trim();
  }
  return '';
}

function upgradeAttempt(port, headers) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version': '13',
        ...headers,
      },
    });
    req.on('response', (res) => resolve(res.statusCode));
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.end();
  });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-selftest-'));
const port = await freePort();
const upstream = await startUpstream();
let gw = null;

// 预置 config.json: 故意写 lanAuth:false, 验证它已完全失效
fs.writeFileSync(
  path.join(dir, 'config.json'),
  JSON.stringify({ lanAuth: false, deviceTtlDays: 365, pairTtlSeconds: 90 }, null, 2) + '\n',
  { mode: 0o600 },
);

try {
  gw = startGateway(dir, port, upstream.port);
  await waitForGateway(port, gw);

  const bootLog = gw.out;
  const password = (bootLog.match(/FIRST_START_PASSWORD=([A-Za-z0-9]+)/) || [])[1] || '';
  const adminKeyPath = path.join(dir, '.gw_admin');
  const adminKey = fs.readFileSync(adminKeyPath, 'utf8').trim();
  const admin = { 'x-gw-admin': adminKey };

  check('首次启动生成随机口令', password.length >= 12, bootLog);
  check('内部管理密钥文件存在且 0600', fs.existsSync(adminKeyPath) && (fs.statSync(adminKeyPath).mode & 0o777) === 0o600, adminKeyPath);

  // 1) 公开状态只给最小字段
  const status = await call(port, 'GET', '/__gw/status');
  const statusBody = JSON.parse(status.text);
  check('公开 /__gw/status 仅最小字段', status.status === 200 && statusBody.ok === true && !('upstream' in statusBody) && !('clientIp' in statusBody) && !('config' in statusBody), status.text);

  // 2) 回环无凭证 = 拒绝 (核心回归: 修复前 200)
  const cfgNoAuth = await call(port, 'GET', '/__gw/config');
  check('回环无凭证 /__gw/config → 403', cfgNoAuth.status === 403, `${cfgNoAuth.status} ${cfgNoAuth.text}`);

  // 3) 内部管理密钥可用
  const cfgAdmin = await call(port, 'GET', '/__gw/config', { headers: admin });
  const cfgAdminBody = JSON.parse(cfgAdmin.text);
  check('内部密钥 /__gw/config → 200', cfgAdmin.status === 200 && cfgAdminBody.config.deviceTtlDays === 365, cfgAdmin.text);

  // 4) 设备列表: 无凭证 403, 有凭证且无 tokenHash
  const devNoAuth = await call(port, 'GET', '/__gw/devices');
  const devAdmin = await call(port, 'GET', '/__gw/devices', { headers: admin });
  check('无凭证 /__gw/devices → 403', devNoAuth.status === 403, String(devNoAuth.status));
  check('有密钥 /__gw/devices → 200 且不含 tokenHash', devAdmin.status === 200 && !devAdmin.text.includes('tokenHash'), devAdmin.text.slice(0, 160));

  // 5) 页面门禁
  const rootNoAuth = await call(port, 'GET', '/');
  check('无凭证 / → 303 /__gw/login', rootNoAuth.status === 303 && rootNoAuth.headers.get('location') === '/__gw/login', `${rootNoAuth.status} ${rootNoAuth.headers.get('location')}`);

  // 6) 伪造转发头不能换到任何特权 (凭证不看 IP)
  const rootSpoof = await call(port, 'GET', '/', { headers: { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '10.0.111.99' } });
  check('伪造 cf-connecting-ip / XFF 仍被拦', rootSpoof.status === 303 && rootSpoof.headers.get('location') === '/__gw/login', String(rootSpoof.status));

  // 7) 口令登录 (错误 → 正确)
  const badLogin = await call(port, 'POST', '/__gw/login', { body: 'password=nope', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const okLogin = await call(port, 'POST', '/__gw/login', { body: `password=${encodeURIComponent(password)}`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const sessionCookie = pickCookie(okLogin.setCookies, 'gw_session');
  const dshCookie = pickCookie(okLogin.setCookies, 'dsh-auth-' + 'x');
  const hasCosign = okLogin.setCookies.some((c) => c.startsWith('dsh-auth-'));
  check('错误口令返回登录页', badLogin.status === 200 && badLogin.text.includes('口令错误'), String(badLogin.status));
  check('正确口令 → 303 / 且 URL 不含 token=', okLogin.status === 303 && okLogin.headers.get('location') === '/', `${okLogin.status} ${okLogin.headers.get('location')}`);
  check('登录同时代签 DSH Cookie', hasCosign && !dshCookie, okLogin.setCookies.map((c) => c.split('=')[0]).join(','));

  // 8) 会话放行 + 代理
  const rootAuthed = await call(port, 'GET', '/', { cookie: sessionCookie });
  const proxiedApi = await call(port, 'GET', '/api/gw/status', { cookie: sessionCookie });
  check('会话 Cookie 放行页面', rootAuthed.status === 200 && rootAuthed.text.includes('UPSTREAM_OK'), `${rootAuthed.status} ${rootAuthed.text.slice(0, 60)}`);
  check('会话 Cookie 放行 /api 代理', proxiedApi.status === 200, String(proxiedApi.status));

  // 9) sessions.json 只存哈希
  const sessionsFile = path.join(dir, 'sessions.json');
  const sessionsRaw = fs.readFileSync(sessionsFile, 'utf8');
  const sessionToken = sessionCookie.split('=')[1];
  const sessionsParsed = JSON.parse(sessionsRaw);
  check('sessions.json 不保存原始 Cookie', !sessionsRaw.includes(sessionToken) && sessionsParsed.sessions.length >= 1, sessionsRaw.slice(0, 200));
  check('sessions.json 为 0600', (fs.statSync(sessionsFile).mode & 0o777) === 0o600, String(fs.statSync(sessionsFile).mode & 0o777));

  // 10) 重启后会话仍有效 (持久化)
  await stopGateway(gw);
  gw = startGateway(dir, port, upstream.port);
  await waitForGateway(port, gw);
  const adminKeyAfterRestart = fs.readFileSync(adminKeyPath, 'utf8').trim();
  const rootAfterRestart = await call(port, 'GET', '/', { cookie: sessionCookie });
  check('网关重启后会话仍有效', rootAfterRestart.status === 200 && rootAfterRestart.text.includes('UPSTREAM_OK'), `${rootAfterRestart.status}`);
  check('内部管理密钥跨重启保持不变', adminKeyAfterRestart === adminKey, adminKeyAfterRestart.slice(0, 6));

  // 11) 配对令牌: 创建 → 消费 → 重放
  const pairCreate = await call(port, 'POST', '/__gw/pair/create', { headers: admin });
  const pairToken = JSON.parse(pairCreate.text).token;
  const pairUse = await call(port, 'GET', `/__gw/pair?t=${encodeURIComponent(pairToken)}`);
  const deviceCookie = pickCookie(pairUse.setCookies, 'gw_device');
  const pairReplay = await call(port, 'GET', `/__gw/pair?t=${encodeURIComponent(pairToken)}`);
  check('配对令牌签发 (POST + 密钥)', pairCreate.status === 200 && typeof pairToken === 'string' && pairToken.length >= 32, pairCreate.text);
  check('扫码消费 → 303 / 并种设备凭证', pairUse.status === 303 && pairUse.headers.get('location') === '/' && deviceCookie.startsWith('gw_device='), `${pairUse.status} ${deviceCookie.slice(0, 20)}`);
  check('配对令牌重放 → 400', pairReplay.status === 400, String(pairReplay.status));

  const deviceRoot = await call(port, 'GET', '/', { cookie: deviceCookie });
  check('设备凭证放行页面', deviceRoot.status === 200, String(deviceRoot.status));

  // 12) 设备凭证到期 (服务端校验)
  const devicesFile = path.join(dir, 'devices.json');
  const deviceList = readJson(devicesFile, []);
  const past = new Date(Date.now() - 60_000).toISOString();
  for (const d of deviceList) d.expiresAt = past;
  fs.writeFileSync(devicesFile, JSON.stringify(deviceList, null, 2) + '\n', { mode: 0o600 });
  const expiredRoot = await call(port, 'GET', '/', { cookie: deviceCookie });
  check('过期设备凭证被拒绝', expiredRoot.status === 303 && expiredRoot.headers.get('location') === '/__gw/login', String(expiredRoot.status));
  const expiredStatus = readJson(devicesFile, []).map((d) => d.status);
  check('过期设备被标记 status=expired', expiredStatus.includes('expired'), JSON.stringify(expiredStatus));

  // 13) 撤销全部设备
  const pair2 = await call(port, 'POST', '/__gw/pair/create', { headers: admin });
  const token2 = JSON.parse(pair2.text).token;
  const pair2Use = await call(port, 'GET', `/__gw/pair?t=${encodeURIComponent(token2)}`);
  const device2 = pickCookie(pair2Use.setCookies, 'gw_device');
  const revokeAll = await call(port, 'POST', '/__gw/devices/revoke', { headers: admin, body: JSON.stringify({ all: true }) });
  const device2Root = await call(port, 'GET', '/', { cookie: device2 });
  check('撤销全部设备 → revoked>0', revokeAll.status === 200 && JSON.parse(revokeAll.text).revoked >= 1, revokeAll.text);
  check('撤销后设备凭证立即失效', device2Root.status === 303, String(device2Root.status));

  // 14) 密钥轮换
  const rotate = await call(port, 'POST', '/__gw/admin/rotate-key', { headers: admin });
  const cfgOldKey = await call(port, 'GET', '/__gw/config', { headers: admin });
  const newKey = fs.readFileSync(adminKeyPath, 'utf8').trim();
  const cfgNewKey = await call(port, 'GET', '/__gw/config', { headers: { 'x-gw-admin': newKey } });
  check('轮换内部密钥 → 200', rotate.status === 200 && newKey !== adminKey, rotate.text);
  check('旧密钥立即失效 (403)', cfgOldKey.status === 403, String(cfgOldKey.status));
  check('新密钥立即生效 (200)', cfgNewKey.status === 200, String(cfgNewKey.status));

  // 15) 配置: lanAuth 已废弃, deviceTtlDays 可改
  const cfgPost = await call(port, 'POST', '/__gw/config', { headers: { 'x-gw-admin': newKey }, body: JSON.stringify({ deviceTtlDays: 30 }) });
  const cfgLanAuth = await call(port, 'POST', '/__gw/config', { headers: { 'x-gw-admin': newKey }, body: JSON.stringify({ lanAuth: false }) });
  check('deviceTtlDays 可设置', cfgPost.status === 200 && JSON.parse(cfgPost.text).config.deviceTtlDays === 30, cfgPost.text);
  check('lanAuth 写入被明确拒绝', cfgLanAuth.status === 400, `${cfgLanAuth.status} ${cfgLanAuth.text}`);

  // 16) 密钥总览不泄露秘密
  const keys = await call(port, 'GET', '/__gw/admin/keys', { headers: { 'x-gw-admin': newKey } });
  const keysBody = JSON.parse(keys.text);
  check('密钥总览只返回元信息', keys.status === 200 && keysBody.admin.exists === true && !keys.text.includes(newKey) && !keys.text.includes(sessionToken), keys.text.slice(0, 200));
  check('密钥总览包含会话/设备计数', typeof keysBody.sessions.count === 'number' && typeof keysBody.devices.active === 'number', JSON.stringify(keysBody.sessions));

  // 17) 强制全部会话重新登录
  const revokeSessions = await call(port, 'POST', '/__gw/admin/revoke-sessions', { headers: { 'x-gw-admin': newKey } });
  const rootAfterRevoke = await call(port, 'GET', '/', { cookie: sessionCookie });
  check('撤销全部会话 → 原会话失效', revokeSessions.status === 200 && rootAfterRevoke.status === 303, `${revokeSessions.text} / ${rootAfterRevoke.status}`);

  // 18) WebSocket 门禁
  const wsNoAuth = await upgradeAttempt(port, {});
  check('WebSocket 无凭证 → 401', wsNoAuth === 401, String(wsNoAuth));

  // 19) 口令登录限流 (放最后, 会把 127.0.0.1 锁住)
  let lastStatus = 200;
  for (let i = 0; i < 6; i += 1) {
    const r = await call(port, 'POST', '/__gw/login', { body: 'password=definitely-wrong', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    lastStatus = r.status;
  }
  check('连续失败后返回 429 锁定', lastStatus === 429, String(lastStatus));
} catch (error) {
  check('自检未抛异常', false, String((error && error.stack) || error));
} finally {
  await stopGateway(gw);
  await new Promise((resolve) => upstream.server.close(resolve));
  if (process.env.GW_SELFTEST_KEEP === '1') console.log(`\n[selftest] 保留临时目录: ${dir}`);
  else fs.rmSync(dir, { recursive: true, force: true });
}

const total = results.length;
console.log(`\n${failed === 0 ? '\x1b[32m' : '\x1b[31m'}${total - failed}/${total} 断言通过\x1b[0m`);
process.exit(failed === 0 ? 0 : 1);
