# dsh-gateway-ctl

DSH（DeepSeek Harness）自研远程网关插件：无需第三方远程插件，即可在外网通过浏览器安全访问家里的 DSH Web GUI。

## 它解决什么问题

DSH 本体只监听 `127.0.0.1:3080`，且自带浏览器信任围栏 + launch token 鉴权——直接把隧道指过去会被 403。`dsh-gateway-ctl` 起一个独立网关进程（默认 `:3081`），对外提供一个统一入口：

- **局域网直连免鉴权**：Host 是 IP 字面量 / localhost 的请求直接透传，打开即用
- **外网域名强制口令登录**：自带登录页 + session cookie，登录成功后自动代签 DSH 自身的浏览器 cookie，一次登录直达桌面
- **扫码远程**：DSH 侧栏手机图标 → 扫码弹框（二维码 / 复制链接 / 地址管理 / 改口令）

## 架构

```text
手机/外网浏览器
    │  https://<你的域名>  (Cloudflare Tunnel / 其他穿透, 你自己在 Dashboard 配)
    ▼
独立网关进程 :3081 (gateway.mjs, 零第三方依赖, 除了二维码 qrcode)
    │  改写 Host/Origin → 127.0.0.1:3080, HTTP + WebSocket 全透传
    ▼
DSH 本体 127.0.0.1:3080 (完全不动)
```

本仓库是 **DSH 插件控制面**（随 DSH 进程加载）：`gw_gateway` 模型工具 + 侧栏扫码 UI + `/api/gw/*` 状态接口。网关本体（`gateway.mjs` / `gw.sh`）是独立进程，见下方安装说明。

## 安装

前置：Node.js 18+、`cloudflared`（Quick Tunnel 用；只用固定域名可不装）、正在跑的 DSH。

```bash
# 1. 装插件包到 DSH profile（link 方式，改代码即生效）
dsh plugin --profile web add link:/path/to/dsh-gateway-ctl

# 2. 放网关脚本（本仓库 gateway/ 目录）到 ~/.dsh/gateway，并装二维码依赖
mkdir -p ~/.dsh/gateway
cp gateway/gateway.mjs gateway/gw.sh ~/.dsh/gateway/
cd ~/.dsh/gateway && npm i qrcode
chmod +x gw.sh

# 3. 启动网关（首次启动会自动生成随机口令，打在 gateway.log 的 FIRST_START_PASSWORD 里）
./gw.sh start

# 4. 重启 DSH Web，侧栏底部会出现手机图标
```

## 使用

### 手机扫码（推荐：固定域名）

1. 在 Cloudflare Zero Trust → Tunnel → 你的隧道 → Public Hostname，加一条：
   `https://<你的域名>` → `http://localhost:3081`
2. 点 DSH 侧栏手机图标 → 地址 Tab → ＋ 新增自定义地址 → 填域名 → 保存并使用
3. 切到扫码 Tab，手机扫码 → 输入网关口令 → 直达 DSH

之后打开 `https://<你的域名>/` 即可（根地址智能入口，未登录自动跳登录页）。

### 临时远程（Quick Tunnel，无需域名）

地址 Tab 里不选自定义地址，点设置 Tab → 启动网关，会自动拉起 `*.trycloudflare.com` 临时隧道；选中自定义地址后它会自动关闭。

### 局域网直连（免口令）

同一 WiFi 下直接开 `http://<本机IP>:3081`，打开即用。设置 Tab 里每行局域网地址都有 打开 / 复制 按钮。

### 访问口令

- 口令只存本机（`0600` 文件，单向 hash + 明文库），DSH 进程、网关进程之外没有任何地方能查到
- 查看：设置 Tab → 访问口令 → 点眼睛（需网关已登录 session，未登录 403）
- 更换：手动改（至少 6 位）或 🎲 随机生成并更换；更换后旧登录全部失效
- 忘口令：本机跑 `./gw.sh password <新口令>` 后重启网关

### 模型工具

会话里可直接让我操作：`gw_gateway`（status / start / stop / restart / qr / remote-list / remote-add / remote-remove / remote-use）。

## 安全模型

| 场景 | 策略 |
|---|---|
| 局域网 IP / localhost | 免网关登录（可信内网），仍代签 DSH 自身 cookie |
| 外网域名 | 必须先过网关口令登录，否则 `/` 303 到登录页、`/api` 401 |
| 取回/随机更换口令 | 必须持有有效网关 session，未登录 403 |
| 二维码内容 | 本质是 bearer 链接，截获即登录——个人自用可接受；长期建议再叠 Cloudflare Access |

## 目录结构

```text
dsh-gateway-ctl/
├── package.json        # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml    # 往 profile 插入 gateway-ctl 行
├── lib/
│   ├── index.js        # Host: gw_gateway 工具 + /api/gw/* 路由 + 地址表 CRUD
│   └── client.js       # Client: 侧栏入口 + 扫码/地址/设置三 Tab 弹框（无构建，直写）
└── gateway/
    ├── gateway.mjs     # 独立网关：反代 + 分流鉴权 + DSH 代签 + 登录页 + 二维码接口
    └── gw.sh           # 启停脚本（按选中地址自动决定起不起 Quick Tunnel）
```

## 已知限制

- 本地 DNS 污染环境下 `*.trycloudflare.com` 可能打不开（运营商 SNI 阻断/NXDOMAIN），优先用固定域名
- `198.18.0.1` 这类代理 tun 口地址访问本地网关会被系统网络层吃掉，用 `127.0.0.1` 或 LAN IP
- 网关/隧道是独立进程，整机重启后需 `gw.sh start`（可自行配 launchd 自启）
