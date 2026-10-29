# dsh-gateway-ctl

DSH（DeepSeek Harness）自研远程网关插件：无需第三方远程插件，即可在外网通过浏览器访问家里的 DSH Web GUI。

## 它解决什么问题

DSH 本体只监听 `127.0.0.1:3080`，且自带浏览器信任围栏 + launch token 鉴权——直接把隧道指过去会被 403。`dsh-gateway-ctl` 起一个独立网关进程（默认 `:3081`），对外提供统一入口，并且**只用一个门禁**：

> 除登录页 / 扫码配对 / 二维码 / 最小状态外，**任何来源**（本机回环、局域网、EasyTier、Cloudflare 隧道、公网）
> 都必须持有有效凭证：网页会话 `gw_session`、设备凭证 `gw_device`，或回环专用的内部管理密钥 `x-gw-admin`。
> 不存在任何"按来源 IP 免密"的通道。

一次性配对令牌（默认 90 秒、单次、防重放）是唯一可以免输口令的凭证，且只能由已登录的所有者签发。

## 架构

```text
手机/外网浏览器
    │  https://<你的域名>  (Cloudflare Tunnel / 其他穿透, 你自己配)
    ▼
独立网关进程 :3081 (gateway.mjs, 零第三方依赖, 除了二维码 qrcode)
    │  统一门禁 → 改写 Host/Origin → 127.0.0.1:3080, HTTP + WebSocket 全透传
    ▼
DSH 本体 127.0.0.1:3080 (完全不动)
```

本仓库是 **DSH 插件控制面**（随 DSH 进程加载）：`gw_gateway` 模型工具 + 侧栏扫码 UI + `/api/gw/*` 同源接口。
这些接口在插件侧自动附加内部管理密钥，所以浏览器永远不需要持有该密钥。

## 安装

前置：Node.js 18+、`cloudflared`（Quick Tunnel 用；只用固定域名可不装）、正在跑的 DSH。

```bash
# 1. 装插件包到 DSH profile（link 方式，改代码即生效）
dsh plugin --profile web add link:/path/to/dsh-gateway-ctl

# 2. 重启 DSH Web —— 网关会在 DSH 启动后自动拉起（见下方「开机自启」）
```

插件首次启动时会把仓库里的 `gateway/gateway.mjs`、`gateway/gw.sh` 部署到 `~/.dsh/gateway`
（**内容哈希比较**：内容不同才覆盖；`DSH_GW_KEEP_LOCAL=1` 可禁止覆盖），并补齐 `.gw_admin`、
`config.json` 与只含 `qrcode` 依赖的 `package.json`。二维码依赖缺失时补装一次：

```bash
cd ~/.dsh/gateway && npm i qrcode
```

手动控制（首次启动会自动生成随机口令，打在 `gateway.log` 的 `FIRST_START_PASSWORD` 里）：

```bash
cd ~/.dsh/gateway && ./gw.sh start|stop|restart|status|qr
```

### 开机自启

DSH 启动完成（Web 服务就绪）后，插件探测 `127.0.0.1:3081`：

- 已经在跑 → 什么都不做（网关是 `nohup` 独立进程，DSH 重启不会带走它）
- 没在跑 → 自动执行 `gw.sh start`，需要时同时拉起 Quick Tunnel

关闭自启：`DSH_GW_AUTOSTART=0 dsh ...`，或在 profile 的 `cordis.patch.yml` 里给
`gateway-ctl` 行加 `config: { autoStart: false }`。每次自启结果追加到 `~/.dsh/gateway/plugin.log`。

## 持久化凭证与密钥

`~/.dsh/gateway/` 下的四类凭证全部落盘、`0600`、tmp+rename 原子写，网关重启不需要重新登录：

| 文件 | 内容 | 轮换方式 |
|---|---|---|
| `.gw_admin` | 内部管理密钥（32B base64url），插件 / `gw.sh` / `gw_gateway` 工具共用 | `gw.sh key rotate` 或面板「轮换内部密钥」 |
| `.gw_password` | 口令 scrypt 哈希（`scrypt$N$r$p$salt$hash`） | 面板「重设主口令」或 `gw.sh password` |
| `sessions.json` | 网页会话 **只存 token 的 sha256** + 到期时间 + 最近来源 | 登录/登出自动维护；`gw.sh sessions revoke` 全部失效 |
| `devices.json` | 设备凭证 **只存 token 哈希** + `expiresAt` + 状态 | 面板/工具按台、整组或全部撤销 |

- 内部管理密钥**只认回环 peer**：即使密钥泄露也无法从公网/局域网使用。
- 设备凭证由服务端强制校验 `expiresAt`（`deviceTtlDays`，默认 365 天），过期自动标记 `expired`。
- 改口令会立即失效全部会话；「同时撤销全部设备」是可选项（默认不勾选）。
- `gateway.log` / `tunnel.log` / `access.log` 一律 `0600`；首次启动的明文口令在改口令后自动脱敏成 `<redacted>`。
- `devices.json` / `sessions.json` 损坏时会被改名成 `.corrupt-<时间戳>`，服务以空集启动（失败关闭），绝不覆盖原文件。

## 环境变量

| 变量 | 作用 |
|---|---|
| `DSH_GW_AUTOSTART=0` | 关闭 DSH 启动时自动拉起网关 |
| `DSH_GW_DIR` | 网关运行目录（默认 `~/.dsh/gateway`） |
| `DSH_GW_QRCODE` | 指定 `qrcode` 模块（包名或绝对路径） |
| `DSH_GW_KEEP_LOCAL=1` | 不覆盖 `~/.dsh/gateway` 里已有的 `gateway.mjs` / `gw.sh` |
| `GW_PORT` / `GW_BIND` | 网关端口（默认 3081）/ 监听地址（默认 `0.0.0.0`） |
| `GW_TRUSTED_PROXIES` | 可信反代地址（逗号分隔，默认 `127.0.0.1,::1`）；只有它们的转发头被采信 |
| `GW_DEVICE_TTL_D` | 设备凭证有效期天数（默认 365，等价于 `config.json.deviceTtlDays`） |
| `GW_SESSION_TTL_H` | 网页会话有效期小时（默认 24） |
| `GW_UPSTREAM_HOST` / `GW_UPSTREAM_PORT` | 上游 DSH 地址（默认 `127.0.0.1:3080`） |
| `GW_REQUIRE_HTTPS=1` | 拒绝非回环的明文 HTTP 请求（426 页面），用于 FRP/裸端口场景防窃听 |
| `DSH_GW_NO_AUTO_RESTART=1` | 关闭「检测到进程版本落后时自动 `gw.sh restart`」 |
| `GW_BUILD_ID` | 网关构建号（`gw.sh` 自动注入 sha256 前 12 位，供插件比对） |

`config.json`（可用面板「访问策略」修改部分字段）：

```json
{ "deviceTtlDays": 365, "pairTtlSeconds": 90 }
```

> `lanAuth` 字段已废弃：写 `false` 只会打一条警告并被忽略——任何来源都必须通过口令或配对令牌校验。

## 使用

### 手机扫码（推荐：固定域名）

1. 在 Cloudflare Zero Trust → Tunnel → 你的隧道 → Public Hostname，加一条：
   `https://<你的域名>` → `http://127.0.0.1:3081`（**建议指向回环**，见下方「隧道注意事项」）
2. 点 DSH 侧栏手机图标 → 地址 Tab → ＋ 新增自定义地址 → 填域名 → 保存并使用
3. 切到扫码 Tab，手机扫码 → 直接进入 DSH（配对令牌即凭证，不用再输口令）

之后打开 `https://<你的域名>/` 即可；没有有效凭证时一律 303 到 `/__gw/login`。

### 局域网直连

同一 WiFi 下打开 `http://<本机IP>:3081`，同样需要口令或一次性配对令牌（不再免密）。
设置 Tab 里每行局域网地址都有 打开 / 复制 按钮。

### 访问口令

- 口令只存加盐 scrypt 哈希；改口令会立即让全部会话失效
- 换口令：面板「主口令加固与修改」（可勾选同时撤销全部设备），或终端 `gw.sh password`（交互输入，热加载不需要重启）
- 忘口令：`cd ~/.dsh/gateway && ./gw.sh password`

### 设备按浏览器指纹分组

设置 Tab 的设备卡片会按 **浏览器指纹（同名 + 相同 UA）** 分组，组头直接展示该组出现过的
**IP 来源**（本机 / 局域网 / 组网·代理 / 公网）：同一个手机会同时出现 `192.168.31.193`（家里 WiFi）、
`10.0.111.x`（EasyTier）和公网地址，一眼就能看出它是从哪条路径连进来的。展开组可以看到每台设备的
有效期、创建 IP → 最近 IP，并支持单台 / 整组 / 全部撤销。

### 模型工具

会话里可直接让我操作 `gw_gateway`：
`status` / `start` / `stop` / `restart` / `qr` / `devices` / `revoke`（`id` 或 `all:true`）/ `logs` /
`keys` / `rotate-key` / `remote-list` / `remote-add` / `remote-remove` / `remote-use`。

## 安全模型

**三种凭证，权限不同**

| 凭证 | 怎么来 | 能做什么 |
|---|---|---|
| `gw_session` | `/__gw/login` 输入网关口令（默认 24h，落盘持久化） | 浏览 + **全部管理操作** |
| `gw_device` | 扫码消费一次性配对令牌（默认 365 天，可撤销） | **只读**：浏览 DSH、可登出；管理接口一律 403 `need: session` |
| `x-gw-admin` | `~/.dsh/gateway/.gw_admin`（插件 / `gw.sh` / `gw_gateway` 工具） | 管理，但**只有回环 peer** 能用 |

| 请求 | 条件 | 结果 |
|---|---|---|
| `/__gw/login` | — | 公开：登录页 / 提交口令（三层限流：5 次/客户端、15 次/socket 对端、60 次/10 分钟全局） |
| `/__gw/pair?t=` | 有效的一次性令牌 | 公开消费 → 种设备凭证 → 303 `/` |
| `/__gw/qr` | — | 公开：渲染指定 URL 的二维码 |
| `/__gw/status` | — | 公开只给最小字段（含 `authType` / `canManage` / `buildId`）；会话或内部密钥才给全量 |
| 其它 `/__gw/*`、`/api/*`、页面、WebSocket | 无有效凭证 | 303 → 登录页 / API 401 |
| 任意路径 | `gw_session` 或 `gw_device` | 可浏览（WebSocket 同样校验） |
| 管理接口与 `/api/gw/*` | `gw_session` 或 `x-gw-admin` | 放行；`gw_device` → 403 |
| 改动型管理接口 | **额外要求** `Origin`/`Referer` 与本次请求同源，且带 `x-gw-request: 1` | 否则 403（HTML 表单无法设置自定义头 → 跨站 CSRF 失效） |

- 客户端 IP 只用于展示与审计，**不参与鉴权**；只有 `GW_TRUSTED_PROXIES` 里的 peer 的
  `cf-connecting-ip` / `x-forwarded-for` / `x-real-ip` 会被采信，其余一律忽略。
- 登录限流不只看可伪造的客户端 IP：socket 对端桶与全局限流窗口兜住「每次换 XFF」的尝试。
- 登录/配对成功后跳转 `303 /`，URL 里不会出现任何 token；DSH 访问靠代签 Cookie 完成。
- 登出会同时清掉 `gw_session`、`gw_device` 与 DSH 代签的 `dsh-auth-*`，不留 30 天旁路凭证。
- 畸形 Cookie（非法百分号编码）按未登录处理，不会让网关进程退出；HTTP 与 WebSocket 两条路径都有保护。
- 网关自产页面带 CSP / nosniff / referrer-policy / frame-options；CORS 只反射回环与 `remotes.json` 里的精确 origin。

### 隧道注意事项

如果穿透工具以 **TCP 方式**把公网端口转发到 `127.0.0.1:3081`，或反代不发送任何来源头，
网关无法识别真实客户端 IP——这**不会**造成免密放行（门禁只看凭证），但设备列表里的 IP 会显示
`unknown` 或代理自身的地址。推荐把隧道 ingress 指到 `http://127.0.0.1:3081`（命中可信代理，
`cf-connecting-ip` 生效，设备列表能看到真实公网 IP）。如果 ingress 必须指向本机局域网/组网地址，
把该地址加入 `GW_TRUSTED_PROXIES`（例如 `GW_TRUSTED_PROXIES=127.0.0.1,::1,10.0.111.99`）。

## 自检与验收

```bash
cd ~/.dsh/gateway && node gateway/selftest.mjs   # 或在仓库里 npm test
```

`npm test` 跑三套零依赖自检：

| 套件 | 断言数 | 覆盖 |
|---|---|---|
| `gateway/selftest.mjs` | 50 | 统一门禁、伪造转发头、三层限流、配对令牌重放、设备到期/撤销、会话落盘与跨重启、密钥轮换、设备只读、CSRF 头与同源、畸形 Cookie 不崩、登出清 DSH Cookie、日志 0600、WebSocket 门禁 |
| `test/plugin-selftest.mjs` | 17 | 插件每个 `/api/gw/*` 都带内部密钥、同源 + 自定义头校验、`canManage` 判定 |
| `test/client-render.mjs` | 5 | 三个 Tab 与「扫码设备只读」横幅能正常渲染 |

线上快速验收：

```bash
# 无凭证: 本机回环 / 局域网 / 组网 / 公网 都应被拦
curl -si http://127.0.0.1:3081/__gw/config    # 403
curl -si http://192.168.31.2:3081/__gw/config # 403
curl -si https://<你的域名>/__gw/config        # 403
curl -s  https://<你的域名>/__gw/status        # 只有 {ok,listen,authed}
curl -si https://<你的域名>/                   # 303 -> /__gw/login

# 内部管理密钥仍可管理（只读接口不需要 x-gw-request）
curl -s -H "x-gw-admin: $(cat ~/.dsh/gateway/.gw_admin)" \
     http://127.0.0.1:3081/__gw/admin/keys

# 改动型接口必须带自定义头 + 同源，否则 403
curl -s -X POST -H "x-gw-admin: $(cat ~/.dsh/gateway/.gw_admin)" \
     -H 'x-gw-request: 1' -H 'content-type: application/json' \
     -d '{"deviceTtlDays":365}' http://127.0.0.1:3081/__gw/config

# 设备凭证只读：用扫码得到的 gw_device 访问管理接口应 403
curl -si -H "Cookie: gw_device=<扫码设备 token>" http://127.0.0.1:3081/__gw/devices
```

## 目录结构

```text
dsh-gateway-ctl/
├── package.json        # dsh.bundle.patch + dsh.client 声明 + npm test
├── cordis.patch.yml    # 往 profile 插入 gateway-ctl 行
├── lib/
│   ├── index.js        # Host: gw_gateway 工具 + /api/gw/* 路由 + 内部密钥 + 启动自启 + 部署
│   └── client.js       # Client: 侧栏入口 + 扫码/地址/设置三 Tab（设备指纹分组、密钥卡片）
├── gateway/
│   ├── gateway.mjs     # 独立网关: 统一门禁 + 持久化凭证 + 设备到期 + 三层限流 + CSRF + DSH 代签
│   ├── gw.sh           # 启停 / 口令(热加载+日志脱敏) / 密钥轮换 / 会话撤销 / build id
│   └── selftest.mjs    # 零依赖自检 (50 条断言)
└── test/
    ├── plugin-selftest.mjs  # 插件 Host 路由自检 (内部密钥 + 同源 + canManage)
    └── client-render.mjs    # 面板三 Tab + 只读态渲染自检
```

运行期目录 `~/.dsh/gateway/` 里由插件维护：`gateway.mjs` / `gw.sh`（自动部署）、`config.json`、
`.gw_admin` / `.gw_password` / `sessions.json` / `devices.json`（凭证）、`remotes.json`（地址表）、
`access.log`（审计）、`gateway.pid` / `tunnel.pid`、`plugin.log`（自启诊断）。

## 已知限制

- 本地 DNS 污染环境下 `*.trycloudflare.com` 可能打不开（运营商 SNI 阻断/NXDOMAIN），优先用固定域名
- `198.18.0.1` 这类代理 tun 口地址访问本地网关会被系统网络层吃掉，用 `127.0.0.1` 或 LAN IP
- 自启只在 **DSH 启动时** 发生：整机重启后如果没启动 DSH，网关也不会在跑；要真正做到开机即用，另配 launchd
  LaunchAgent（`dsh web` + `gw.sh start`）或用固定域名 + Cloudflare Tunnel 常驻服务
- 配对二维码本质上是 bearer 链接（一次性、90 秒），截获即用；长期建议再叠 Cloudflare Access
- `GW_BIND=0.0.0.0` 时局域网可达 3081（需要口令）；纯隧道场景可设 `GW_BIND=127.0.0.1`
- 网关自身不提供 TLS：FRP/NATFRP 直接暴露纯 HTTP 端口时，口令与会话 Cookie 会在公网明文传输；
  请用 CF Tunnel / VPS 反代做 TLS 终止，或开启 `GW_REQUIRE_HTTPS=1` 让非回环明文请求直接 426 拒绝
- 扫码设备是**只读**凭证：要在手机上管理网关，请用网关口令登录（`/__gw/login`），而不是扫码
