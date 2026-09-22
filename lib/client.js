/* dsh-gateway-ctl browser half: modern remote gateway manager & QR connect dialog.
 * Loaded via `window.__ModuleLoader__.load({ id, factory })`.
 * Plain JavaScript (React.createElement) with DSH design system tokens & elegant UX.
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

    // Inject global stylesheet for smooth animations & interactive states
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
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
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
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .dsh-gw-btn:active:not(:disabled) {
          transform: translateY(0);
          filter: brightness(0.95);
        }
        .dsh-gw-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .dsh-gw-card {
          transition: border-color 0.2s, background 0.2s;
        }
        .dsh-gw-card:hover {
          border-color: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.18));
        }
        .dsh-gw-input {
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .dsh-gw-input:focus {
          outline: none;
          border-color: var(--dsw-alias-brand-primary, #3b82f6) !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25) !important;
        }
        .dsh-gw-tab-btn {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .dsh-gw-tab-btn:hover:not(.active) {
          background: rgba(255, 255, 255, 0.05);
          color: var(--dsw-alias-label-primary, #ffffff);
        }
        .dsh-gw-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .dsh-gw-scroll::-webkit-scrollbar-thumb {
          background: rgba(127, 127, 127, 0.25);
          border-radius: 4px;
        }
        .dsh-gw-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(127, 127, 127, 0.4);
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
    function EyeIcon(size) {
      return h('svg', { width: size || 15, height: size || 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }),
        h('circle', { cx: 12, cy: 12, r: 3 })
      );
    }
    function EyeOffIcon(size) {
      return h('svg', { width: size || 15, height: size || 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }),
        h('line', { x1: 1, y1: 1, x2: 23, y2: 23 })
      );
    }
    function DiceIcon(size) {
      return h('svg', { width: size || 14, height: size || 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3, ry: 3 }),
        h('circle', { cx: 8.5, cy: 8.5, r: 1.5, fill: 'currentColor' }),
        h('circle', { cx: 15.5, cy: 8.5, r: 1.5, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 12, r: 1.5, fill: 'currentColor' }),
        h('circle', { cx: 8.5, cy: 15.5, r: 1.5, fill: 'currentColor' }),
        h('circle', { cx: 15.5, cy: 15.5, r: 1.5, fill: 'currentColor' })
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

    // ---- Main Gateway Panel Modal ----
    function GatewayPanel(props) {
      const onClose = props.onClose;
      const [status, refresh] = useGwStatus(true);
      const [activeTab, setActiveTab] = React.useState('qr'); // 'qr' | 'remotes' | 'settings'
      const [qrMode, setQrMode] = React.useState('remote'); // 'remote' | 'lan'
      const [selectedLanIp, setSelectedLanIp] = React.useState(null);
      const [busy, setBusy] = React.useState('');

      // Copy states
      const [copiedUrl, setCopiedUrl] = React.useState(false);
      const [copiedPw, setCopiedPw] = React.useState(false);
      const [copiedLan, setCopiedLan] = React.useState('');
      const [copiedRemoteId, setCopiedRemoteId] = React.useState('');

      // Password states
      const [curPw, setCurPw] = React.useState('');
      const [curPwVisible, setCurPwVisible] = React.useState(false);
      const [pwLoading, setPwLoading] = React.useState(false);
      const [pwNotice, setPwNotice] = React.useState('');
      const [pwNoticeType, setPwNoticeType] = React.useState('info'); // 'info' | 'success' | 'error'

      // Password edit form states
      const [editPwOpen, setEditPwOpen] = React.useState(false);
      const [newPw1, setNewPw1] = React.useState('');
      const [newPw2, setNewPw2] = React.useState('');
      const [newPwVisible, setNewPwVisible] = React.useState(false);
      const [editPwErr, setEditPwErr] = React.useState('');

      // Remote address add form states
      const [addOpen, setAddOpen] = React.useState(false);
      const [addLabel, setAddLabel] = React.useState('');
      const [addUrl, setAddUrl] = React.useState('');
      const [addErr, setAddErr] = React.useState('');

      // QR error state
      const [qrError, setQrError] = React.useState(false);
      const [qrFallback, setQrFallback] = React.useState(false);

      const data = status.kind === 'ready' ? status.data : null;

      // Determine gateway fallback address if needed
      const gwBaseFor = React.useCallback(() => {
        try {
          const host = (typeof window !== 'undefined' && window.location && window.location.host) || '';
          if (/:3081$/.test(host)) return '';
          const ip = host.split(':')[0];
          if (ip === '127.0.0.1' || ip === 'localhost' || ip === '[::1]') return 'http://127.0.0.1:3081';
          const match = data && data.lanQr && data.lanQr.find((e) => e.ip === ip);
          if (match) return match.qr.replace(/\/__gw\/qr$/, '');
        } catch (e) {}
        return 'http://127.0.0.1:3081';
      }, [data]);

      // Preload current password silently on mount or when alive
      const fetchPassword = React.useCallback((revealImmediately = false) => {
        setPwLoading(true);
        setPwNotice('');
        const base = gwBaseFor();
        // Try gateway process first (which is running and tested working 100%)
        fetch(base + '/__gw/reveal', { method: 'POST' })
          .then((r) => r.ok ? r.json() : Promise.reject())
          .then((d) => {
            if (d && d.ok && d.password) {
              setCurPw(d.password);
              if (revealImmediately) setCurPwVisible(true);
              return;
            }
            throw new Error('reveal failed');
          })
          .catch(() => {
            // Fallback: try DSH host endpoint /api/gw/password
            return fetch('/api/gw/password', { cache: 'no-store' })
              .then((r) => r.ok ? r.json() : Promise.reject())
              .then((d) => {
                if (d && d.ok && d.password) {
                  setCurPw(d.password);
                  if (revealImmediately) setCurPwVisible(true);
                }
              })
              .catch(() => {});
          })
          .finally(() => setPwLoading(false));
      }, [gwBaseFor]);

      React.useEffect(() => {
        ensureStyles();
      }, []);

      React.useEffect(() => {
        if (data && data.alive) {
          fetchPassword(false);
        }
      }, [data && data.alive, fetchPassword]);

      // Control actions: start | stop | restart
      const handleControl = (action) => {
        setBusy(action);
        fetch('/api/gw/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        })
          .then((r) => r.json())
          .then(() => refresh())
          .catch((e) => {
            setPwNotice('操作失败: ' + String((e && e.message) || e));
            setPwNoticeType('error');
          })
          .finally(() => setBusy(''));
      };

      // Password rotation action (1-click random generate)
      const handleRotatePassword = () => {
        setBusy('rotate');
        setPwNotice('');
        fetch('/api/gw/password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'rotate' }),
        })
          .then((r) => r.ok ? r.json() : Promise.reject())
          .then((d) => {
            if (d && d.ok && d.password) {
              setCurPw(d.password);
              setCurPwVisible(true);
              setPwNotice('已生成新口令，旧会话已全部注销');
              setPwNoticeType('success');
              return;
            }
            throw new Error('rotate failed');
          })
          .catch(() => {
            // Fallback to gateway process
            const base = gwBaseFor();
            return fetch(base + '/__gw/rotate', { method: 'POST' })
              .then((r) => r.json())
              .then((d) => {
                if (d && d.ok && d.password) {
                  setCurPw(d.password);
                  setCurPwVisible(true);
                  setPwNotice('已生成新口令，旧会话已全部注销');
                  setPwNoticeType('success');
                } else {
                  throw new Error((d && d.error) || '生成失败');
                }
              });
          })
          .catch((e) => {
            setPwNotice('更换失败: ' + String((e && e.message) || e));
            setPwNoticeType('error');
          })
          .finally(() => setBusy(''));
      };

      // Custom password change
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
        setBusy('savePw');
        fetch('/api/gw/password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'set', password: newPw1 }),
        })
          .then((r) => r.ok ? r.json() : Promise.reject())
          .then((d) => {
            if (d && d.ok) {
              setCurPw(newPw1);
              setCurPwVisible(true);
              setEditPwOpen(false);
              setNewPw1('');
              setNewPw2('');
              setPwNotice('口令修改成功，旧会话已注销');
              setPwNoticeType('success');
              return;
            }
            throw new Error('save failed');
          })
          .catch(() => {
            // Fallback
            const base = gwBaseFor();
            return fetch(base + '/__gw/password', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ password: newPw1 }),
            })
              .then((r) => r.json())
              .then((d) => {
                if (d && d.ok) {
                  setCurPw(newPw1);
                  setCurPwVisible(true);
                  setEditPwOpen(false);
                  setNewPw1('');
                  setNewPw2('');
                  setPwNotice('口令修改成功');
                  setPwNoticeType('success');
                } else {
                  throw new Error((d && d.error) || '修改失败');
                }
              });
          })
          .catch((e) => setEditPwErr(String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      // Remote address operations (add, remove, activate)
      const handleRemoteOp = (op, extra) => {
        setBusy('remote');
        setAddErr('');
        fetch('/api/gw/remotes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, ...(extra || {}) }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (!d.ok) throw new Error(d.error || '操作失败');
            if (op === 'add') {
              setAddOpen(false);
              setAddLabel('');
              setAddUrl('');
              // If new remote added, activate it immediately
              if (d.remote && d.remote.id) {
                return fetch('/api/gw/remotes', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ op: 'activate', id: d.remote.id }),
                }).then(() => refresh());
              }
            }
            return refresh();
          })
          .catch((e) => setAddErr(String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      // Computations for URLs
      const wanUrl = (data && data.loginUrl) || '';
      const lanList = data ? usableLanIps(data.lanIps) : [];
      const currentLanIp = selectedLanIp || (lanList.length > 0 ? lanList[0] : '');
      const lanUrl = currentLanIp ? `http://${currentLanIp}:3081` : '';

      // Determine active target URL for QR tab
      const targetUrl = qrMode === 'remote' ? wanUrl : lanUrl;

      // QR Image URL
      const qrImageUrl = (() => {
        if (!targetUrl) return '';
        if (qrFallback) {
          return `/api/gw/qr?u=${encodeURIComponent(targetUrl)}`;
        }
        const pageHost = (typeof window !== 'undefined' && window.location && window.location.host) || '';
        const pageProto = (typeof window !== 'undefined' && window.location && window.location.protocol) || 'http:';
        if (/:3081$/.test(pageHost)) {
          return `/__gw/qr?u=${encodeURIComponent(targetUrl)}`;
        }
        if (pageProto === 'https:' && wanUrl) {
          try {
            return `${new URL(wanUrl).origin}/__gw/qr?u=${encodeURIComponent(targetUrl)}`;
          } catch (e) {}
        }
        const baseIp = (pageHost.split(':')[0]) || '127.0.0.1';
        const targetHost = (baseIp === 'localhost' || baseIp === '127.0.0.1') ? '127.0.0.1' : (currentLanIp || '127.0.0.1');
        return `http://${targetHost}:3081/__gw/qr?u=${encodeURIComponent(targetUrl)}`;
      })();

      // Quick Tunnel info
      const quickUrl = (data && data.tunnelUrl) || '';
      const isQuickActive = !data ? false : (!data.activeRemote && Boolean(quickUrl));

      // -------------------------------------------------------------
      // Render Helpers
      // -------------------------------------------------------------

      // 1. Status Pill & Actions in Header
      function renderStatusBar() {
        const isAlive = data && data.alive;
        return h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.05))',
            border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08))',
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
                background: isAlive ? '#10b981' : '#f59e0b',
                boxShadow: isAlive ? '0 0 10px rgba(16, 185, 129, 0.6)' : 'none',
                animation: isAlive ? 'dshGwPulse 2.5s infinite' : 'none',
                flexShrink: 0,
              },
            }),
            h('div', { style: { minWidth: 0 } },
              h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #ffffff)', lineHeight: 1.3 } },
                isAlive ? '网关运行中 (:3081)' : '网关已停止'
              ),
              h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #9aa2ae)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
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
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  color: 'var(--dsw-alias-label-primary, #ffffff)',
                },
              }, RefreshIcon(13, busy === 'restart'), busy === 'restart' ? '重启中…' : '重启'),
              h('button', {
                key: 'stop',
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy,
                onClick: () => handleControl('stop'),
                style: {
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  color: '#f87171',
                },
              }, StopIcon(12), '停止')
            ] : h('button', {
              type: 'button',
              className: 'dsh-gw-btn',
              disabled: !!busy,
              onClick: () => handleControl('start'),
              style: {
                background: 'var(--dsw-alias-brand-primary, #3b82f6)',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(59, 130, 246, 0.35)',
              },
            }, PlayIcon(12), busy === 'start' ? '启动中…' : '一键启动网关')
          )
        );
      }

      // 2. Tab: 扫码连接 (Scan & Connect)
      function renderQrTab() {
        if (!data || !data.alive) {
          return h('div', {
            style: {
              background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03))',
              border: '1px dashed var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14))',
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
                background: 'rgba(245, 158, 11, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b',
              },
            }, PhoneIcon(26)),
            h('div', { style: { fontSize: 16, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #fff)' } }, '网关尚未启动'),
            h('div', { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary, #9aa2ae)', maxWidth: 320, lineHeight: 1.5 } },
              '扫码连接需要网关进程提供反向代理与鉴权服务，请先启动网关。'
            ),
            h('button', {
              type: 'button',
              className: 'dsh-gw-btn',
              disabled: !!busy,
              onClick: () => handleControl('start'),
              style: {
                marginTop: 6,
                background: 'var(--dsw-alias-brand-primary, #3b82f6)',
                border: 'none',
                borderRadius: 10,
                padding: '9px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)',
              },
            }, PlayIcon(13), busy === 'start' ? '正在启动网关…' : '立即启动网关')
          );
        }

        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          // Mode Switcher (公网远程 vs 局域网直连)
          h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))',
              padding: 4,
              borderRadius: 12,
            },
          },
            h('button', {
              type: 'button',
              className: 'dsh-gw-btn dsh-gw-tab-btn' + (qrMode === 'remote' ? ' active' : ''),
              onClick: () => { setQrMode('remote'); setQrError(false); },
              style: {
                border: 'none',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: qrMode === 'remote' ? 600 : 500,
                background: qrMode === 'remote' ? 'var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.12))' : 'transparent',
                color: qrMode === 'remote' ? 'var(--dsw-alias-label-primary, #ffffff)' : 'var(--dsw-alias-label-secondary, #9aa2ae)',
                boxShadow: qrMode === 'remote' ? '0 2px 8px rgba(0, 0, 0, 0.25)' : 'none',
              },
            }, GlobeIcon(15), '🌐 公网远程访问'),
            h('button', {
              type: 'button',
              className: 'dsh-gw-btn dsh-gw-tab-btn' + (qrMode === 'lan' ? ' active' : ''),
              onClick: () => { setQrMode('lan'); setQrError(false); },
              style: {
                border: 'none',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: qrMode === 'lan' ? 600 : 500,
                background: qrMode === 'lan' ? 'var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.12))' : 'transparent',
                color: qrMode === 'lan' ? 'var(--dsw-alias-label-primary, #ffffff)' : 'var(--dsw-alias-label-secondary, #9aa2ae)',
                boxShadow: qrMode === 'lan' ? '0 2px 8px rgba(0, 0, 0, 0.25)' : 'none',
              },
            }, WifiIcon(15), '📶 局域网直连 (免密)')
          ),

          // If in LAN mode and multiple IPs exist, show compact IP selector
          qrMode === 'lan' && lanList.length > 1 && h('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
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
                  border: ip === currentLanIp ? '1px solid var(--dsw-alias-brand-primary, #3b82f6)' : '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1))',
                  background: ip === currentLanIp ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  color: ip === currentLanIp ? 'var(--dsw-alias-brand-primary, #60a5fa)' : 'inherit',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 12,
                  fontFamily: 'monospace',
                },
              }, ip))
            )
          ),

          // Missing remote alert when in remote mode
          qrMode === 'remote' && !wanUrl && h('div', {
            style: {
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: 12,
              padding: '16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            },
          },
            h('div', { style: { fontSize: 14, fontWeight: 600, color: '#f59e0b' } }, '未配置公网外网地址'),
            h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #9aa2ae)', maxWidth: 360 } },
              '请前往「地址管理」添加 Cloudflare 隧道域名，或启动 Quick Tunnel 临时外网。'
            ),
            h('button', {
              type: 'button',
              className: 'dsh-gw-btn',
              onClick: () => setActiveTab('remotes'),
              style: {
                marginTop: 4,
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#fbbf24',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
              },
            }, '前往配置外网地址 →')
          ),

          // QR Display Card (Shown when targetUrl is available)
          Boolean(targetUrl) && h('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03))',
              border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08))',
              borderRadius: 16,
              padding: '20px 16px 16px',
            },
          },
            // White Container for QR Code
            h('div', {
              style: {
                background: '#ffffff',
                borderRadius: 16,
                padding: 14,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 208,
                minHeight: 208,
              },
            },
              qrError ? h('div', {
                style: {
                  width: 180,
                  height: 180,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: '#ef4444',
                  fontSize: 12,
                  textAlign: 'center',
                },
              },
                h('span', { style: { fontSize: 24 } }, '⚠️'),
                h('span', null, '二维码加载失败'),
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  onClick: () => { setQrFallback(!qrFallback); setQrError(false); },
                  style: {
                    background: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    color: '#374151',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                  },
                }, '重试')
              ) : h('img', {
                key: qrImageUrl,
                src: qrImageUrl,
                alt: '扫码远程连接',
                onError: () => {
                  if (!qrFallback) {
                    setQrFallback(true);
                  } else {
                    setQrError(true);
                  }
                },
                style: {
                  width: 196,
                  height: 196,
                  display: 'block',
                  borderRadius: 6,
                  imageRendering: 'crisp-edges',
                },
              })
            ),

            // Target URL Pill & Copy / Open Buttons
            h('div', {
              style: {
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08))',
                borderRadius: 10,
                padding: '6px 8px 6px 12px',
                boxSizing: 'border-box',
              },
            },
              h('span', {
                style: {
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: 'var(--dsw-alias-label-primary, #ffffff)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              }, targetUrl),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                onClick: () => copyToClipboard(targetUrl, () => {
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                }),
                style: {
                  background: copiedUrl ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  border: copiedUrl ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                  color: copiedUrl ? '#34d399' : 'var(--dsw-alias-label-primary, #ffffff)',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                },
              }, copiedUrl ? [CheckIcon(13), '已复制'] : [CopyIcon(13), '复制']),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                onClick: () => {
                  try { window.open(targetUrl, '_blank'); } catch (e) {}
                },
                style: {
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                  color: 'var(--dsw-alias-label-primary, #ffffff)',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                },
              }, ExternalLinkIcon(13), '打开')
            ),

            // In-Context Mobile Password Helper (KEY UX ENHANCEMENT!)
            qrMode === 'remote' && h('div', {
              style: {
                width: '100%',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                boxSizing: 'border-box',
              },
            },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } },
                ShieldKeyIcon(16),
                h('div', { style: { minWidth: 0 } },
                  h('div', { style: { fontSize: 11, color: '#93c5fd', fontWeight: 500 } }, '扫码登录口令:'),
                  h('div', {
                    style: {
                      fontFamily: 'monospace',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#ffffff',
                      letterSpacing: curPwVisible ? '0.05em' : '0.15em',
                    },
                  },
                    curPw ? (curPwVisible ? curPw : '••••••••••••') : (pwLoading ? '读取中…' : '点击右侧查看')
                  )
                )
              ),
              h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  title: curPwVisible ? '隐藏口令' : '查看明文',
                  onClick: () => {
                    if (!curPw) fetchPassword(true);
                    else setCurPwVisible(!curPwVisible);
                  },
                  style: {
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 7,
                    padding: '5px 8px',
                    color: '#ffffff',
                  },
                }, curPwVisible ? EyeOffIcon(14) : EyeIcon(14)),
                curPw && h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  onClick: () => copyToClipboard(curPw, () => {
                    setCopiedPw(true);
                    setTimeout(() => setCopiedPw(false), 2000);
                  }),
                  style: {
                    background: copiedPw ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    border: copiedPw ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
                    color: copiedPw ? '#34d399' : '#ffffff',
                    borderRadius: 7,
                    padding: '5px 10px',
                    fontSize: 12,
                  },
                }, copiedPw ? [CheckIcon(13), '已复制'] : [CopyIcon(13), '复制口令'])
              )
            ),

            qrMode === 'lan' && h('div', {
              style: {
                width: '100%',
                fontSize: 12,
                color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
                textAlign: 'center',
                lineHeight: 1.4,
              },
            }, '💡 手机连接同一 WiFi 后直接扫码即可进入 DSH Web，无需输入验证口令。')
          )
        );
      }

      // 3. Tab: 地址管理 (Addresses)
      function renderRemotesTab() {
        const remotes = (data && data.remotes) || [];
        const activeId = (data && data.activeRemote && data.activeRemote.id) || null;

        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
          h('div', { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary, #9aa2ae)', lineHeight: 1.5 } },
            '管理用于外网访问的域名。扫码与远程链接将优先使用当前选中的地址。'
          ),

          // List of saved custom remotes
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            remotes.map((r) => {
              const isActive = r.id === activeId;
              return h('div', {
                key: r.id,
                className: 'dsh-gw-card',
                style: {
                  background: isActive ? 'rgba(59, 130, 246, 0.08)' : 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03))',
                  border: isActive ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08))',
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
                      background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isActive ? '#60a5fa' : 'var(--dsw-alias-label-secondary, #9aa2ae)',
                      flexShrink: 0,
                    },
                  }, GlobeIcon(18)),
                  h('div', { style: { minWidth: 0 } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                      h('span', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #ffffff)' } }, r.label || '未命名地址'),
                      isActive && h('span', {
                        style: {
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#34d399',
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
                        color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
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
                      background: 'var(--dsw-alias-brand-primary, #3b82f6)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '5px 10px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#ffffff',
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
                      background: copiedRemoteId === r.id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1))',
                      color: copiedRemoteId === r.id ? '#34d399' : 'var(--dsw-alias-label-primary, #ffffff)',
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
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      color: '#f87171',
                      borderRadius: 8,
                      padding: '5px 8px',
                      fontSize: 12,
                    },
                  }, TrashIcon(13))
                )
              );
            })
          ),

          // Cloudflare Quick Tunnel Card
          h('div', {
            className: 'dsh-gw-card',
            style: {
              background: isQuickActive ? 'rgba(245, 158, 11, 0.08)' : 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03))',
              border: isQuickActive ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08))',
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
                  background: 'rgba(245, 158, 11, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f59e0b',
                  flexShrink: 0,
                },
              }, h('span', { style: { fontSize: 16 } }, '⚡')),
              h('div', { style: { minWidth: 0 } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  h('span', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #ffffff)' } }, 'Cloudflare Quick Tunnel (临时)'),
                  isQuickActive && h('span', {
                    style: {
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34d399',
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
                    color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
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
                  background: 'rgba(245, 158, 11, 0.2)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  color: '#fbbf24',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                },
              }, '切至临时隧道')
            )
          ),

          // Add New Address Form / Trigger
          !addOpen ? h('button', {
            type: 'button',
            className: 'dsh-gw-btn',
            disabled: !!busy,
            onClick: () => { setAddOpen(true); setAddErr(''); },
            style: {
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px dashed var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.2))',
              borderRadius: 12,
              padding: '12px',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--dsw-alias-brand-primary, #60a5fa)',
              width: '100%',
              justifyContent: 'center',
            },
          }, PlusIcon(15), '添加自定义外网域名') : h('div', {
            style: {
              background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))',
              border: '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            },
          },
            h('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #ffffff)' } }, '添加自定义外网地址'),
            h('input', {
              className: 'dsh-gw-input',
              placeholder: '备注名称（如：家里固定域名）',
              value: addLabel,
              onChange: (e) => setAddLabel(e.target.value),
              style: {
                width: '100%',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.15))',
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 13,
                color: '#ffffff',
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
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.15))',
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 13,
                color: '#ffffff',
                boxSizing: 'border-box',
              },
            }),
            h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #9aa2ae)', lineHeight: 1.4 } },
              '💡 需预先在 Cloudflare Zero Trust 或其他穿透服务中，将此域名反向代理至本机 3081 端口。'
            ),
            addErr && h('div', { style: { fontSize: 12, color: '#f87171' } }, addErr),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 } },
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                onClick: () => { setAddOpen(false); setAddErr(''); },
                style: {
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 13,
                  color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
                },
              }, '取消'),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy || !addUrl.trim(),
                onClick: () => handleRemoteOp('add', { label: addLabel.trim(), baseUrl: addUrl.trim() }),
                style: {
                  background: 'var(--dsw-alias-brand-primary, #3b82f6)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.35)',
                },
              }, busy === 'remote' ? '保存中…' : '保存并设为当前使用')
            )
          )
        );
      }

      // 4. Tab: 安全设置 (Security & LAN)
      function renderSettingsTab() {
        const lan = data ? usableLanIps(data.lanIps) : [];

        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
          // Password Management Card
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03))',
              border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08))',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                ShieldKeyIcon(18),
                h('span', { style: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #ffffff)' } }, '外网访问口令')
              ),
              h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #9aa2ae)' } }, '局域网直连免密')
            ),
            h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #9aa2ae)', lineHeight: 1.4 } },
              '通过公网域名访问网关时需验证此口令，口令经加密存储于本机，更换后原有外网登录将全部失效。'
            ),

            // Password Display Field
            h('div', {
              style: {
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.1))',
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              },
            },
              h('span', {
                style: {
                  fontFamily: 'monospace',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#ffffff',
                  letterSpacing: curPwVisible ? '0.08em' : '0.15em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              }, curPw ? (curPwVisible ? curPw : '••••••••••••') : (pwLoading ? '读取中…' : '点击右侧查看')),
              h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  title: curPwVisible ? '隐藏口令' : '查看明文',
                  onClick: () => {
                    if (!curPw) fetchPassword(true);
                    else setCurPwVisible(!curPwVisible);
                  },
                  style: {
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                    borderRadius: 7,
                    padding: '5px 8px',
                    color: '#ffffff',
                  },
                }, curPwVisible ? EyeOffIcon(14) : EyeIcon(14)),
                curPw && h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  onClick: () => copyToClipboard(curPw, () => {
                    setCopiedPw(true);
                    setTimeout(() => setCopiedPw(false), 2000);
                  }),
                  style: {
                    background: copiedPw ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    border: copiedPw ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                    color: copiedPw ? '#34d399' : '#ffffff',
                    borderRadius: 7,
                    padding: '5px 10px',
                    fontSize: 12,
                  },
                }, copiedPw ? [CheckIcon(13), '已复制'] : [CopyIcon(13), '复制'])
              )
            ),

            pwNotice && h('div', {
              style: {
                fontSize: 12,
                color: pwNoticeType === 'success' ? '#34d399' : (pwNoticeType === 'error' ? '#f87171' : '#60a5fa'),
              },
            }, pwNotice),

            // Password Actions
            !editPwOpen ? h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy,
                onClick: handleRotatePassword,
                style: {
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 12,
                  color: 'var(--dsw-alias-label-primary, #ffffff)',
                },
              }, DiceIcon(14), busy === 'rotate' ? '生成中…' : '随机生成新口令'),
              h('button', {
                type: 'button',
                className: 'dsh-gw-btn',
                disabled: !!busy,
                onClick: () => { setEditPwOpen(true); setEditPwErr(''); setPwNotice(''); },
                style: {
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                  borderRadius: 8,
                  padding: '7px 12px',
                  fontSize: 12,
                  color: 'var(--dsw-alias-label-primary, #ffffff)',
                },
              }, '自定义修改口令')
            ) : h('div', {
              style: {
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: 10,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              },
            },
              h('div', { style: { position: 'relative' } },
                h('input', {
                  className: 'dsh-gw-input',
                  type: newPwVisible ? 'text' : 'password',
                  placeholder: '输入新口令（至少 6 位）',
                  value: newPw1,
                  onChange: (e) => setNewPw1(e.target.value),
                  style: {
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.15))',
                    borderRadius: 8,
                    padding: '8px 36px 8px 10px',
                    fontSize: 13,
                    color: '#ffffff',
                    boxSizing: 'border-box',
                  },
                }),
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  onClick: () => setNewPwVisible(!newPwVisible),
                  style: {
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
                    padding: 4,
                  },
                }, newPwVisible ? EyeOffIcon(14) : EyeIcon(14))
              ),
              h('input', {
                className: 'dsh-gw-input',
                type: newPwVisible ? 'text' : 'password',
                placeholder: '再次输入新口令以确认',
                value: newPw2,
                onChange: (e) => setNewPw2(e.target.value),
                style: {
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.15))',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 13,
                  color: '#ffffff',
                  boxSizing: 'border-box',
                },
              }),
              editPwErr && h('div', { style: { fontSize: 12, color: '#f87171' } }, editPwErr),
              h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 } },
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  onClick: () => setEditPwOpen(false),
                  style: {
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                    borderRadius: 7,
                    padding: '5px 12px',
                    fontSize: 12,
                    color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
                  },
                }, '取消'),
                h('button', {
                  type: 'button',
                  className: 'dsh-gw-btn',
                  disabled: !!busy || !newPw1,
                  onClick: handleSaveCustomPassword,
                  style: {
                    background: 'var(--dsw-alias-brand-primary, #3b82f6)',
                    border: 'none',
                    borderRadius: 7,
                    padding: '5px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#ffffff',
                  },
                }, busy === 'savePw' ? '保存中…' : '保存口令')
              )
            )
          ),

          // LAN Direct IPs Card
          h('div', {
            style: {
              background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.03))',
              border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08))',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              WifiIcon(18),
              h('span', { style: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #ffffff)' } }, '局域网直连地址')
            ),
            h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #9aa2ae)' } },
              '同一网段设备可直接在浏览器打开对应地址，免输入口令。'
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
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.07))',
                    borderRadius: 8,
                    padding: '6px 10px',
                    gap: 10,
                  },
                },
                  h('span', {
                    style: {
                      fontFamily: 'monospace',
                      fontSize: 13,
                      color: '#ffffff',
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
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 11,
                        color: '#ffffff',
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
                        background: copiedLan === u ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 11,
                        color: copiedLan === u ? '#34d399' : '#ffffff',
                      },
                    }, copiedLan === u ? CheckIcon(12) : CopyIcon(12))
                  )
                );
              })
            ) : h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #9aa2ae)' } }, '未检测到可用局域网 IPv4 地址')
          ),

          // Architecture Specs
          h('div', {
            style: {
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 12,
              color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
              lineHeight: 1.6,
            },
          },
            h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary, #ffffff)', marginBottom: 4 } }, '服务架构说明'),
            h('div', null, '• 网关端口: 3081（独立 Node.js 反代进程，常驻后台）'),
            h('div', null, '• DSH 本体: 127.0.0.1:3080（受信任上游，由网关负责凭证代签）'),
            h('div', null, '• 安全模式: 局域网直连免密通行；外网域名访问需输入口令。')
          )
        );
      }

      // -------------------------------------------------------------
      // Main Dialog Return
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
        // Backdrop
        h('div', {
          onClick: onClose,
          style: {
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          },
        }),

        // Modal Window
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
            background: 'var(--dsw-alias-bg-layer-1, #141721)',
            color: 'var(--dsw-alias-label-primary, #f3f4f6)',
            border: '1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.12))',
            borderRadius: 20,
            padding: '24px 24px 20px',
            fontSize: 14,
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            boxSizing: 'border-box',
            animation: 'dshGwScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          },
        },
          // Header Row
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
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(99, 102, 241, 0.25))',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60a5fa',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)',
                },
              }, PhoneIcon(22)),
              h('div', null,
                h('h2', {
                  style: {
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--dsw-alias-label-primary, #ffffff)',
                    letterSpacing: '-0.01em',
                  },
                }, '远程访问与网关'),
                h('p', {
                  style: {
                    margin: '3px 0 0',
                    fontSize: 12,
                    color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
                  },
                }, '手机扫码直达 · 外网口令保护 · 局域网直连免密')
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
                background: 'rgba(255, 255, 255, 0.07)',
                color: 'var(--dsw-alias-label-secondary, #9aa2ae)',
                padding: 0,
              },
            }, CloseIcon(16))
          ),

          // Status & Quick Control Bar
          renderStatusBar(),

          // Segmented Navigation Tabs
          h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.05))',
              borderRadius: 12,
              padding: 3,
              marginBottom: 16,
              gap: 4,
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
                  background: active ? 'var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.12))' : 'transparent',
                  color: active ? 'var(--dsw-alias-label-primary, #ffffff)' : 'var(--dsw-alias-label-secondary, #9aa2ae)',
                  boxShadow: active ? '0 2px 8px rgba(0, 0, 0, 0.25)' : 'none',
                },
              }, t.icon, t.label);
            })
          ),

          // Tab Content
          status.kind === 'error' && h('div', {
            style: {
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 12,
              color: '#f87171',
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
            background: open ? 'var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.12))' : 'transparent',
            color: open ? 'var(--dsw-alias-label-primary, #ffffff)' : 'var(--dsw-alias-label-secondary, #8b949e)',
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
              background: '#10b981',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)',
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
