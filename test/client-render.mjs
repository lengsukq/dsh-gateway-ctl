// 轻量渲染冒烟测试: 用假 React 钩子跑通 lib/client.js 的组件树(不依赖真实 React)。
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

const DATA = {
  ok: true, alive: true, port: 3081,
  gateway: {
    ok: true, listen: 3081, authed: true, upstream: '127.0.0.1:3080', clientIp: '10.0.111.99',
    config: { deviceTtlDays: 365, pairTtlSeconds: 90 },
    overlayCidrs: ['10.0.111.0/24', '198.18.0.0/15', '100.64.0.0/10'],
    port3080Exposed: false, dshCosign: true, sessions: 2, devices: 3, adminKeyPresent: true,
  },
  tunnelUrl: '', loginUrl: 'https://dsh.lengsu.top', publicSource: 'custom',
  activeRemote: { id: 'r1', label: '我的', baseUrl: 'https://dsh.lengsu.top' },
  remotes: [{ id: 'r1', label: '我的', baseUrl: 'https://dsh.lengsu.top' }],
  lanIps: ['192.168.31.2', '10.0.111.99'],
  lanQr: [{ ip: '192.168.31.2', qr: 'http://192.168.31.2:3081/__gw/qr' }],
};

const DEVICES = [
  { id: 'dev_a1', name: 'Android · Chrome', ua: 'Mozilla/5.0 (Linux; Android 17)', status: 'active', createdAt: '2026-10-01T01:00:00.000Z', expiresAt: '2027-10-01T01:00:00.000Z', lastActiveAt: '2026-10-18T09:07:15.295Z', createdIp: '192.168.31.193', lastIp: '10.0.111.2' },
  { id: 'dev_a2', name: 'Android · Chrome', ua: 'Mozilla/5.0 (Linux; Android 17)', status: 'active', createdAt: '2026-10-02T01:00:00.000Z', expiresAt: '2027-10-02T01:00:00.000Z', lastActiveAt: '2026-10-19T09:07:15.295Z', createdIp: '10.0.111.99', lastIp: '10.0.111.99' },
  { id: 'dev_b1', name: 'iPhone · Safari', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5)', status: 'active', createdAt: '2026-09-22T15:25:44.459Z', expiresAt: '2027-09-22T15:25:44.459Z', lastActiveAt: '2026-09-22T15:29:16.627Z', createdIp: '127.0.0.1', lastIp: '203.0.113.9' },
  { id: 'dev_c1', name: 'Windows · Edge', ua: 'Mozilla/5.0 (Windows NT 10.0)', status: 'revoked', createdAt: '2026-09-01T01:00:00.000Z', expiresAt: '2027-09-01T01:00:00.000Z', lastActiveAt: '2026-09-02T01:00:00.000Z', createdIp: '10.0.111.102', lastIp: '10.0.111.102' },
];

const KEY_SUMMARY = {
  ok: true,
  admin: { exists: true, ageDays: 1, mode: '600' },
  password: { exists: true, updatedAt: '2026-10-20T00:00:00.000Z' },
  sessions: { count: 2, ttlHours: 24 },
  devices: { active: 3, expired: 0, revoked: 1, total: 4, ttlDays: 365 },
  dshCosign: { ok: true },
};

function fakeFetch(url) {
  const s = String(url || '');
  let payload = { ok: true };
  if (s.includes('/api/gw/status')) payload = DATA;
  else if (s.includes('/api/gw/devices')) payload = { ok: true, devices: DEVICES };
  else if (s.includes('/api/gw/keys')) payload = KEY_SUMMARY;
  else if (s.includes('/api/gw/logs')) payload = { ok: true, logs: [] };
  else if (s.includes('/api/gw/pair/create')) payload = { ok: true, token: 'pair-token-abcdefghijklmnop', expiresAt: Date.now() + 90000, ttlSeconds: 90 };
  else if (s.includes('/api/gw/config')) payload = { ok: true, config: { deviceTtlDays: 365, pairTtlSeconds: 90 } };
  return Promise.resolve({ ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) });
}

// ---- 假 React ----
let hookIndex = 0;
let pass = { tab: 'qr', mode: 'panel', entryOpen: false };
let nullSeen = 0;
const hookLog = [];
let PanelType = null;

function makeReact(withPanelCapture) {
  return {
    useState(init) {
      const idx = hookIndex++;
      hookLog.push([idx, init === null ? 'null' : Array.isArray(init) ? '[]' : typeof init === 'object' ? '{}' : String(init)]);
      let value = init;
      if (pass.mode === 'entry') {
        if (idx === 0) value = pass.entryOpen;
        else if (idx === 1) value = true;
        return [value, () => {}];
      }
      if (init && typeof init === 'object' && init.kind === 'loading') value = { kind: 'ready', data: DATA, refreshing: false };
      else if (init === 'loading') value = { kind: 'ready', data: DATA, refreshing: false };
      else if (init === 'qr') value = pass.tab;
      else if (Array.isArray(init)) value = DEVICES;
      else if (init === null) { nullSeen += 1; if (nullSeen === 2) value = KEY_SUMMARY; }
      else if (init && typeof init === 'object') value = new Proxy({}, { get: () => true });
      if (pass.force && Object.prototype.hasOwnProperty.call(pass.force, idx)) value = pass.force[idx];
      return [value, () => {}];
    },
    useEffect() { hookIndex += 1; },
    useCallback(fn) { hookIndex += 1; return fn; },
    useMemo(fn) { hookIndex += 1; return fn(); },
    useRef(v) { hookIndex += 1; return { current: v }; },
    Fragment: 'Fragment',
    createElement(type, props, ...children) {
      if (withPanelCapture && typeof type === 'function' && type.name === 'GatewayPanel') PanelType = type;
      return { type, props: props || {}, children };
    },
  };
}

const ReactDOM = { createPortal(node) { return node; } };

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  URL, Date, Math, JSON, Promise, Map, Set, RegExp, Error, Proxy, Number, String, Boolean, Array, Object,
  fetch: fakeFetch,
  window: {
    location: { host: '127.0.0.1:3080', protocol: 'http:', origin: 'http://127.0.0.1:3080', href: 'http://127.0.0.1:3080/' },
    addEventListener() {}, removeEventListener() {}, confirm: () => true, open: () => {},
  },
  document: {
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
  },
  navigator: { clipboard: { writeText: async () => {} }, userAgent: 'node' },
};
sandbox.window.__ModuleLoader__ = { load(m) { sandbox.__mod = m; } };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const mod = sandbox.__mod.factory((name) => (name === 'react' ? makeReact(true) : name === 'react-dom' ? ReactDOM : {}));
let Entry = null;
mod.apply({ slots: { inject(_n, fn) { fn(); }, register(_s, c) { Entry = c; return () => {}; } } });
if (!Entry) {
  console.error('✗ GatewayEntry 未注册');
  process.exit(1);
}

// 打开态渲染入口, 借此捕获 GatewayPanel 组件类型
pass = { mode: 'entry', entryOpen: true };
hookIndex = 0;
Entry({ wide: false });
if (!PanelType) {
  console.error('✗ 未捕获 GatewayPanel');
  process.exit(1);
}

function collectText(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out)); return out; }
  if (typeof node === 'object' && Array.isArray(node.children)) node.children.forEach((c) => collectText(c, out));
  return out;
}

let failed = 0;
const expectations = {
  qr: ['公网远程访问', '局域网直连 (扫码配对)', '复制一次性配对链接', '/__gw/pair?t=pairTok123'],
  remotes: ['管理用于外网访问的域名', '我的'],
  settings: [
    '凭证与密钥（持久化）', '访问策略与局域网入口', '撤销全部设备', 'Android · Chrome', 'IP 来源:',
    '192.168.31.193 · 局域网', '10.0.111.2 · 组网/代理', '203.0.113.9 · 公网', '127.0.0.1 · 本机',
    '已失效 1 台', '全部来源需登录', '轮换内部密钥', '2 台',
  ],
};

for (const tab of Object.keys(expectations)) {
  try {
    pass = { mode: 'panel', tab, entryOpen: false, force: tab === 'qr' ? { 7: 'pairTok123', 8: Date.now() + 60000, 9: 90 } : {} };
    hookIndex = 0;
    nullSeen = 0;
    const tree = PanelType({ onClose: () => {} });
    if (process.env.GW_DUMP_HOOKS === tab) console.log(hookLog.map((x) => x.join(':')).join(' '));
    const joined = collectText(tree).join(' | ');
    const missing = expectations[tab].filter((m) => !joined.includes(m));
    if (missing.length) {
      console.error(`✗ tab=${tab}: 缺少 ${JSON.stringify(missing)}\n  实际片段: ${joined.slice(0, 500)}`);
      failed += 1;
    } else {
      console.log(`✓ tab=${tab}: 渲染正常`);
    }
  } catch (e) {
    console.error(`✗ tab=${tab}: 渲染抛错\n${(e && e.stack) || e}`);
    failed += 1;
  }
}

// 只读(扫码设备)态: 必须出现只读横幅与口令登出入口
try {
  DATA.canManage = false;
  pass = { mode: 'panel', tab: 'settings', entryOpen: false, force: {} };
  hookIndex = 0;
  nullSeen = 0;
  const tree = PanelType({ onClose: () => {} });
  const joined = collectText(tree).join(' | ');
  const need = ['此设备是扫码配对设备（只读）', '用口令登录 →'];
  const missing = need.filter((m) => !joined.includes(m));
  if (missing.length) {
    console.error(`✗ 只读态缺少 ${JSON.stringify(missing)}`);
    failed += 1;
  } else {
    console.log('✓ 只读态（扫码设备）横幅正常');
  }
} catch (e) {
  console.error(`✗ 只读态渲染抛错\n${(e && e.stack) || e}`);
  failed += 1;
} finally {
  DATA.canManage = true;
}

// 关闭态的侧栏入口
try {
  pass = { mode: 'entry', entryOpen: false };
  hookIndex = 0;
  Entry({ wide: false });
  console.log('✓ 侧栏入口(关闭态)渲染正常');
} catch (e) {
  console.error(`✗ 侧栏入口渲染抛错\n${(e && e.stack) || e}`);
  failed += 1;
}

process.exit(failed === 0 ? 0 : 1);
