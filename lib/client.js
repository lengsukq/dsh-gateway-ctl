/* dsh-gateway-ctl browser half: sidebar entry + remote-access panel.
 *
 * Loaded as `window.__ModuleLoader__.load({ id, factory })`; React is
 * provided by the loader (`require("react")`, `require("react-dom")`).
 * No build step: plain createElement + inline styles.
 *
 * The panel talks to the Host half over same-origin HTTP:
 *   GET  /api/gw/status   -> { alive, tunnelUrl, loginUrl, publicSource,
 *                              activeRemote, remotes, lanIps, lanQr[] }
 *   POST /api/gw/control  -> { action: start|stop|restart }
 *   POST /api/gw/remotes  -> { op: add|remove|activate, ... }
 * The QR image itself is served by the standalone gateway:
 *   http://<lan-ip>:3081/__gw/qr?u=<loginUrl>
 */
window.__ModuleLoader__.load({
  id: 'dsh-gateway-ctl',
  factory: (require) => {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const module = { exports: {} };
    const exports = module.exports;

    const inject = ['slots'];

    const OVERLAY = {
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    };
    const MASK = { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' };
    const PANEL = {
      position: 'relative', width: 400, maxWidth: 'calc(100vw - 48px)',
      maxHeight: 'calc(100vh - 48px)', overflow: 'auto',
      background: 'var(--dsw-alias-bg-layer-2, #161b22)',
      color: 'var(--dsw-alias-label-primary, #e6edf3)',
      borderRadius: 20, padding: '20px 20px 16px', fontSize: 14, lineHeight: '22px',
      boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
    };
    const TRIGGER = {
      width: 36, height: 36, borderRadius: '50%', border: 'none',
      background: 'transparent', color: 'var(--dsw-alias-label-secondary, #8b949e)',
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    };
    const BTN = {
      border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
      background: 'var(--dsw-alias-button-elevated-fill, rgba(127,127,127,0.12))',
      color: 'var(--dsw-alias-label-primary, #e6edf3)',
      borderRadius: 10, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
    };
    const BTN_PRIMARY = { ...BTN, background: '#1f6feb', borderColor: '#1f6feb', color: '#fff' };
    const CARD = {
      border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.25))',
      borderRadius: 14, padding: 14,
      background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.07))',
      display: 'flex', flexDirection: 'column', gap: 10,
    };
    const INPUT = {
      width: '100%', boxSizing: 'border-box',
      background: 'var(--dsw-alias-bg-base, transparent)',
      color: 'inherit',
      border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.35))',
      borderRadius: 10, padding: '9px 12px', fontSize: 13,
    };
    const MUTED = { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, #8b949e)' };
    const ERR_TEXT = { margin: 0, fontSize: 12, color: 'var(--dsw-alias-state-error-primary, #f85149)' };
    const OK_TEXT = { margin: 0, fontSize: 12, color: 'var(--dsw-alias-state-success-primary, #3fb950)' };
    const TABBAR = {
      display: 'flex', gap: 4,
      borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,0.25))',
      margin: '12px 0 14px',
    };
    function tabStyle(active) {
      return {
        border: 0, background: 'none', cursor: 'pointer',
        padding: '8px 12px', fontSize: 14,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--dsw-alias-brand-primary, #1f6feb)' : 'var(--dsw-alias-label-secondary, #8b949e)',
        borderBottom: active ? '2px solid var(--dsw-alias-brand-primary, #1f6feb)' : '2px solid transparent',
        marginBottom: -1,
      };
    }

    function PhoneIcon(size) {
      return React.createElement(
        'svg', { width: size || 18, height: size || 18, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 },
        React.createElement('rect', { x: 5, y: 2, width: 10, height: 16, rx: 2 }),
        React.createElement('line', { x1: 8.5, y1: 15.5, x2: 11.5, y2: 15.5 }),
      );
    }

    // 198.18.0.0/15 (benchmark) 与 169.254/16 (link-local) 不是可用局域网, 展示时过滤。
    function usableLanIps(ips) {
      return (ips || []).filter((ip) => !/^198\.18\./.test(ip) && !/^169\.254\./.test(ip));
    }

    function useGwStatus(open) {
      const [state, setState] = React.useState({ kind: 'idle' });
      React.useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        setState({ kind: 'loading' });
        fetch('/api/gw/status', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((data) => { if (!cancelled) setState({ kind: 'ready', data }); })
          .catch((e) => { if (!cancelled) setState({ kind: 'error', error: String((e && e.message) || e) }); });
        return () => { cancelled = true; };
      }, [open]);
      return [state, setState];
    }

    function GatewayPanel(props) {
      const onClose = props.onClose;
      const [status, setStatus] = useGwStatus(true);
      const [tab, setTab] = React.useState('qr');
      const [busy, setBusy] = React.useState('');
      const [copied, setCopied] = React.useState(false);
      const [adding, setAdding] = React.useState(false);
      const [newLabel, setNewLabel] = React.useState('');
      const [newUrl, setNewUrl] = React.useState('');
      const [formErr, setFormErr] = React.useState('');
      const [pwOpen, setPwOpen] = React.useState(false);
      const [pw1, setPw1] = React.useState('');
      const [pw2, setPw2] = React.useState('');
      const [pwShow, setPwShow] = React.useState(false);
      const [pwErr, setPwErr] = React.useState('');
      const [pwOk, setPwOk] = React.useState(false);
      const [curPw, setCurPw] = React.useState('');
      const [curPwShow, setCurPwShow] = React.useState(false);
      const [curPwErr, setCurPwErr] = React.useState('');
      const [curPwCopied, setCurPwCopied] = React.useState(false);
      const [qrFailed, setQrFailed] = React.useState(false);
      const [qrRetry, setQrRetry] = React.useState(0);
      const [qrTargetSel, setQrTargetSel] = React.useState(null);
      const [copiedLan, setCopiedLan] = React.useState('');

      // 网关管理接口基地址: 网关页自身用相对路径; 本机回环直连 127.0.0.1:3081;
      // 同网段局域网 IP 用对应网关地址; 其他情况不可达返回 null。
      const gwBaseFor = (kind) => {
        try {
          const host = (typeof window !== 'undefined' && window.location && window.location.host) || '';
          if (/:3081$/.test(host)) return '';
          const ip = host.split(':')[0];
          if (ip === '127.0.0.1' || ip === 'localhost' || ip === '[::1]') return 'http://127.0.0.1:3081';
          const m = data && data.lanQr && data.lanQr.find((e) => e.ip === ip);
          if (m) return m.qr.replace(/\/__gw\/qr$/, '');
        } catch (e) { /* fall through */ }
        return null;
      };

      const revealPassword = () => {
        setCurPwErr('');
        setCurPwCopied(false);
        // 已登录 session 本身就是查看凭证: 直接发请求, 网关侧判定
        // (直连+有效session才给; 外网/未登录一律403, 文案由服务端返回)。
        // 注意: 不能在客户端按 IP 预判拦截 —— 经网关代签登录的页面同样持有有效 session。
        const gwBase = gwBaseFor('reveal');
        if (gwBase === null) { setCurPwErr('当前页面连不上网关，请用局域网地址打开'); return; }
        setBusy('reveal');
        fetch(gwBase + '/__gw/reveal', { method: 'POST' })
          .then((r) => r.json().then((d) => ({ httpOk: r.ok, d })))
          .then(({ httpOk, d }) => {
            if (!httpOk || !d.ok) throw new Error((d && d.error) || '查看失败');
            setCurPw(d.password || '');
            setCurPwShow(true);
          })
          .catch((e) => setCurPwErr(String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      const rotatePassword = () => {
        setPwErr('');
        setPwOk(false);
        setBusy('rotate');
        const gwBase = gwBaseFor('rotate');
        if (gwBase === null) { setPwErr('当前页面连不上网关，请用局域网地址打开'); setBusy(''); return; }
        fetch(gwBase + '/__gw/rotate', { method: 'POST' })
          .then((r) => r.json().then((d) => ({ httpOk: r.ok, d })))
          .then(({ httpOk, d }) => {
            if (!httpOk || !d.ok) throw new Error((d && d.error) || '更换失败');
            // 新口令直接回填到输入框并展示, 用户点保存即生效(旧登录全部失效)
            setPw1(d.password || '');
            setPw2(d.password || '');
            setPwShow(true);
            setPwOpen(true);
          })
          .catch((e) => setPwErr(String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      const changePassword = () => {
        setPwErr('');
        setPwOk(false);
        if (pw1.length < 6) { setPwErr('口令至少 6 位'); return; }
        if (pw1 !== pw2) { setPwErr('两次输入不一致'); return; }
        setBusy('password');
        const gwBase = gwBaseFor('password');
        if (gwBase === null) { setPwErr('当前页面连不上网关，请用局域网地址打开'); setBusy(''); return; }
        fetch(gwBase + '/__gw/password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: pw1 }),
        })
          .then((r) => r.json().then((d) => ({ httpOk: r.ok, d })))
          .then(({ httpOk, d }) => {
            if (!httpOk || !d.ok) throw new Error((d && d.error) || '修改失败');
            setPwOk(true);
            setPw1('');
            setPw2('');
            setTimeout(() => { setPwOpen(false); setPwOk(false); }, 1500);
          })
          .catch((e) => setPwErr(String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      const refresh = () => fetch('/api/gw/status', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((data) => setStatus({ kind: 'ready', data }))
        .catch((e) => setStatus({ kind: 'error', error: String((e && e.message) || e) }));

      const control = (action) => {
        setBusy(action);
        fetch('/api/gw/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        })
          .then((r) => r.json())
          .then(() => refresh())
          .catch((e) => setStatus({ kind: 'error', error: String((e && e.message) || e) }))
          .finally(() => setBusy(''));
      };

      const remoteOp = (op, extra) => {
        setBusy('remote');
        setFormErr('');
        fetch('/api/gw/remotes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, ...(extra || {}) }),
        })
          .then((r) => r.json().then((data) => ({ httpOk: r.ok, data })))
          .then(({ httpOk, data }) => {
            if (!httpOk || !data.ok) throw new Error((data && data.error) || ('HTTP 错误'));
            const done = () => {
              if (op === 'add') {
                setAdding(false);
                setNewLabel('');
                setNewUrl('');
              }
              return refresh();
            };
            // 新增后自动选中新地址, 二维码立刻跟随切换
            if (op === 'add' && data.remote && data.remote.id) {
              return fetch('/api/gw/remotes', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ op: 'activate', id: data.remote.id }),
              }).then(() => done());
            }
            return done();
          })
          .catch((e) => setFormErr(String((e && e.message) || e)))
          .finally(() => setBusy(''));
      };

      const data = status.kind === 'ready' ? status.data : null;
      const wanUrl = (data && data.loginUrl) || '';
      const lanList = data ? usableLanIps(data.lanIps) : [];
      const lanUrls = lanList.map((ip) => 'http://' + ip + ':3081');
      // 扫码目标选项: 公网(默认, 无公网时自动落到第一个局域网) + 每个局域网地址。
      const qrOptions = (() => {
        const opts = [];
        if (wanUrl) opts.push({ key: '__wan__', label: '公网', url: wanUrl });
        lanUrls.forEach((u, i) => opts.push({ key: u, label: '局域网 ' + (i + 1) + ' · ' + u, url: u }));
        return opts;
      })();
      const qrTarget = (() => {
        if (qrOptions.length === 0) return null;
        if (qrTargetSel) {
          const hit = qrOptions.find((o) => o.key === qrTargetSel);
          if (hit) return hit;
        }
        return qrOptions[0];
      })();
      const loginUrl = qrTarget ? qrTarget.url : '';
      // 二维码图片(n)必须从"当前浏览器可达"的网关取, 内容(u)是上面选中的目标地址。
      const pageHost = (typeof window !== 'undefined' && window.location && window.location.host) || '';
      const qrImgBase = (() => {
        if (pageHost) {
          // 网关页自身: 相对路径最稳
          if (/:3081$/.test(pageHost)) return '/__gw/qr';
          const pageIp = pageHost.split(':')[0];
          // 域名访问(外网): 图走公网地址同域(网关 /__gw/qr 无需鉴权)
          if (wanUrl && !/^[0-9a-fA-F:.]+$/.test(pageIp) && pageIp !== 'localhost') {
            try {
              return new URL(wanUrl).origin + '/__gw/qr';
            } catch (e) { /* fall through */ }
          }
          // 局域网 IP 访问: 挑同 IP 的网关(可达性最高)
          const match = data && data.lanQr && data.lanQr.find((e) => e.ip === pageIp);
          if (match) return match.qr;
        }
        if (data && data.lanQr && data.lanQr.length > 0) return data.lanQr[0].qr;
        return '';
      })();
      const qrSrc = qrImgBase && loginUrl ? qrImgBase + '?u=' + encodeURIComponent(loginUrl) : '';

      // 二维码目标变化时清除旧的失败态, 重试计数拼到 URL 上强制重载
      React.useEffect(() => { setQrFailed(false); }, [qrSrc]);
      const qrImgSrc = qrRetry > 0 && qrSrc ? qrSrc + '&r=' + qrRetry : qrSrc;

      const copyText = (text, done) => {
        if (!text) return;
        try {
          navigator.clipboard.writeText(text).then(() => done(true));
        } catch (e) { /* clipboard unavailable */ }
      };
      const copy = () => {
        if (!loginUrl) return;
        copyText(loginUrl, () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      };
      const copyLan = (u) => {
        copyText(u, () => {
          setCopiedLan(u);
          setTimeout(() => setCopiedLan(''), 1500);
        });
      };

      const publicDesc = !data ? '' : (data.publicSource === 'custom' && data.activeRemote)
        ? data.activeRemote.label + ' · ' + data.activeRemote.baseUrl
        : (data.tunnelUrl ? 'Quick Tunnel · ' + data.tunnelUrl : '无外网地址');

      function emptyBox(icon, title, desc, actionLabel, onAction) {
        return React.createElement(
          'div', { style: { ...CARD, alignItems: 'center', textAlign: 'center', padding: '28px 16px' } },
          React.createElement('div', { style: { fontSize: 30, lineHeight: 1 } }, icon),
          React.createElement('div', { style: { fontWeight: 600, fontSize: 14 } }, title),
          desc && React.createElement('p', { style: MUTED }, desc),
          actionLabel && React.createElement(
            'button', { type: 'button', style: BTN_PRIMARY, disabled: !!busy, onClick: onAction },
            busy ? '执行中…' : actionLabel,
          ),
        );
      }

      function renderQrTab() {
        // 网关未运行: 不渲染 img, 给空态 + 一键启动(之前这里直接碎图)
        if (!data.alive) {
          return emptyBox('💤', '网关未运行', '请先启动网关，启动后才能生成二维码，局域网直连也需要它。', '启动网关', () => control('start'));
        }
        if (qrOptions.length === 0) {
          return emptyBox('🔗', '暂无可用地址', '新增一个自定义地址（如 Dashboard 配好的域名），或启动 Quick Tunnel。', '去新增地址', () => setTab('addr'));
        }
        if (qrFailed) {
          return emptyBox('⚠️', '二维码加载失败', '网关图片服务不可达，确认网关仍在运行后重试。', '重试', () => { setQrRetry((n) => n + 1); setQrFailed(false); });
        }
        return React.createElement(
          'div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          qrOptions.length > 1 && React.createElement(
            'div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            qrOptions.map((o) => React.createElement(
              'button',
              {
                key: o.key, type: 'button',
                onClick: () => { setQrTargetSel(o.key); },
                style: qrTarget && o.key === qrTarget.key
                  ? { ...BTN_PRIMARY, padding: '6px 12px', fontSize: 12 }
                  : { ...BTN, padding: '6px 12px', fontSize: 12 },
              },
              o.key === '__wan__' ? '🌐 公网' : '📶 局域网 ' + (qrOptions.filter((x) => x.key !== '__wan__').findIndex((x) => x.key === o.key) + 1),
            )),
          ),
          React.createElement(
            'div', { style: { background: '#fff', borderRadius: 14, padding: 14, display: 'flex', justifyContent: 'center' } },
            React.createElement('img', {
              key: qrImgSrc, src: qrImgSrc, alt: '扫码远程',
              style: { width: 216, height: 216, display: 'block' },
              onError: () => setQrFailed(true),
            }),
          ),
          React.createElement('p', { style: { ...MUTED, fontFamily: 'monospace', wordBreak: 'break-all' } }, loginUrl),
          React.createElement(
            'div', { style: { display: 'flex', gap: 8 } },
            React.createElement('button', { type: 'button', style: { ...BTN_PRIMARY, flex: 1 }, disabled: !!busy, onClick: copy }, copied ? '已复制' : '复制链接'),
          ),
        );
      }

      function renderAddrTab() {
        return React.createElement(
          'div', { style: CARD },
          React.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, '外网地址'),
          React.createElement('p', { style: MUTED }, '二维码与链接使用当前选中的地址。自定义地址需先在 Cloudflare Dashboard（或其他穿透）配好指向网关 :3081。'),
          React.createElement(
            'select', {
              value: data.activeRemote ? data.activeRemote.id : (data.tunnelUrl ? '__quick__' : '__none__'),
              disabled: !!busy,
              onChange: (e) => {
                const v = e.target.value;
                if (v === '__quick__' || v === '__none__') remoteOp('activate', { id: null });
                else remoteOp('activate', { id: v });
              },
              style: INPUT,
            },
            data.tunnelUrl && React.createElement('option', { value: '__quick__' }, 'Quick Tunnel（临时）'),
            data.remotes.map((r) => React.createElement('option', { key: r.id, value: r.id }, r.label + ' · ' + r.baseUrl)),
            !data.tunnelUrl && data.remotes.length === 0 && React.createElement('option', { value: '__none__' }, '（暂无外网地址）'),
          ),
          data.publicSource === 'custom' && data.activeRemote && React.createElement(
            'div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            React.createElement('span', { style: { ...MUTED, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '当前：' + data.activeRemote.baseUrl),
            React.createElement('button', { type: 'button', style: { ...BTN, padding: '4px 10px', fontSize: 12 }, disabled: !!busy, onClick: () => remoteOp('remove', { id: data.activeRemote.id }) }, '删除'),
          ),
          !adding ? React.createElement(
            'button', { type: 'button', style: { ...BTN, alignSelf: 'flex-start' }, disabled: !!busy, onClick: () => { setAdding(true); setFormErr(''); } }, '＋ 新增自定义地址',
          ) : React.createElement(
            'div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            React.createElement('input', {
              placeholder: '名称（可选，如 家里固定域名）', value: newLabel,
              onChange: (e) => setNewLabel(e.target.value), style: INPUT,
            }),
            React.createElement('input', {
              placeholder: 'https://dsh.example.com', value: newUrl,
              onChange: (e) => setNewUrl(e.target.value), style: INPUT,
            }),
            formErr && React.createElement('p', { style: ERR_TEXT }, formErr),
            React.createElement(
              'div', { style: { display: 'flex', gap: 8 } },
              React.createElement('button', { type: 'button', style: BTN_PRIMARY, disabled: !!busy || !newUrl.trim(), onClick: () => remoteOp('add', { label: newLabel.trim(), baseUrl: newUrl.trim() }) }, busy ? '保存中…' : '保存并使用'),
              React.createElement('button', { type: 'button', style: BTN, disabled: !!busy, onClick: () => { setAdding(false); setFormErr(''); } }, '取消'),
            ),
          ),
        );
      }

      function renderSettingsTab() {
        const lan = usableLanIps(data.lanIps);
        return React.createElement(
          'div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          React.createElement(
            'div', { style: CARD },
            React.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, '网关'),
            React.createElement(
              'div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              React.createElement('button', { type: 'button', style: BTN, disabled: !!busy, onClick: () => control(data.alive ? 'restart' : 'start') }, busy ? '执行中…' : (data.alive ? '重启网关' : '启动网关')),
              data.alive && React.createElement('button', { type: 'button', style: BTN, disabled: !!busy, onClick: () => control('stop') }, '停止网关'),
            ),
            React.createElement('p', { style: MUTED }, '未选中自定义地址时，启动网关会自动拉起 Quick Tunnel；选中后则自动关闭。'),
          ),
          React.createElement(
            'div', { style: CARD },
            React.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, '局域网直连（免口令）'),
            lan.length > 0
              ? lan.map((ip) => {
                const u = 'http://' + ip + ':3081';
                return React.createElement(
                  'div', { key: ip, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  React.createElement('span', { style: { ...MUTED, flex: 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, u),
                  React.createElement('button', { type: 'button', style: { ...BTN, padding: '4px 10px', fontSize: 12, flex: 'none' }, onClick: () => { try { window.open(u, '_blank'); } catch (e) { /* ignore */ } } }, '打开'),
                  React.createElement('button', { type: 'button', style: { ...BTN, padding: '4px 10px', fontSize: 12, flex: 'none' }, onClick: () => copyLan(u) }, copiedLan === u ? '已复制' : '复制'),
                );
              })
              : React.createElement('p', { style: MUTED }, '无可用局域网地址'),
          ),
          React.createElement(
            'div', { style: CARD },
            React.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, '访问口令'),
            React.createElement(
              'div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              React.createElement('span', { style: { ...MUTED, flex: 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                curPw ? (curPwShow ? curPw : '••••••••') : '当前口令（点击眼睛查看）'),
              React.createElement('button', { type: 'button', title: curPw ? '显示/隐藏' : '查看当前口令', onClick: () => { if (curPw) { setCurPwShow(!curPwShow); } else { revealPassword(); } }, disabled: !!busy, style: { ...BTN, padding: '4px 10px', fontSize: 12, flex: 'none' } }, curPw && curPwShow ? '🙈' : '👁'),
              curPw && React.createElement('button', {
                type: 'button', style: { ...BTN, padding: '4px 10px', fontSize: 12, flex: 'none' },
                onClick: () => {
                  try {
                    navigator.clipboard.writeText(curPw).then(() => {
                      setCurPwCopied(true);
                      setTimeout(() => setCurPwCopied(false), 1500);
                    });
                  } catch (e) { /* clipboard unavailable */ }
                },
              }, curPwCopied ? '已复制' : '复制'),
            ),
            curPwErr && React.createElement('p', { style: ERR_TEXT }, curPwErr),
            !pwOpen ? React.createElement(
              'div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              React.createElement('button', { type: 'button', style: { ...BTN, alignSelf: 'flex-start' }, disabled: !!busy, onClick: () => { setPwOpen(true); setPwErr(''); setPwOk(false); } }, '修改访问口令'),
              React.createElement('button', { type: 'button', style: { ...BTN, alignSelf: 'flex-start' }, disabled: !!busy, onClick: rotatePassword }, busy === 'rotate' ? '生成中…' : '🎲 随机生成并更换'),
            ) : React.createElement(
              'div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              React.createElement(
                'div', { style: { position: 'relative' } },
                React.createElement('input', {
                  type: pwShow ? 'text' : 'password', placeholder: '新口令（至少 6 位）', value: pw1,
                  onChange: (e) => setPw1(e.target.value),
                  style: { ...INPUT, paddingRight: 40 },
                }),
                React.createElement('button', { type: 'button', title: '显示/隐藏', onClick: () => setPwShow(!pwShow), style: { position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, fontSize: 16, cursor: 'pointer' } }, pwShow ? '🙈' : '👁'),
              ),
              React.createElement('input', {
                type: pwShow ? 'text' : 'password', placeholder: '再输一次确认', value: pw2,
                onChange: (e) => setPw2(e.target.value), style: INPUT,
              }),
              pwErr && React.createElement('p', { style: ERR_TEXT }, pwErr),
              pwOk && React.createElement('p', { style: OK_TEXT }, '口令已更新，旧登录全部失效'),
              React.createElement(
                'div', { style: { display: 'flex', gap: 8 } },
                React.createElement('button', { type: 'button', style: BTN_PRIMARY, disabled: !!busy || !pw1, onClick: changePassword }, busy === 'password' ? '保存中…' : '保存新口令'),
                React.createElement('button', { type: 'button', style: BTN, disabled: !!busy, onClick: () => { setPwOpen(false); setPwErr(''); } }, '取消'),
              ),
            ),
          ),
        );
      }

      return React.createElement(
        'div', { style: OVERLAY },
        React.createElement('div', { style: MASK, onClick: onClose }),
        React.createElement(
          'div', { style: PANEL, role: 'dialog', 'aria-label': '扫码远程' },
          React.createElement(
            'div', { style: { display: 'flex', alignItems: 'flex-start', gap: 12 } },
            React.createElement(
              'div', { style: { flex: 1 } },
              React.createElement('h2', { style: { margin: 0, fontSize: 18, fontWeight: 600 } }, '扫码远程'),
              React.createElement('p', { style: { margin: '4px 0 0', fontSize: 13, color: 'var(--dsw-alias-label-secondary, #8b949e)' } }, '手机扫码，输入网关口令即可远程使用（局域网免口令）'),
            ),
            React.createElement('button', { type: 'button', onClick: onClose, style: { ...TRIGGER, width: 28, height: 28 }, 'aria-label': '关闭' }, '✕'),
          ),
          status.kind === 'loading' && React.createElement(
            'div', { style: { ...CARD, minHeight: 280, alignItems: 'center', justifyContent: 'center', marginTop: 12 } },
            React.createElement('p', { style: MUTED }, '正在读取网关状态…'),
          ),
          status.kind === 'error' && React.createElement('p', { style: { color: 'var(--dsw-alias-state-error-primary, #f85149)' } }, '读取失败：' + status.error),
          data && React.createElement(
            'div', { style: { marginTop: 4 } },
            React.createElement(
              'div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 } },
              React.createElement('span', {
                style: {
                  width: 8, height: 8, borderRadius: '50%',
                  background: data.alive ? '#3fb950' : '#f85149', display: 'inline-block', flex: 'none',
                },
              }),
              React.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                (data.alive ? '网关运行中 :3081' : '网关未运行') + ' · ' + publicDesc),
            ),
            React.createElement(
              'div', { style: TABBAR },
              React.createElement('button', { type: 'button', style: tabStyle(tab === 'qr'), onClick: () => setTab('qr') }, '扫码'),
              React.createElement('button', { type: 'button', style: tabStyle(tab === 'addr'), onClick: () => setTab('addr') }, '地址'),
              React.createElement('button', { type: 'button', style: tabStyle(tab === 'settings'), onClick: () => setTab('settings') }, '设置'),
            ),
            tab === 'qr' && renderQrTab(),
            tab === 'addr' && renderAddrTab(),
            tab === 'settings' && renderSettingsTab(),
          ),
        ),
      );
    }

    function GatewayEntry(props) {
      const [open, setOpen] = React.useState(false);
      // 侧栏 footer 槽位很窄: 宽窄一律只显示图标(与设置齿轮对齐),
      // 文字说明放 title tooltip, 避免宽态下文字被挤成竖排。
      return React.createElement(
        React.Fragment, null,
        React.createElement(
          'button', {
            type: 'button', title: '扫码远程', 'aria-label': '扫码远程',
            onClick: () => setOpen(true), style: TRIGGER,
          },
          PhoneIcon(props.wide ? 16 : 18),
        ),
        open && ReactDOM.createPortal(
          React.createElement(GatewayPanel, { onClose: () => setOpen(false) }),
          document.body,
        ),
      );
    }

    function apply(ctx) {
      ctx.slots.inject('sidebar.footer.action', () => {
        let dispose;
        try {
          dispose = ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'gateway-ctl' },
            GatewayEntry,
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
