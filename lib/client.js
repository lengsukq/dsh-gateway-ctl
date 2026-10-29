/* dsh-gateway-ctl browser half: modern remote gateway manager & QR connect dialog.
 * Loaded via `window.__ModuleLoader__.load({ id, factory })`.
 * Plain JavaScript (React.createElement) styled in 「简白天蓝」 (Clean White & Sky Blue).
 * Security: Pairing Token + Device Credential, Zero Plaintext Secret.
 */
window.__ModuleLoader__.load({
  id: 'dsh-gateway-ctl',
  factory: (require) => {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const module = { exports: {} };
    const exports = module.exports;

    const inject = ['slots'];

    // Inject global stylesheet for 「简白天蓝」 theme, smooth animations & interactive states
    function ensureStyles() {
      if (typeof document === 'undefined') return;
      if (document.getElementById('dsh-gw-ctl-styles')) return;
      const style = document.createElement('style');
      style.id = 'dsh-gw-ctl-styles';
      style.textContent = `
        @keyframes dshGwScaleIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes dshGwPulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.6); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(2, 132, 199, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(2, 132, 199, 0); }
        }
        @keyframes dshGwSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .dsh-gw-btn {
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
        }
        .dsh-gw-btn:hover:not(:disabled) {
          filter: brightness(0.96);
          transform: translateY(-1px);
        }
        .dsh-gw-btn:active:not(:disabled) {
          transform: translateY(0);
          filter: brightness(0.92);
        }
        .dsh-gw-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .dsh-gw-card {
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }
        .dsh-gw-card:hover {
          border-color: #7dd3fc !important;
          box-shadow: 0 4px 16px -2px rgba(2, 132, 199, 0.08);
        }
        .dsh-gw-input {
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .dsh-gw-input:focus {
          outline: none;
          background: #ffffff !important;
          border-color: #0284c7 !important;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.18) !important;
        }
        .dsh-gw-tab-btn {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .dsh-gw-tab-btn:hover:not(.active) {
          background: rgba(2, 132, 199, 0.08);
          color: #0284c7;
        }
        .dsh-gw-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .dsh-gw-scroll::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.3);
          border-radius: 4px;
        }
        .dsh-gw-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.5);
        }
      `;
      document.head.appendChild(style);
    }

    // ---- SVG Icons ----
    function PhoneIcon(size) {
      return h('svg', { width: size || 18, height: size || 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 5, y: 2, width: 14, height: 20, rx: 3, ry: 3 }),
        h('line', { x1: 12, y1: 18, x2: 12.01, y2: 18, strokeWidth: 2.5 })
      );
    }
    function GlobeIcon(size) {
      return h('svg', { width: size || 16, height: size || 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('circle', { cx: 12, cy: 12, r: 10 }),
        h('line', { x1: 2, y1: 12, x2: 22, y2: 12 }),
        h('path', { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' })
      );
    }
    function WifiIcon(size) {
      return h('svg', { width: size || 16, height: size || 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M5 12.55a11 11 0 0 1 14.08 0' }),
        h('path', { d: 'M1.42 9a16 16 0 0 1 21.16 0' }),
        h('path', { d: 'M8.53 16.11a6 6 0 0 1 6.95 0' }),
        h('line', { x1: 12, y1: 20, x2: 12.01, y2: 20, strokeWidth: 2.5 })
      );
    }
    function ShieldKeyIcon(size) {
      return h('svg', { width: size || 16, height: size || 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }),
        h('circle', { cx: 12, cy: 10, r: 2 }),
        h('path', { d: 'M12 12v3' })
      );
    }
    function CopyIcon(size) {
      return h('svg', { width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
        h('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })
      );
    }
    function CheckIcon(size) {
      return h('svg', { width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('polyline', { points: '20 6 9 17 4 12' })
      );
    }
    function ExternalLinkIcon(size) {
      return h('svg', { width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
        h('polyline', { points: '15 3 21 3 21 9' }),
        h('line', { x1: 10, y1: 14, x2: 21, y2: 3 })
      );
    }
    function TrashIcon(size) {
      return h('svg', { width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('polyline', { points: '3 6 5 6 21 6' }),
        h('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' })
      );
    }
    function PlusIcon(size) {
      return h('svg', { width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' },
        h('line', { x1: 12, y1: 5, x2: 12, y2: 19 }),
        h('line', { x1: 5, y1: 12, x2: 19, y2: 12 })
      );
    }
    function RefreshIcon(size, spin) {
      return h('svg', {
        width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        style: spin ? { animation: 'dshGwSpin 0.9s linear infinite' } : undefined,
      },
        h('polyline', { points: '23 4 23 10 17 10' }),
        h('path', { d: 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10' })
      );
    }
    function PlayIcon(size) {
      return h('svg', { width: size || 13, height: size || 13, viewBox: '0 0 24 24', fill: 'currentColor', stroke: 'none' },
        h('polygon', { points: '5 3 19 12 5 21 5 3' })
      );
    }
    function StopIcon(size) {
      return h('svg', { width: size || 13, height: size || 13, viewBox: '0 0 24 24', fill: 'currentColor', stroke: 'none' },
        h('rect', { x: 5, y: 5, width: 14, height: 14, rx: 2 })
      );
    }
    function CloseIcon(size) {
      return h('svg', { width: size || 16, height: size || 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' },
        h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
        h('line', { x1: 6, y1: 6, x2: 18, y2: 18 })
      );
    }

    function usableLanIps(ips) {
      return (ips || []).filter((ip) => !/^198\.18\./.test(ip) && !/^169\.254\./.test(ip));
    }

    function ipToLongSafe(ip) {
      const parts = String(ip).split('.');
      if (parts.length !== 4) return null;
      let n = 0;
      for (const part of parts) {
        const v = Number(part);
        if (!Number.isInteger(v) || v < 0 || v > 255) return null;
        n = ((n << 8) + v) >>> 0;
      }
      return n;
    }

    function inCidrList(ip, cidrs) {
      const target = ipToLongSafe(ip);
      if (target === null) return false;
      for (const cidr of cidrs || []) {
        const text = String(cidr || '');
        const slash = text.indexOf('/');
        if (slash < 0) continue;
        const net = ipToLongSafe(text.slice(0, slash));
        const bits = Number(text.slice(slash + 1));
        if (net === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
        const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
        if (((target & mask) >>> 0) === ((net & mask) >>> 0)) return true;
      }
      return false;
    }

    // ---- IP 来源分类 (纯展示: 本机 / 组网·代理 / 局域网 / 公网) ----
    // overlayCidrs 来自网关 (虚拟网卡 + CGNAT 段), 用于把 EasyTier/Clash 这类组网来源单独标出来
    function classifyIp(ip, overlayCidrs) {
      const value = String(ip || '');
      if (!value || value === 'unknown' || value === '-') return { label: '未知', title: '网关未能识别来源 IP', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };
      if (/^127\./.test(value) || value === '::1' || value === 'localhost') return { label: '本机', title: '本机回环地址', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
      const overlayLike = inCidrList(value, overlayCidrs)
        || /^(169\.254\.|198\.(18|19)\.)/.test(value)
        || /^(fc|fd|fe80)/i.test(value);
      if (overlayLike) return { label: '组网/代理', title: 'EasyTier / Clash tun / CGNAT 等虚拟网段', color: '#a16207', bg: '#fefce8', border: '#fde68a' };
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value)) return { label: '局域网', title: '局域网私网地址', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
      return { label: '公网', title: '公网地址', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
    }

    // ---- 设备按浏览器指纹分组 (UA 相同视为同一「浏览器指纹」) ----
    function fingerprintOf(dev) {
      const name = String((dev && dev.name) || '未知设备');
      const ua = String((dev && dev.ua) || '');
      return ua ? name + '\u0000' + ua : name;
    }

    function groupDevices(list) {
      const map = new Map();
      for (const dev of list) {
        const key = fingerprintOf(dev);
        if (!map.has(key)) {
          map.set(key, { key, label: dev.name || '未知设备', devices: [], ips: [], lastActiveAt: '' });
        }
        const group = map.get(key);
        group.devices.push(dev);
        for (const ip of [dev.createdIp, dev.lastIp]) {
          if (ip && group.ips.indexOf(ip) < 0) group.ips.push(ip);
        }
        const stamp = dev.lastActiveAt || dev.createdAt || '';
        if (stamp > group.lastActiveAt) group.lastActiveAt = stamp;
      }
      return Array.from(map.values()).sort((a, b) => (a.lastActiveAt < b.lastActiveAt ? 1 : -1));
    }

    function copyToClipboard(text, onSuccess) {
      if (!text) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => onSuccess && onSuccess());
          return;
        }
      } catch (e) {}
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (onSuccess) onSuccess();
      } catch (e) {}
    }

    // ---- 改动型请求: 统一带 x-gw-request, 网关与插件都会校验 (也是一道 CSRF 防线) ----
    function postJson(path, body) {
      const init = {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-gw-request': '1' },
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      return fetch(path, init);
    }

    // ---- Gateway Status Hook ----
    function useGwStatus(open) {
      const [state, setState] = React.useState({ kind: 'loading' });
      const refresh = React.useCallback(() => {
        setState((prev) => ({ ...prev, refreshing: true }));
        return fetch('/api/gw/status', { cache: 'no-store' })
          .then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
          .then((data) => { setState({ kind: 'ready', data, refreshing: false }); return data; })
          .catch((e) => {
            setState({ kind: 'error', error: String((e && e.message) || e), refreshing: false });
            throw e;
          });
      }, []);

      React.useEffect(() => {
        if (!open) return;
        refresh().catch(() => {});
      }, [open, refresh]);

      return [state, refresh];
    }

    // ---- Main Gateway Panel Modal (「简白天蓝」主题) ----
    function GatewayPanel(props) {
      const onClose = props.onClose;
      const [status, refresh] = useGwStatus(true);
      const data = status.kind === 'ready' ? status.data : null;
      // 网关会告诉面板: 当前凭证是口令会话/内部密钥 (可管理) 还是扫码设备 (只读)
      const canManage = !data || data.canManage !== false;
      const ensureCanManage = () => {
        if (canManage) return true;
        setApiError('当前是扫码设备（只读）：修改口令 / 撤销设备 / 轮换密钥请用网关口令登录后再操作。');
        return false;
      };

      const [activeTab, setActiveTab] = React.useState('qr'); // 'qr' | 'remotes' | 'settings'
      const [qrMode, setQrMode] = React.useState('remote'); // 'remote' | 'lan'
      const [selectedLanIp, setSelectedLanIp] = React.useState(null);
      const [busy, setBusy] = React.useState('');

      // Pairing Token state (一次性配对令牌)
      const [pairToken, setPairToken] = React.useState('');
      const [pairExpiresAt, setPairExpiresAt] = React.useState(0);
      const [pairCountdown, setPairCountdown] = React.useState(0);
      const [pairLoading, setPairLoading] = React.useState(false);

      // Copy feedback states
      const [copiedUrl, setCopiedUrl] = React.useState(false);
      const [copiedRawUrl, setCopiedRawUrl] = React.useState(false);
      const [copiedLan, setCopiedLan] = React.useState('');
      const [copiedRemoteId, setCopiedRemoteId] = React.useState('');

      // 设备凭证有效期 / 密钥总览 / 操作错误提示
      const [ttlDays, setTtlDays] = React.useState(365);
      const [keySummary, setKeySummary] = React.useState(null);
      const [apiError, setApiError] = React.useState('');
      const [revokeOnPwChange, setRevokeOnPwChange] = React.useState(false);
      const [groupOpen, setGroupOpen] = React.useState({});

      // Device management & Audit logs states
      const [devices, setDevices] = React.useState([]);
      const [devicesLoading, setDevicesLoading] = React.useState(false);
      const [auditLogs, setAuditLogs] = React.useState([]);
      const [showLogs, setShowLogs] = React.useState(false);

      // Password edit form states (不存明文，纯 scrypt 重设)
      const [editPwOpen, setEditPwOpen] = React.useState(false);
      const [newPw1, setNewPw1] = React.useState('');
      const [newPw2, setNewPw2] = React.useState('');
      const [editPwErr, setEditPwErr] = React.useState('');
      const [pwNotice, setPwNotice] = React.useState('');
      const [pwNoticeType, setPwNoticeType] = React.useState('info');

      // Remote address add form states
      const [addOpen, setAddOpen] = React.useState(false);
      const [addLabel, setAddLabel] = React.useState('');
      const [addUrl, setAddUrl] = React.useState('');
      const [addErr, setAddErr] = React.useState('');

      // QR fallback state
      const [qrFallback, setQrFallback] = React.useState(false);
      const [qrError, setQrError] = React.useState(false);

      // 所有管理调用统一走同源接口 (DSH → 插件 → 内部管理密钥), 不再跨源直连 3081

      // 生成全新一次性配对令牌 (Pairing Token)
      const refreshPairToken = React.useCallback(() => {
        if (!canManage) {
          setApiError('扫码设备只读：扫码配对令牌需要在已通过口令登录的面板里生成。');
          return;
        }
        setPairLoading(true);
        setApiError('');
        postJson('/api/gw/pair/create')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            if (d && d.ok && d.token) {
              setPairToken(d.token);
              setPairExpiresAt(d.expiresAt);
              setPairCountdown(Math.max(0, Math.ceil((d.expiresAt - Date.now()) / 1000)));
            }
          })
          .catch(() => {})
          .catch((e) => setApiError('生成配对令牌失败: ' + String((e && e.message) || e)))
          .finally(() => setPairLoading(false));
      }, [canManage]);

      // 配对 Token 倒计时计时器
      React.useEffect(() => {
        if (!pairExpiresAt) return;
        const timer = setInterval(() => {
          const remain = Math.max(0, Math.ceil((pairExpiresAt - Date.now()) / 1000));
          setPairCountdown(remain);
          if (remain <= 0) {
            clearInterval(timer);
          }
        }, 1000);
        return () => clearInterval(timer);
      }, [pairExpiresAt]);

      // 初始化与开启时获取 Pair Token
      React.useEffect(() => {
        if (data && data.alive) {
          refreshPairToken();
        }
      }, [data && data.alive, refreshPairToken]);

      // 同步设备凭证有效期
      React.useEffect(() => {
        const cfg = data && data.gateway && data.gateway.config;
        if (cfg && typeof cfg.deviceTtlDays === 'number') setTtlDays(cfg.deviceTtlDays);
      }, [data]);

      // 密钥/凭证总览
      const fetchKeySummary = React.useCallback(() => {
        fetch('/api/gw/keys', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => { if (d && d.ok) setKeySummary(d); })
          .catch(() => {});
      }, []);

      // 保存设备凭证有效期
      const handleSaveTtl = () => {
        if (!ensureCanManage()) return;
        setBusy('ttl');
        setApiError('');
        postJson('/api/gw/config', { deviceTtlDays: Number(ttlDays) })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            if (d && d.ok && d.config) {
              setTtlDays(d.config.deviceTtlDays);
              refresh();
              fetchKeySummary();
            }
          })
          .catch((e) => setApiError('保存失败: ' + String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      // 轮换内部管理密钥
      const handleRotateKey = () => {
        if (!ensureCanManage()) return;
        if (typeof window !== 'undefined' && window.confirm && !window.confirm('轮换内部管理密钥？插件会立即使用新密钥，旧密钥立刻失效。')) return;
        setBusy('rotateKey');
        setApiError('');
        postJson('/api/gw/keys/rotate')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then(() => { fetchKeySummary(); refresh(); })
          .catch((e) => setApiError('轮换失败: ' + String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      // 强制全部会话重新登录
      const handleRevokeSessions = () => {
        if (!ensureCanManage()) return;
        if (typeof window !== 'undefined' && window.confirm && !window.confirm('强制所有浏览器重新登录（包括当前这一台）？')) return;
        setBusy('revokeSessions');
        setApiError('');
        postJson('/api/gw/sessions/revoke')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then(() => { fetchKeySummary(); refresh(); })
          .catch((e) => setApiError('操作失败: ' + String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      // 获取已授权设备列表
      const fetchDevices = React.useCallback(() => {
        setDevicesLoading(true);
        fetch('/api/gw/devices', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            if (d && d.ok && Array.isArray(d.devices)) setDevices(d.devices);
          })
          .catch((e) => setApiError('读取设备失败: ' + String((e && e.message) || e)))
          .finally(() => setDevicesLoading(false));
      }, []);

      // 撤销设备授权 (单台 / 一组 / 全部)
      const postRevoke = (payload, busyKey) => {
        if (!canManage) {
          setApiError('扫码设备只读：撤销设备需要在已通过口令登录的面板里操作。');
          return Promise.resolve();
        }
        setBusy(busyKey);
        setApiError('');
        return postJson('/api/gw/devices/revoke', payload)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then(() => { fetchDevices(); fetchKeySummary(); })
          .catch((e) => setApiError('撤销失败: ' + String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      const handleRevokeDevice = (deviceId) => postRevoke({ deviceId }, 'revoke_' + deviceId);

      const handleRevokeGroup = async (ids) => {
        setBusy('revoke_group');
        setApiError('');
        try {
          for (const id of ids) {
            await postJson('/api/gw/devices/revoke', { deviceId: id });
          }
          fetchDevices();
          fetchKeySummary();
        } catch (e) {
          setApiError('撤销失败: ' + String((e && e.message) || e));
        } finally {
          setBusy('');
        }
      };

      const handleRevokeAll = () => {
        if (typeof window !== 'undefined' && window.confirm && !window.confirm('撤销全部已配对设备？所有手机/平板需要重新扫码。')) return;
        postRevoke({ all: true }, 'revoke_all');
      };

      // 获取最近审计日志
      const fetchAuditLogs = () => {
        fetch('/api/gw/logs', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            if (d && d.ok && Array.isArray(d.logs)) setAuditLogs(d.logs);
          })
          .catch((e) => setApiError('读取日志失败: ' + String((e && e.message) || e)));
      };

      React.useEffect(() => {
        ensureStyles();
      }, []);

      // 切换到安全 Tab 时加载设备列表
      React.useEffect(() => {
        if (activeTab === 'settings') {
          fetchDevices();
          fetchKeySummary();
        }
      }, [activeTab, fetchDevices, fetchKeySummary]);

      // Control actions: start | stop | restart
      const handleControl = (action) => {
        setBusy(action);
        postJson('/api/gw/control', { action })
          .then((r) => r.json())
          .then(() => {
            refresh();
            refreshPairToken();
          })
          .catch((e) => {
            setPwNotice('操作失败: ' + String((e && e.message) || e));
            setPwNoticeType('error');
          })
          .finally(() => setBusy(''));
      };

      // 纯加盐 scrypt 重设密码（零明文）
      const handleSaveCustomPassword = () => {
        setEditPwErr('');
        if (newPw1.length < 6) {
          setEditPwErr('口令长度至少需 6 位');
          return;
        }
        if (newPw1 !== newPw2) {
          setEditPwErr('两次输入的口令不一致');
          return;
        }
        if (!ensureCanManage()) return;
        setBusy('savePw');
        postJson('/api/gw/password', { password: newPw1, revokeDevices: revokeOnPwChange })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((d) => {
            if (d && d.ok) {
              setEditPwOpen(false);
              setNewPw1('');
              setNewPw2('');
              setPwNotice(d.devicesRevoked > 0
                ? '口令已更新，并撤销了 ' + d.devicesRevoked + ' 台设备（需重新扫码）'
                : '口令已更新（加盐 scrypt），全部会话已失效');
              setPwNoticeType('success');
              fetchDevices();
              fetchKeySummary();
              refresh();
            } else {
              throw new Error((d && d.error) || '修改失败');
            }
          })
          .catch((e) => setEditPwErr(String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      // Remote address operations (add, remove, activate)
      const handleRemoteOp = (op, extra) => {
        setBusy('remote');
        setAddErr('');
        postJson('/api/gw/remotes', { op, ...(extra || {}) })
          .then((r) => r.json())
          .then((d) => {
            if (!d.ok) throw new Error(d.error || '操作失败');
            if (op === 'add') {
              setAddOpen(false);
              setAddLabel('');
              setAddUrl('');
              if (d.remote && d.remote.id) {
                return postJson('/api/gw/remotes', { op: 'activate', id: d.remote.id }).then(() => {
                  refresh();
                  refreshPairToken();
                });
              }
            }
            refresh();
            refreshPairToken();
          })
          .catch((e) => setAddErr(String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      // Computations for URLs
      const wanUrl = (data && data.loginUrl) || '';
      const lanList = data ? usableLanIps(data.lanIps) : [];
      const currentLanIp = selectedLanIp || (lanList.length > 0 ? lanList[0] : '');
      const lanUrl = currentLanIp ? `http://${currentLanIp}:3081` : '';

      // Base Target URL (原始地址)
      const baseTargetUrl = qrMode === 'remote' ? wanUrl : lanUrl;

      // Scan URL: 一律使用一次性配对令牌 (任何来源都要先过凭证校验, 没有免密直连)
      const scanUrl = (() => {
        if (!baseTargetUrl) return '';
        if (pairToken && pairCountdown > 0) {
          const origin = new URL(baseTargetUrl).origin;
          return `${origin}/__gw/pair?t=${pairToken}`;
        }
        return baseTargetUrl;
      })();

      // QR Image URL: 统一由插件本地生成 (同源 /api/gw/qr), 不再跨源直连 3081
      const qrImageUrl = scanUrl ? `/api/gw/qr?u=${encodeURIComponent(scanUrl)}` : '';

      // Quick Tunnel info
      const quickUrl = (data && data.tunnelUrl) || '';
      const isQuickActive = !data ? false : (!data.activeRemote && Boolean(quickUrl));

      // -------------------------------------------------------------
      // Render: Status Pill & Controls (简白天蓝)
      // -------------------------------------------------------------
      function renderStatusBar() {
        const isAlive = data && data.alive;
        return h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 16,
            gap: 12,
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } },
            h('div', {
              style: {
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: isAlive ? '#0284c7' : '#f59e0b',
                boxShadow: isAlive ? '0 0 10px rgba(2, 132, 199, 0.6)' : 'none',
                animation: isAlive ? 'dshGwPulse 2.5s infinite' : 'none',
                flexShrink: 0,
              },
            }),
            h('div', { style: { minWidth: 0 } },
              h('div', { style: { fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.3 } },
                isAlive ? '网关运行中 (:3081)' : '网关已停止'
              ),
              h('div', { style: { fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                isAlive
                  ? (data.publicSource === 'custom' && data.activeRemote ? `公网: ${data.activeRemote.label} (${data.activeRemote.baseUrl})` : (quickUrl ? `Quick Tunnel 临时外网` : '仅局域网直连'))
                  : '启动网关后即可扫码或远程访问'
              )
            )
          ),
          h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
            isAlive ? [
              h('button', {
                key: 'restart',
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy,
                onClick: () => handleControl('restart'),
                style: {
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#334155',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                },
              }, RefreshIcon(13, busy === 'restart'), busy === 'restart' ? '重启中…' : '重启'),
              h('button', {
                key: 'stop',
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy,
                onClick: () => handleControl('stop'),
                style: {
                  background: '#fef2f2',
                  border: '1px solid #fecdd3',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#e11d48',
                },
              }, StopIcon(12), '停止')
            ] : h('button', {
              type: 'button',
              className: 'dsh-gw-btn',
              disabled: !!busy,
              onClick: () => handleControl('start'),
              style: {
                background: '#0284c7',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
              },
            }, PlayIcon(12), busy === 'start' ? '启动中…' : '一键启动网关')
          )
        );
      }

      // -------------------------------------------------------------
      // Render: Tab 1 扫码连接 (一次性安全配对令牌)
      // -------------------------------------------------------------
      function renderQrTab() {
        if (!data || !data.alive) {
          return h('div', {
            style: {
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: 16,
              padding: '36px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            },
          },
            h('div', {
              style: {
                width: 52,
                height: 52,
                borderRadius: 16,
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284c7',
              },
            }, PhoneIcon(26)),
            h('div', { style: { fontSize: 16, fontWeight: 600, color: '#0f172a' } }, '网关尚未启动'),
            h('div', { style: { fontSize: 13, color: '#64748b', maxWidth: 320, lineHeight: 1.5 } },
              '扫码连接需要网关进程提供反向代理与鉴权服务，请先启动网关。'
            ),
            h('button', {
              type: 'button',
              className: 'dsh-gw-btn',
              disabled: !!busy,
              onClick: () => handleControl('start'),
              style: {
                marginTop: 6,
                background: '#0284c7',
                border: 'none',
                borderRadius: 10,
                padding: '9px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
              },
            }, PlayIcon(13), busy === 'start' ? '正在启动网关…' : '立即启动网关')
          );
        }

        const isTokenActive = pairCountdown > 0;

        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          // 模式切换: 公网远程 vs 局域网直连 (单个矢量图标)
          h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
              background: '#f1f5f9',
              padding: 4,
              borderRadius: 12,
              border: '1px solid #e2e8f0',
            },
          },
            h('button', {
              type: 'button',
              className: 'dsh-gw-btn dsh-gw-tab-btn' + (qrMode === 'remote' ? ' active' : ''),
              onClick: () => { setQrMode('remote'); setQrError(false); },
              style: {
                border: qrMode === 'remote' ? '1px solid #bae6fd' : '1px solid transparent',
                borderRadius: 9,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: qrMode === 'remote' ? 600 : 500,
                background: qrMode === 'remote' ? '#ffffff' : 'transparent',
                color: qrMode === 'remote' ? '#0284c7' : '#64748b',
                boxShadow: qrMode === 'remote' ? '0 2px 6px rgba(2, 132, 199, 0.12)' : 'none',
              },
            }, GlobeIcon(15), '公网远程访问'),
            h('button', {
              type: 'button',
              className: 'dsh-gw-btn dsh-gw-tab-btn' + (qrMode === 'lan' ? ' active' : ''),
              onClick: () => { setQrMode('lan'); setQrError(false); },
              style: {
                border: qrMode === 'lan' ? '1px solid #bae6fd' : '1px solid transparent',
                borderRadius: 9,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: qrMode === 'lan' ? 600 : 500,
                background: qrMode === 'lan' ? '#ffffff' : 'transparent',
                color: qrMode === 'lan' ? '#0284c7' : '#64748b',
                boxShadow: qrMode === 'lan' ? '0 2px 6px rgba(2, 132, 199, 0.12)' : 'none',
              },
            }, WifiIcon(15), '局域网直连 (扫码配对)')
          ),

          // 局域网模式多网卡选择
          qrMode === 'lan' && lanList.length > 1 && h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: '#64748b',
            },
          },
            h('span', null, '选择本机网卡:'),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              lanList.map((ip) => h('button', {
                key: ip,
                type: 'button',
                className: 'dsh-gw-btn',
                onClick: () => { setSelectedLanIp(ip); setQrError(false); },
                style: {
                  border: ip === currentLanIp ? '1px solid #0284c7' : '1px solid #e2e8f0',
                  background: ip === currentLanIp ? '#f0f9ff' : '#ffffff',
                  color: ip === currentLanIp ? '#0284c7' : '#475569',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  fontWeight: ip === currentLanIp ? 600 : 400,
                },
              }, ip))
            )
          ),

          // 未配置公网提示
          qrMode === 'remote' && !wanUrl && h('div', {
            style: {
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 12,
              padding: '16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            },
          },
            h('div', { style: { fontSize: 14, fontWeight: 600, color: '#b45309' } }, '未配置公网外网地址'),
            h('div', { style: { fontSize: 12, color: '#78350f', maxWidth: 360 } },
              '请前往「外网地址」添加 Cloudflare 隧道域名，或启动 Quick Tunnel 临时外网。'
            ),
            h('button', {
              type: 'button',
              className: 'dsh-gw-btn',
              onClick: () => setActiveTab('remotes'),
              style: {
                marginTop: 4,
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                color: '#92400e',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
              },
            }, '前往配置外网地址 →')
          ),

          // 二维码左右双列卡片 (「简白天蓝」一次性安全配对)
          Boolean(baseTargetUrl) && h('div', {
            style: {
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: 14,
              display: 'flex',
              gap: 16,
              alignItems: 'stretch',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
            },
          },
            // 左列：二维码容器
            h('div', {
              style: {
                width: 146,
                flexShrink: 0,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px -2px rgba(2, 132, 199, 0.08)',
                boxSizing: 'border-box',
                position: 'relative',
              },
            },
              qrError || !isTokenActive ? h('div', {
                style: {
                  width: 126,
                  height: 126,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  color: '#64748b',
                  fontSize: 11,
                  textAlign: 'center',
                },
              },
                h('span', { style: { fontSize: 22 } }, '⌛'),
                h('span', { style: { fontWeight: 600 } }, '配对已失效'),
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  onClick: refreshPairToken,
                  style: {
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                  },
                }, '刷新二维码')
              ) : h('img', {
                key: qrImageUrl,
                src: qrImageUrl,
                alt: '扫码远程连接',
                onError: () => {
                  if (!qrFallback) setQrFallback(true);
                  else setQrError(true);
                },
                style: {
                  width: 126,
                  height: 126,
                  display: 'block',
                  borderRadius: 4,
                  imageRendering: 'crisp-edges',
                },
              }),
              h('div', {
                style: {
                  marginTop: 6,
                  fontSize: 11,
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  userSelect: 'none',
                },
              }, isTokenActive ? `一次性配对 (${pairCountdown}s)` : '配对已失效')
            ),

            // 右列：地址信息、主操作与安全配对说明
            h('div', {
              style: {
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 8,
              },
            },
              // 1. 顶部状态说明
              h('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                },
              },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } },
                  h('span', {
                    style: {
                      background: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      color: '#0284c7',
                      borderRadius: 6,
                      padding: '2px 7px',
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    },
                  }, qrMode === 'remote' ? '公网远程' : '局域网直连'),
                  h('span', {
                    style: {
                      fontSize: 12,
                      color: '#64748b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    },
                  }, isTokenActive ? '一次性安全配对中' : '配对令牌已超时')
                ),
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  disabled: pairLoading,
                  onClick: refreshPairToken,
                  title: '刷新生成全新一次性配对令牌',
                  style: {
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0284c7',
                    borderRadius: 14,
                    padding: '3px 9px',
                    fontSize: 11,
                    fontWeight: 600,
                  },
                }, RefreshIcon(12, pairLoading), isTokenActive ? `${pairCountdown}s` : '刷新配对')
              ),

              // 2. 目标地址单行展示框
              h('div', {
                style: {
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '5px 8px',
                  fontFamily: 'monospace',
                  fontSize: 11.5,
                  color: '#0f172a',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                },
              }, scanUrl),

              // 3. 核心复制按钮 (主按钮)
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                onClick: () => copyToClipboard(scanUrl, () => {
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                }),
                style: {
                  width: '100%',
                  background: copiedUrl ? '#ecfdf5' : '#0284c7',
                  border: copiedUrl ? '1px solid #a7f3d0' : 'none',
                  color: copiedUrl ? '#059669' : '#ffffff',
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  boxShadow: copiedUrl ? 'none' : '0 2px 6px rgba(2, 132, 199, 0.28)',
                },
              }, copiedUrl ? [CheckIcon(14), '已复制配对链接'] : [CopyIcon(14), '复制一次性配对链接']),

              // 4. 次级按钮行 (打开浏览器 & 复制原地址)
              h('div', { style: { display: 'flex', gap: 6 } },
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  title: '复制不带配对凭证的原地址（需手动输入口令）',
                  onClick: () => copyToClipboard(baseTargetUrl, () => {
                    setCopiedRawUrl(true);
                    setTimeout(() => setCopiedRawUrl(false), 2000);
                  }),
                  style: {
                    flex: 1,
                    background: copiedRawUrl ? '#ecfdf5' : '#ffffff',
                    border: copiedRawUrl ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
                    color: copiedRawUrl ? '#059669' : '#475569',
                    borderRadius: 7,
                    padding: '5px 8px',
                    fontSize: 11.5,
                  },
                }, copiedRawUrl ? '已复制' : '复制无密原地址'),
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  onClick: () => {
                    try { window.open(scanUrl, '_blank'); } catch (e) {}
                  },
                  style: {
                    flex: 1,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    borderRadius: 7,
                    padding: '5px 8px',
                    fontSize: 11.5,
                  },
                }, ExternalLinkIcon(12), '在浏览器打开')
              ),

              // 5. 底部安全架构说明
              h('div', {
                style: {
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: 8,
                  padding: '6px 9px',
                  fontSize: 11,
                  color: '#0369a1',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                },
              },
                h('span', { style: { flexShrink: 0 } }, ShieldKeyIcon(14)),
                h('span', null, '安全机制：一次性配对消费即焚，主密码不进 URL，自动为手机授权独立撤销凭证。')
              )
            )
          ),

          h('div', {
            style: {
              width: '100%',
              fontSize: 12,
              color: '#64748b',
              textAlign: 'center',
              lineHeight: 1.4,
            },
          }, qrMode === 'remote'
            ? '🔒 公网访问已受保护，手机扫码将授权当前设备进入，可在「安全与设置」中随时撤销。'
            : '🔒 局域网直连同样需要一次性配对令牌：任何来源（本机 / 局域网 / 隧道）都先过凭证校验。'
          )
        );
      }

      // -------------------------------------------------------------
      // Render: Tab 2 外网地址管理 (「简白天蓝」)
      // -------------------------------------------------------------
      function renderRemotesTab() {
        const remotes = (data && data.remotes) || [];
        const activeId = (data && data.activeRemote && data.activeRemote.id) || null;

        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          h('div', { style: { fontSize: 13, color: '#64748b', lineHeight: 1.5 } },
            '管理用于外网访问的域名。扫码与远程链接将优先使用当前选中的地址。'
          ),

          // 地址卡片列表
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            remotes.map((r) => {
              const isActive = r.id === activeId;
              return h('div', {
                key: r.id,
                className: 'dsh-gw-card',
                style: {
                  background: isActive ? '#f0f9ff' : '#ffffff',
                  border: isActive ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  boxShadow: isActive ? '0 4px 14px -2px rgba(2, 132, 199, 0.12)' : '0 1px 3px rgba(0, 0, 0, 0.02)',
                },
              },
                h('div', { style: { minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 } },
                  h('div', {
                    style: {
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: isActive ? '#e0f2fe' : '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isActive ? '#0284c7' : '#64748b',
                      flexShrink: 0,
                    },
                  }, GlobeIcon(18)),
                  h('div', { style: { minWidth: 0 } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                      h('span', { style: { fontSize: 13, fontWeight: 600, color: '#0f172a' } }, r.label || '未命名地址'),
                      isActive && h('span', {
                        style: {
                          background: '#0284c7',
                          color: '#ffffff',
                          borderRadius: 6,
                          padding: '1px 6px',
                          fontSize: 10,
                          fontWeight: 600,
                        },
                      }, '当前使用')
                    ),
                    h('div', {
                      style: {
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: '#64748b',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      },
                    }, r.baseUrl)
                  )
                ),
                h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                  !isActive && h('button', {
                    type: 'button',
                    className: 'dsh-gw-btn',
                    disabled: !!busy,
                    onClick: () => handleRemoteOp('activate', { id: r.id }),
                    style: {
                      background: '#0284c7',
                      border: 'none',
                      borderRadius: 8,
                      padding: '5px 10px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#ffffff',
                      boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
                    },
                  }, '设为使用'),
                  h('button', {
                    type: 'button',
                    className: 'dsh-gw-btn',
                    onClick: () => copyToClipboard(r.baseUrl, () => {
                      setCopiedRemoteId(r.id);
                      setTimeout(() => setCopiedRemoteId(''), 1500);
                    }),
                    style: {
                      background: copiedRemoteId === r.id ? '#ecfdf5' : '#f8fafc',
                      border: copiedRemoteId === r.id ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
                      color: copiedRemoteId === r.id ? '#059669' : '#334155',
                      borderRadius: 8,
                      padding: '5px 8px',
                      fontSize: 12,
                    },
                  }, copiedRemoteId === r.id ? CheckIcon(13) : CopyIcon(13)),
                  h('button', {
                    type: 'button',
                    className: 'dsh-gw-btn',
                    disabled: !!busy,
                    title: '删除此地址',
                    onClick: () => handleRemoteOp('remove', { id: r.id }),
                    style: {
                      background: '#fef2f2',
                      border: '1px solid #fecdd3',
                      color: '#e11d48',
                      borderRadius: 8,
                      padding: '5px 8px',
                      fontSize: 12,
                    },
                  }, TrashIcon(13))
                )
              );
            })
          ),

          // Cloudflare Quick Tunnel 卡片
          h('div', {
            className: 'dsh-gw-card',
            style: {
              background: isQuickActive ? '#fffbeb' : '#ffffff',
              border: isQuickActive ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
              borderRadius: 14,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            },
          },
            h('div', { style: { minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 } },
              h('div', {
                style: {
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#d97706',
                  flexShrink: 0,
                },
              }, h('span', { style: { fontSize: 16 } }, '⚡')),
              h('div', { style: { minWidth: 0 } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  h('span', { style: { fontSize: 13, fontWeight: 600, color: '#0f172a' } }, 'Cloudflare Quick Tunnel (临时)'),
                  isQuickActive && h('span', {
                    style: {
                      background: '#d97706',
                      color: '#ffffff',
                      borderRadius: 6,
                      padding: '1px 6px',
                      fontSize: 10,
                      fontWeight: 600,
                    },
                  }, '当前使用')
                ),
                h('div', {
                  style: {
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  },
                }, quickUrl || '未启动 (无自定义地址时自动拉起)')
              )
            ),
            h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
              quickUrl && !isQuickActive && h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy,
                onClick: () => handleRemoteOp('activate', { id: null }),
                style: {
                  background: '#fef3c7',
                  border: '1px solid #fcd34d',
                  color: '#92400e',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                },
              }, '切至临时隧道')
            )
          ),

          // 新增自定义外网地址表单
          !addOpen ? h('button', {
            type: 'button',
            className: 'dsh-gw-btn',
            disabled: !!busy,
            onClick: () => { setAddOpen(true); setAddErr(''); },
            style: {
              background: '#f0f9ff',
              border: '1px dashed #7dd3fc',
              borderRadius: 12,
              padding: '12px',
              fontSize: 13,
              fontWeight: 600,
              color: '#0284c7',
              width: '100%',
              justifyContent: 'center',
            },
          }, PlusIcon(15), '添加自定义外网域名') : h('div', {
            style: {
              background: '#f8fafc',
              border: '1px solid #bae6fd',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.06)',
            },
          },
            h('div', { style: { fontSize: 13, fontWeight: 600, color: '#0f172a' } }, '添加自定义外网地址'),
            h('input', {
              className: 'dsh-gw-input',
              placeholder: '备注名称（如：家里固定域名）',
              value: addLabel,
              onChange: (e) => setAddLabel(e.target.value),
              style: {
                width: '100%',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 13,
                color: '#0f172a',
                boxSizing: 'border-box',
              },
            }),
            h('input', {
              className: 'dsh-gw-input',
              placeholder: '公网地址（如：https://dsh.example.com）',
              value: addUrl,
              onChange: (e) => setAddUrl(e.target.value),
              style: {
                width: '100%',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 13,
                color: '#0f172a',
                boxSizing: 'border-box',
              },
            }),
            h('div', { style: { fontSize: 11, color: '#64748b', lineHeight: 1.4 } },
              '💡 需预先在 Cloudflare Zero Trust 或其他穿透服务中，将此域名反向代理至本机 3081 端口。'
            ),
            addErr && h('div', { style: { fontSize: 12, color: '#e11d48' } }, addErr),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 } },
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                onClick: () => { setAddOpen(false); setAddErr(''); },
                style: {
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 13,
                  color: '#64748b',
                },
              }, '取消'),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy || !addUrl.trim(),
                onClick: () => handleRemoteOp('add', { label: addLabel.trim(), baseUrl: addUrl.trim() }),
                style: {
                  background: '#0284c7',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
                },
              }, busy === 'remote' ? '保存中…' : '保存并设为当前使用')
            )
          )
        );
      }

      // -------------------------------------------------------------
      // Render: Tab 3 安全设置 (设备管理 & 零明文口令安全)
      // -------------------------------------------------------------
      function renderSettingsTab() {
        const lan = data ? usableLanIps(data.lanIps) : [];
        const overlayCidrs = (data && data.gateway && data.gateway.overlayCidrs) || [];

        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
          apiError && h('div', {
            style: { background: '#fef2f2', border: '1px solid #fecdd3', color: '#b91c1c', borderRadius: 10, padding: '8px 10px', fontSize: 12, lineHeight: 1.4 },
          }, apiError),
          // 设备管理卡片 (Device Management)
          h('div', {
            style: {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { color: '#0284c7', display: 'flex' } }, PhoneIcon(18)),
                h('span', { style: { fontSize: 14, fontWeight: 600, color: '#0f172a' } }, '已授权设备管理')
              ),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                onClick: fetchDevices,
                disabled: devicesLoading,
                style: {
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 7,
                  padding: '3px 8px',
                  fontSize: 11,
                  color: '#475569',
                },
              }, RefreshIcon(11, devicesLoading), '刷新设备')
            ),
            h('div', { style: { fontSize: 12, color: '#64748b', lineHeight: 1.4 } },
              '所有扫码连接的移动设备均持有独立撤销凭证，主密码不暴露给设备。可在此随时撤销指定设备访问权。'
            ),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              (() => {
                const activeDevices = devices.filter((d) => d.status === 'active');
                const deadCount = devices.filter((d) => d.status !== 'active').length;
                if (activeDevices.length === 0) {
                  return h('div', { style: { padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: 12, background: '#f8fafc', borderRadius: 8 } }, '暂无已授权设备，使用手机扫码配对后将在此列出');
                }
                return groupDevices(activeDevices).map((group) => {
                  const open = groupOpen[group.key] === true;
                  return h('div', { key: group.key, style: { border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff', overflow: 'hidden' } },
                    h('div', {
                      onClick: () => setGroupOpen((prev) => ({ ...prev, [group.key]: !open })),
                      style: {
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        padding: '9px 12px', background: open ? '#f0f9ff' : '#f8fafc', cursor: 'pointer',
                      },
                    },
                      h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 } },
                        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                          h('span', { style: { fontSize: 13, fontWeight: 600, color: '#0f172a' } }, group.label),
                          h('span', { style: { background: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1', borderRadius: 4, padding: '0 5px', fontSize: 10, fontWeight: 600 } }, `${group.devices.length} 台`),
                          h('span', { style: { fontSize: 10.5, color: '#94a3b8' } }, open ? '收起' : '展开')
                        ),
                        h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 } },
                          h('span', { style: { fontSize: 10.5, color: '#64748b' } }, 'IP 来源:'),
                          group.ips.length === 0
                            ? h('span', { style: { fontSize: 10.5, color: '#94a3b8' } }, '-')
                            : group.ips.map((ip) => {
                              const meta = classifyIp(ip, overlayCidrs);
                              return h('span', {
                                key: ip,
                                title: meta.title,
                                style: {
                                  background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
                                  borderRadius: 4, padding: '0 5px', fontSize: 10.5, fontFamily: 'monospace',
                                },
                              }, `${ip} · ${meta.label}`);
                            })
                        )
                      ),
                      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 } },
                        h('span', { style: { fontSize: 10.5, color: '#94a3b8' } }, `最近 ${String(group.lastActiveAt || '').slice(5, 16).replace('T', ' ')}`),
                        h('button', {
                          type: 'button',
                          className: 'dsh-gw-btn',
                          disabled: busy === 'revoke_group',
                          onClick: (e) => { if (e && e.stopPropagation) e.stopPropagation(); handleRevokeGroup(group.devices.map((d) => d.id)); },
                          style: {
                            background: '#fef2f2', border: '1px solid #fecdd3', color: '#e11d48',
                            borderRadius: 6, padding: '3px 8px', fontSize: 10.5, fontWeight: 500,
                          },
                        }, busy === 'revoke_group' ? '撤销中…' : '整组撤销')
                      )
                    ),
                    open && h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderTop: '1px solid #e2e8f0' } },
                      group.devices.map((dev) => {
                        const exp = Date.parse(dev.expiresAt);
                        const leftDays = Number.isFinite(exp) ? Math.ceil((exp - Date.now()) / 86400000) : -1;
                        const createdIp = dev.createdIp || '-';
                        const lastIp = dev.lastIp || dev.createdIp || '-';
                        return h('div', {
                          key: dev.id,
                          style: {
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 8, padding: '7px 10px',
                          },
                        },
                          h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 } },
                            h('div', { style: { fontSize: 11.5, color: '#334155' } },
                              `有效期至 ${String(dev.expiresAt || '?').slice(0, 10)}${leftDays >= 0 ? ` · 剩 ${leftDays} 天` : ''}`),
                            h('div', { style: { fontSize: 10.5, color: '#64748b' } },
                              `${createdIp} → ${lastIp} · 活跃 ${String(dev.lastActiveAt || dev.createdAt || '').slice(5, 16).replace('T', ' ')}`)
                          ),
                          h('button', {
                            type: 'button',
                            className: 'dsh-gw-btn',
                            disabled: busy === 'revoke_' + dev.id,
                            onClick: () => handleRevokeDevice(dev.id),
                            style: {
                              background: '#ffffff', border: '1px solid #fecdd3', color: '#e11d48',
                              borderRadius: 6, padding: '3px 8px', fontSize: 10.5,
                            },
                          }, busy === 'revoke_' + dev.id ? '撤销中…' : '撤销')
                        );
                      })
                    )
                  );
                });
              })(),
              devices.filter((d) => d.status !== 'active').length > 0 && h('div', { style: { fontSize: 11, color: '#94a3b8', paddingTop: 2 } },
                `已失效 ${devices.filter((d) => d.status !== 'active').length} 台（已撤销 / 已过期），撤销记录可在审计日志中查看`),
              h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  disabled: busy === 'revoke_all',
                  onClick: handleRevokeAll,
                  style: {
                    background: '#fef2f2', border: '1px solid #fecdd3', color: '#e11d48',
                    borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 600,
                  },
                }, busy === 'revoke_all' ? '撤销中…' : '撤销全部设备')
              )
            )
          ),

          // 局域网直连与安全防护卡片
          h('div', {
            style: {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { color: '#0284c7', display: 'flex' } }, WifiIcon(18)),
                h('span', { style: { fontSize: 14, fontWeight: 600, color: '#0f172a' } }, '访问策略与局域网入口')
              ),
              h('span', {
                style: {
                  background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1',
                  borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                },
              }, '全部来源需登录')
            ),
            h('div', { style: { fontSize: 12, color: '#64748b', lineHeight: 1.5 } },
              '🔒 已取消按来源 IP 的免密：本机回环、局域网、EasyTier、Cloudflare 隧道、公网一律先过口令或一次性配对令牌。'
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
              h('span', { style: { fontSize: 12, color: '#334155' } }, '设备凭证有效期（天）'),
              h('input', {
                className: 'dsh-gw-input',
                type: 'number',
                min: 1,
                max: 3650,
                value: ttlDays,
                onChange: (e) => setTtlDays(e.target.value),
                style: {
                  width: 88, background: '#ffffff', border: '1px solid #cbd5e1',
                  borderRadius: 7, padding: '4px 8px', fontSize: 12, color: '#0f172a',
                },
              }),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: busy === 'ttl',
                onClick: handleSaveTtl,
                style: {
                  background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0284c7',
                  borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 600,
                },
              }, busy === 'ttl' ? '保存中…' : '保存'),
              h('span', { style: { fontSize: 11, color: '#94a3b8' } }, '仅影响新签发的设备凭证')
            ),
            lan.length > 0 ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              lan.map((ip) => {
                const u = `http://${ip}:3081`;
                return h('div', {
                  key: ip,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '6px 10px',
                    gap: 10,
                  },
                },
                  h('span', {
                    style: {
                      fontFamily: 'monospace',
                      fontSize: 13,
                      color: '#0f172a',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    },
                  }, u),
                  h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                    h('button', {
                      type: 'button',
                      className: 'dsh-gw-btn',
                      onClick: () => {
                        try { window.open(u, '_blank'); } catch (e) {}
                      },
                      style: {
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 11,
                        color: '#334155',
                      },
                    }, ExternalLinkIcon(12), '打开'),
                    h('button', {
                      type: 'button',
                      className: 'dsh-gw-btn',
                      onClick: () => copyToClipboard(u, () => {
                        setCopiedLan(u);
                        setTimeout(() => setCopiedLan(''), 1500);
                      }),
                      style: {
                        background: copiedLan === u ? '#ecfdf5' : '#f0f9ff',
                        border: copiedLan === u ? '1px solid #a7f3d0' : '1px solid #bae6fd',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 11,
                        color: copiedLan === u ? '#059669' : '#0284c7',
                        fontWeight: 500,
                      },
                    }, copiedLan === u ? CheckIcon(12) : CopyIcon(12))
                  )
                );
              })
            ) : h('div', { style: { fontSize: 12, color: '#94a3b8' } }, '未检测到可用局域网 IPv4 地址')
          ),

          // 凭证与密钥 (持久化) 卡片
          h('div', {
            style: {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { color: '#0284c7', display: 'flex' } }, ShieldKeyIcon(18)),
                h('span', { style: { fontSize: 14, fontWeight: 600, color: '#0f172a' } }, '凭证与密钥（持久化）')
              ),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                onClick: fetchKeySummary,
                style: {
                  background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 7,
                  padding: '3px 8px', fontSize: 11, color: '#475569',
                },
              }, RefreshIcon(11), '刷新')
            ),
            h('div', { style: { fontSize: 12, color: '#64748b', lineHeight: 1.5 } },
              '内部管理密钥、浏览器会话、设备凭证、口令哈希全部落盘（0600），网关重启不必重新登录；这里只显示状态，不显示任何密钥值。'
            ),
            keySummary
              ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 } },
                h('div', { style: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, color: '#334155' } },
                  `内部密钥: ${keySummary.admin && keySummary.admin.exists ? `已就绪 · ${keySummary.admin.ageDays} 天` : '缺失'}`),
                h('div', { style: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, color: '#334155' } },
                  `登录会话: ${keySummary.sessions ? keySummary.sessions.count : 0} 个 · ${keySummary.sessions ? keySummary.sessions.ttlHours : 24}h`),
                h('div', { style: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, color: '#334155' } },
                  `设备: 活跃 ${keySummary.devices ? keySummary.devices.active : 0} · 过期 ${keySummary.devices ? keySummary.devices.expired : 0} · 已撤销 ${keySummary.devices ? keySummary.devices.revoked : 0}`),
                h('div', { style: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, color: '#334155' } },
                  `口令更新: ${keySummary.password && keySummary.password.updatedAt ? String(keySummary.password.updatedAt).slice(0, 16).replace('T', ' ') : '未知'}`)
              )
              : h('div', { style: { fontSize: 11.5, color: '#94a3b8' } }, '点击「刷新」读取密钥状态'),
            h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy,
                onClick: handleRotateKey,
                style: {
                  background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0284c7',
                  borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 600,
                },
              }, busy === 'rotateKey' ? '轮换中…' : '轮换内部密钥'),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy,
                onClick: handleRevokeSessions,
                style: {
                  background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569',
                  borderRadius: 7, padding: '4px 10px', fontSize: 11.5,
                },
              }, busy === 'revokeSessions' ? '处理中…' : '强制所有会话重新登录')
            )
          ),

          // 主密码加固与零明文重设卡片
          h('div', {
            style: {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { color: '#0284c7', display: 'flex' } }, ShieldKeyIcon(18)),
                h('span', { style: { fontSize: 14, fontWeight: 600, color: '#0f172a' } }, '主口令加固与修改')
              ),
              h('span', {
                style: {
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#059669',
                  borderRadius: 6,
                  padding: '2px 7px',
                  fontSize: 11,
                  fontWeight: 600,
                },
              }, '加盐 scrypt · 零明文存储')
            ),
            h('div', { style: { fontSize: 12, color: '#64748b', lineHeight: 1.5 } },
              '磁盘只保存不可逆加盐 scrypt 哈希（.gw_password，0600）。改口令会立即让全部会话失效；若遗忘口令，可在终端运行 gw.sh password 交互重设（无需重启网关）。'
            ),
            pwNotice && h('div', {
              style: {
                fontSize: 12,
                color: pwNoticeType === 'success' ? '#059669' : '#e11d48',
              },
            }, pwNotice),
            !editPwOpen ? h('button', {
              type: 'button',
              className: 'dsh-gw-btn',
              disabled: !!busy,
              onClick: () => { setEditPwOpen(true); setEditPwErr(''); setPwNotice(''); },
              style: {
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: '#0284c7',
                alignSelf: 'flex-start',
              },
            }, '重设主口令') : h('div', {
              style: {
                background: '#f8fafc',
                borderRadius: 10,
                padding: 12,
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              },
            },
              h('input', {
                className: 'dsh-gw-input',
                type: 'password',
                placeholder: '输入新口令（至少 6 位）',
                value: newPw1,
                onChange: (e) => setNewPw1(e.target.value),
                style: {
                  width: '100%',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 13,
                  color: '#0f172a',
                  boxSizing: 'border-box',
                },
              }),
              h('input', {
                className: 'dsh-gw-input',
                type: 'password',
                placeholder: '再次输入新口令以确认',
                value: newPw2,
                onChange: (e) => setNewPw2(e.target.value),
                style: {
                  width: '100%',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 13,
                  color: '#0f172a',
                  boxSizing: 'border-box',
                },
              }),
              editPwErr && h('div', { style: { fontSize: 12, color: '#e11d48' } }, editPwErr),
              h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' } },
                h('input', {
                  type: 'checkbox',
                  checked: revokeOnPwChange,
                  onChange: (e) => setRevokeOnPwChange(Boolean(e.target.checked)),
                }),
                '可选：同时撤销全部已配对设备（撤销后需重新扫码配对）'
              ),
              h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 } },
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  onClick: () => setEditPwOpen(false),
                  style: {
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 7,
                    padding: '5px 12px',
                    fontSize: 12,
                    color: '#64748b',
                  },
                }, '取消'),
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  disabled: !!busy || !newPw1,
                  onClick: handleSaveCustomPassword,
                  style: {
                    background: '#0284c7',
                    border: 'none',
                    borderRadius: 7,
                    padding: '5px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#ffffff',
                  },
                }, busy === 'savePw' ? '保存中…' : '更新口令哈希')
              )
            )
          ),

          // DSH 3080 端口暴露主动检测与安全防线
          h('div', {
            style: {
              background: '#ffffff',
              border: (data && data.gateway && data.gateway.port3080Exposed) ? '1.5px solid #fecdd3' : '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { color: (data && data.gateway && data.gateway.port3080Exposed) ? '#e11d48' : '#0284c7', display: 'flex' } }, ShieldKeyIcon(18)),
                h('span', { style: { fontSize: 14, fontWeight: 600, color: '#0f172a' } }, 'DSH 3080 端口受限状态')
              ),
              (data && data.gateway && data.gateway.port3080Exposed)
                ? h('span', {
                  style: {
                    background: '#fef2f2',
                    border: '1px solid #fecdd3',
                    color: '#e11d48',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                  },
                }, '⚠️ 存在暴露风险')
                : h('span', {
                  style: {
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#059669',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                  },
                }, '✓ 仅限 127.0.0.1 (安全)')
            ),
            h('div', { style: { fontSize: 12, color: '#64748b', lineHeight: 1.5 } },
              (data && data.gateway && data.gateway.port3080Exposed)
                ? '⚠️ 严重安全警告：检测到 DSH 3080 端口已被局域网或外部网络直接侦听！请确保仅将 3081 网关对外开放，严禁直接映射 DSH 3080 端口！'
                : '✓ 安全合规：DSH 3080 端口未向外部暴露，所有外部/局域网连接均严格受控于 3081 独立网关反代鉴权保护。'
            )
          ),

          // 安全访问审计日志展开卡片
          h('div', {
            style: {
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { color: '#0284c7', display: 'flex' } }, GlobeIcon(18)),
                h('span', { style: { fontSize: 14, fontWeight: 600, color: '#0f172a' } }, '安全访问与审计日志')
              ),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                onClick: () => {
                  if (!showLogs) fetchAuditLogs();
                  setShowLogs(!showLogs);
                },
                style: {
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 7,
                  padding: '4px 10px',
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: '#475569',
                },
              }, showLogs ? '收起日志' : '查看最近日志')
            ),
            showLogs && h('div', {
              style: {
                maxHeight: 180,
                overflowY: 'auto',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '8px',
                fontSize: 11.5,
                fontFamily: 'monospace',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              },
            },
              auditLogs.length === 0
                ? h('div', { style: { color: '#94a3b8', padding: 4 } }, '暂无审计日志')
                : auditLogs.slice(0, 20).map((l, idx) => {
                  const isFail = l.status && (l.status.includes('FAIL') || l.status.includes('RATE_LIMIT') || l.status.includes('DENIED') || l.status.includes('INVALID'));
                  return h('div', {
                    key: idx,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: isFail ? '#e11d48' : '#334155',
                      padding: '2px 4px',
                      borderRadius: 4,
                      background: isFail ? 'rgba(239, 68, 68, 0.06)' : 'transparent',
                    },
                  },
                    h('span', { style: { color: '#94a3b8', flexShrink: 0 } }, (l.time || '').slice(11, 19)),
                    h('span', { style: { fontWeight: 600, flexShrink: 0 } }, l.ip || '-'),
                    h('span', {
                      style: {
                        background: isFail ? '#fef2f2' : '#f0f9ff',
                        color: isFail ? '#e11d48' : '#0284c7',
                        padding: '1px 4px',
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        flexShrink: 0,
                      },
                    }, l.status || '-'),
                    h('span', { style: { color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, l.note ? `(${l.note})` : (l.path || ''))
                  );
                })
            )
          )
        );
      }

      // -------------------------------------------------------------
      // 主弹窗 Return (「简白天蓝」现代科技纯白弹窗)
      // -------------------------------------------------------------
      return h('div', {
        style: {
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          boxSizing: 'border-box',
        },
      },
        // 清透浅灰色背景遮罩
        h('div', {
          onClick: onClose,
          style: {
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          },
        }),

        // 简白天蓝主卡片
        h('div', {
          role: 'dialog',
          'aria-label': '远程访问与网关',
          className: 'dsh-gw-scroll',
          style: {
            position: 'relative',
            width: 500,
            maxWidth: '100%',
            maxHeight: 'calc(100vh - 40px)',
            overflowY: 'auto',
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            borderRadius: 20,
            padding: '24px 24px 20px',
            fontSize: 14,
            boxShadow: '0 25px 60px -15px rgba(2, 132, 199, 0.18), 0 4px 12px rgba(0, 0, 0, 0.05)',
            boxSizing: 'border-box',
            animation: 'dshGwScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          },
        },
          // 标题栏
          h('div', {
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: 16,
              gap: 12,
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
              h('div', {
                style: {
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0284c7',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.15)',
                },
              }, PhoneIcon(22)),
              h('div', null,
                h('h2', {
                  style: {
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#0f172a',
                    letterSpacing: '-0.01em',
                  },
                }, '远程访问与网关'),
                h('p', {
                  style: {
                    margin: '3px 0 0',
                    fontSize: 12,
                    color: '#64748b',
                  },
                }, '一次性令牌扫码授权 · 独立设备凭证撤销')
              )
            ),
            h('button', {
              type: 'button',
              className: 'dsh-gw-btn',
              onClick: onClose,
              title: '关闭',
              'aria-label': '关闭',
              style: {
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                background: '#f1f5f9',
                color: '#64748b',
                padding: 0,
              },
            }, CloseIcon(16))
          ),

          // 扫码设备只读提示 (权限由网关强制, 这里把原因与出口讲清楚)
          !canManage && h('div', {
            style: {
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              borderRadius: 10,
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.5,
              marginBottom: 10,
            },
          },
            h('div', { style: { fontWeight: 600, marginBottom: 2 } }, '此设备是扫码配对设备（只读）'),
            h('div', null, '浏览不受影响；修改口令、撤销设备、轮换密钥、改配置需要网关口令。'),
            h('a', {
              href: '/__gw/login',
              target: '_blank',
              rel: 'noreferrer',
              style: { color: '#0284c7', fontWeight: 600 },
            }, '用口令登录 →')
          ),

          // 状态栏
          renderStatusBar(),

          // 天蓝胶囊分段导航器 (严格单一矢量图标)
          h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              background: '#f1f5f9',
              borderRadius: 12,
              padding: 3,
              marginBottom: 16,
              gap: 4,
              border: '1px solid #e2e8f0',
            },
          },
            [
              { key: 'qr', label: '扫码连接', icon: PhoneIcon(14) },
              { key: 'remotes', label: '外网地址', icon: GlobeIcon(14) },
              { key: 'settings', label: '安全与设置', icon: ShieldKeyIcon(14) },
            ].map((t) => {
              const active = activeTab === t.key;
              return h('button', {
                key: t.key,
                type: 'button',
                className: 'dsh-gw-btn dsh-gw-tab-btn' + (active ? ' active' : ''),
                onClick: () => setActiveTab(t.key),
                style: {
                  border: 'none',
                  borderRadius: 9,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  background: active ? '#0284c7' : 'transparent',
                  color: active ? '#ffffff' : '#64748b',
                  boxShadow: active ? '0 2px 8px rgba(2, 132, 199, 0.35)' : 'none',
                },
              }, t.icon, t.label);
            })
          ),

          // Tab 内容
          status.kind === 'error' && h('div', {
            style: {
              background: '#fef2f2',
              border: '1px solid #fecdd3',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 12,
              color: '#e11d48',
              marginBottom: 12,
            },
          }, '获取网关状态异常：', status.error),

          activeTab === 'qr' && renderQrTab(),
          activeTab === 'remotes' && renderRemotesTab(),
          activeTab === 'settings' && renderSettingsTab()
        )
      );
    }

    // ---- Sidebar Footer Action Entry Component ----
    function GatewayEntry(props) {
      const [open, setOpen] = React.useState(false);
      const [alive, setAlive] = React.useState(false);

      React.useEffect(() => {
        ensureStyles();
        let mounted = true;
        fetch('/api/gw/status', { cache: 'no-store' })
          .then((r) => r.ok ? r.json() : null)
          .then((d) => {
            if (mounted && d) setAlive(Boolean(d.alive));
          })
          .catch(() => {});
        return () => { mounted = false; };
      }, [open]);

      return h(
        React.Fragment, null,
        h('button', {
          type: 'button',
          title: alive ? '远程网关（运行中）' : '远程网关（未运行）',
          'aria-label': '远程网关',
          onClick: () => setOpen(true),
          className: 'dsh-gw-btn',
          style: {
            position: 'relative',
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: open ? '#f0f9ff' : 'transparent',
            color: open ? '#0284c7' : 'var(--dsw-alias-label-secondary, #8b949e)',
            cursor: 'pointer',
            padding: 0,
          },
        },
          PhoneIcon(props.wide ? 16 : 18),
          alive && h('span', {
            style: {
              position: 'absolute',
              top: 6,
              right: 6,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#0284c7',
              boxShadow: '0 0 6px rgba(2, 132, 199, 0.8)',
            },
          })
        ),
        open && ReactDOM.createPortal(
          h(GatewayPanel, { onClose: () => setOpen(false) }),
          document.body
        )
      );
    }

    // Cordis plugin lifecycle apply
    function apply(ctx) {
      ctx.slots.inject('sidebar.footer.action', () => {
        let dispose;
        try {
          dispose = ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'gateway-ctl' },
            GatewayEntry
          );
        } catch (e) {
          return () => {};
        }
        return () => { if (dispose) dispose(); };
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
