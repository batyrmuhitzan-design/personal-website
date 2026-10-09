# AGENT_GUIDE.md · 个人主页基础设施与 Agent 介入手册

> 面向 **DeepSeek Agent（含 Cline 等自动化编码代理）** 的运行手册。
> 目标：任何代理拿到这个仓库后，不看聊天记录也能完成「改代码 → 部署 → 验证 → 回滚」。
> 最近一次核对：2026-10-06（服务器状态、端口、容器、端点均为当时实测结果）。

---

## 0. 30 秒速查

| 我要做什么 | 命令 |
| --- | --- |
| 看线上站点 | <https://i.1losion.me> |
| 一键部署（推荐） | `bash deploy.sh` （服务器上=本机部署；开发机上=推送+远端部署） |
| 部署（服务器侧等价写法） | `ssh kaznu "cd /opt/personal-website && bash deploy.sh --server"` |
| 环境/链路自检 | `bash scripts/agent-check.sh` |
| 看日志 | `ssh kaznu "cd /opt/personal-website && docker compose logs -f --tail=100"` |
| 重启站点容器 | `ssh kaznu "cd /opt/personal-website && docker compose restart personal-website"` |
| 回滚到上一个镜像 | `ssh kaznu "cd /opt/personal-website && docker tag personal-website:previous personal-website:latest && docker compose up -d --force-recreate"` |
| 服务器资源 | `ssh kaznu "free -m; df -h /"` |

> Windows 开发机上没有把 bash 加进 PATH：脚本用
> `& 'E:\pycham11\Git\bin\bash.exe' deploy.sh`（或直接 `"E:\pycham11\Git\bin\bash.exe" deploy.sh`）执行。
> Git Bash / WSL / 服务器上直接 `bash deploy.sh` 即可。

---

## 1. 机器与网络拓扑

```
                    ┌──────────────────────────── 服务器 74.241.248.9（ssh 别名 kaznu, root）──────────────┐
   公网 HTTPS        │  1Panel OpenResty 容器 1Panel-openresty-HuUs（host 网络，listen 80/443）          │
  i.1losion.me ─────▶│    ├── i.1losion.me      → 127.0.0.1:8881 ─▶ [personal-website] nginx:80 ← 本项目  │
  pay.1losion.me ───▶│    ├── pay.1losion.me    → 127.0.0.1:8882 ─▶ [shasha-faka-web]  (另一个项目)     │
  1losion.me ───────▶│    ├── 1losion.me        → 127.0.0.1:8000 ─▶ uvicorn（另一个项目）                │
  forum.1losion.me ─▶│    └── forum.1losion.me  → 127.0.0.1:4567 ─▶ [kaznu-nodebb-nodebb-1]            │
                    │  1Panel 面板 39888   ·   SSH 22   ·   Docker 29.8.0 + compose v5.5.1             │
                    └────────────────────────────────────────────────────────────────────────────────────┘
   开发机（Windows，仓库路径 E:\个人网）
     ├── 远端 origin = https://github.com/batyrmuhitzan-design/personal-website.git（分支 master）
     └── SSH：~/.ssh/config 的 Host kaznu → IdentityFile ~/.ssh/kaznu_deploy（已免密，BatchMode 可用）
```

服务器规格（实测，务必记住它很小）：

| 项目 | 实测值 | 对 Agent 的影响 |
| --- | --- | --- |
| CPU / 内存 | 2 vCPU / 842MB（可用约 250~290MB） | **禁止并发构建**；前端构建请在 Docker 内串行跑 |
| Swap | 2GB（已用约 1.1GB） | 构建慢是正常的，别误判为卡死 |
| 根分区 | 29GB，已用 68%（可用约 9GB） | 构建缓存涨到可用 < 3GB 时执行 `docker builder prune -f` |
| 已装工具 | docker / docker compose / git 2.43 / bash 5.2 / curl 8.5 | **服务器上没有 node**，不要写依赖 node 的运维脚本 |

---

## 2. 端口与容器总表

| 容器名 | 镜像 | 端口（宿主） | 归属 | 动它的风险 |
| --- | --- | --- | --- | --- |
| `personal-website` | `personal-website:latest` | `0.0.0.0:8881` → 容器 80 | **本项目** | 随便动，`deploy.sh` 负责回滚 |
| `music-api` | `shasha-music-api:latest` | 仅容器内 8080（`expose`） | **本项目** | 随便动，经站点 `/music/api/` 反代 |
| `shasha-faka-web` | `shasha-faka-web:latest` | `127.0.0.1:8882` → 容器 80 | 另一个项目（发卡） | **别动**，改前先问 |
| `shasha-faka-mysql` | `mariadb:11.4` | 仅内网 3306 | 另一个项目 | **别动**，含真实交易数据 |
| `shasha-faka-redis` | `redis:7-alpine` | 仅内网 6379 | 另一个项目 | 别动 |
| `kaznu-nodebb-nodebb-1` | `ghcr.io/nodebb/nodebb:latest` | `127.0.0.1:4567` | 另一个项目（论坛） | 别动 |
| `kaznu-nodebb-redis-1` | `redis:7.4-alpine` | 仅内网 6379 | 另一个项目 | 别动 |
| `1Panel-openresty-HuUs` | `1panel/openresty:1.21.4.3-3-3-focal` | `0.0.0.0:80`、`0.0.0.0:443` | 面板反代 | 只在改域名/反代时才碰，改完必须 `-t` 再 reload |

其它端口：`22` SSH、`39888` 1Panel 面板、`127.0.0.1:8000`（1losion.me 的 Python 服务）。

---

## 3. 反向代理（1Panel OpenResty）怎么改

站点 vhost 与真正的 `proxy_pass` 片段分两处存放，**改错地方不会生效**：

| 内容 | 宿主机路径 | 容器内路径 |
| --- | --- | --- |
| vhost（listen / server_name / ssl / include） | `/opt/1panel/apps/openresty/openresty/conf/conf.d/<domain>.conf` | `/usr/local/openresty/nginx/conf/conf.d/<domain>.conf` |
| 反代片段（真正的 `proxy_pass`） | `/opt/1panel/apps/openresty/openresty/www/sites/<domain>/proxy/*.conf` | `/www/sites/<domain>/proxy/*.conf` |
| 访问/错误日志 | `/opt/1panel/apps/openresty/openresty/log/`（站点日志在 `.../www/sites/<domain>/log/`） | `/var/log/nginx/` |

- OpenResty 容器使用 **host 网络**，因此反代目标是 `127.0.0.1:8881`（而不是容器名）——这是它能访问宿主端口的原因。
- 本站当前反代片段（`.../sites/i.1losion.me/proxy/*.conf`）：`location ^~ / { proxy_pass http://127.0.0.1:8881; ... }`。
- 改完必须校验并热加载：

```bash
ssh kaznu 'docker exec 1Panel-openresty-HuUs openresty -t && docker exec 1Panel-openresty-HuUs openresty -s reload'
```

- 兜底站点 `00.default.conf` 对应 `server_name _`（404 页），不要让它抢到真实域名。

---

## 4. 本项目（personal-website）自身

| 项目 | 位置 / 说明 |
| --- | --- |
| 本地仓库 | `E:\个人网`（分支 `master`，远端 `origin` = GitHub `batyrmuhitzan-design/personal-website`） |
| 服务器副本 | `/opt/personal-website`（`git clone` 自 origin/master，`deploy.sh` 在此执行） |
| 前端 | React 17 + CRA 5（`react-scripts`），构建产物 `build/` |
| 容器编排 | `docker-compose.yml`：`personal-website`（宿主 8881 → 容器 80） + `music-api`（仅内网 8080） |
| 站点 Nginx | `nginx.conf`（容器内 `/etc/nginx/conf.d/default.conf`）：SPA 回退、gzip、静态强缓存、`/music/api/` 反代到 `music-api:8080`、`/healthz` |
| 镜像构建 | `Dockerfile` 多阶段：`node:20-alpine` 里 `npm install --legacy-peer-deps && npm run build` → `nginx:alpine` |
| 音乐解析 | `music-api/`（零第三方依赖的 Node 服务，容器内 8080，经站点 `/music/api/` 访问） |
| 探针 | `GET /healthz` → `ok`；`GET /music/api/health` → `{"ok":true,...}` |

本地开发命令：

```bash
npm install --legacy-peer-deps   # 上游模板有 peer 冲突，必须带这个参数
npm start                        # http://localhost:3000
npm run build                    # 生产构建（CI=true 时 lint 警告会被当错误）
npm test                         # 单元测试
```

> 注意：`.env` 里**不要**放 `PUBLIC_URL` / `PORT` / `HOST` / `CI` 等 CRA 保留变量，
> 否则会被 react-scripts 当成构建配置吃掉（站点域名因此命名为 `SITE_PUBLIC_URL`）。

---

## 5. 数据库与同机其它服务

**本项目自身不使用数据库**（纯静态站点 + 无状态解析服务）。同机其它项目的数据服务如下，
Agent 只读参考，**默认不要修改**：

| 服务 | 容器 / 网络 | 连接串模板 | 真实凭据位置 |
| --- | --- | --- | --- |
| 发卡站 MariaDB | `shasha-faka-mysql` / 网络 `shasha-network` | `mysql://${DB_USERNAME}:${DB_PASSWORD}@shasha-faka-mysql:3306/${DB_DATABASE}` （容器网络内）<br>`mysql -h 127.0.0.1 -P 3306 -u<user> -p` 需先进容器 | `/opt/shasha-faka/.env` 的 `DB_HOST` `DB_PORT` `DB_DATABASE` `DB_USERNAME` `DB_PASSWORD` |
| 发卡站 Redis | `shasha-faka-redis` / `shasha-network` | `redis://shasha-faka-redis:6379/0` | `/opt/shasha-faka/.env` 的 `REDIS_HOST` `REDIS_PORT` `REDIS_PASSWORD` |
| MariaDB root | 同上 | `mysql://root:${MARIADB_ROOT_PASSWORD}@shasha-faka-mysql:3306/` | `/opt/shasha-faka/.env` 的 `MARIADB_ROOT_PASSWORD` |
| 论坛 NodeBB | `kaznu-nodebb-nodebb-1` + `kaznu-nodebb-redis-1` | 内部使用，源码在 `/opt/kaznu11-main` | `/opt/kaznu11-main` 下 |

- 默认库名/用户名来自 `docker-compose.yml` 的兜底值（`shasha_faka` / `shasha`），**真实口令一律以服务器上的 `.env` 为准**。
- 需要真实值时才在服务器上查（口令会打印到终端，别贴进聊天/日志/提交）：

```bash
ssh kaznu "grep -E '^(DB_|REDIS_|MARIADB_)' /opt/shasha-faka/.env"
```

- 发卡站的 compose 把 `./.env` 挂进容器（`/app/.env`），改数据库配置要改宿主机的 `/opt/shasha-faka/.env` 并 `docker compose up -d`。

---

## 6. Agent 环境变量

两个文件分工明确：

| 文件 | 是否入库 | 内容 |
| --- | --- | --- |
| `.env` | **不入库**（`.gitignore` 第 16 行已忽略） | 真实密钥与服务器参数，本机专用 |
| `.env.example` | 入库 | 只有键名、占位符与注释，供新机器复制 |

变量清单（完整注释见 `.env.example`）：

| 变量 | 作用 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek 官方 key（来自本机 `~/.cline/data/secrets.json` 的 `deepSeekApiKey`） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` / `DEEPSEEK_REASONER_MODEL` | `deepseek-chat` / `deepseek-reasoner` |
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM key（`secrets.json` 的 `openAiApiKey`） |
| `NVIDIA_NIM_BASE_URL` | `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_NIM_MODEL` | `deepseek-ai/deepseek-v4-pro`（128k 输入） |
| `AGENT_SSH_HOST` / `AGENT_SERVER_IP` | `kaznu` / `74.241.248.9` |
| `AGENT_SSH_KEY` | `~/.ssh/kaznu_deploy` |
| `AGENT_REMOTE_DIR` / `AGENT_GIT_BRANCH` | `/opt/personal-website` / `master` |
| `SITE_PUBLIC_URL` / `AGENT_LOCAL_PORT` | `https://i.1losion.me` / `8881` |
| `AGENT_HEALTH_TIMEOUT` | 健康检查超时秒数（默认 120） |

**三条硬规矩**（评审时也会按这三条检查）：

1. 密钥只写 `.env`，绝不写进 `.env.example`、`AGENT_GUIDE.md`、代码、日志或提交信息；
2. 不要给密钥加 `REACT_APP_` 前缀——CRA 会把 `REACT_APP_*` 打进前端产物，等于公开密钥；
3. `.dockerignore` 已排除 `.env`，所以密钥不会被 `COPY . .` 带进镜像构建上下文；改 `.dockerignore` 时别删这条。

---

## 7. DeepSeek Agent 接入配置（实测结果）

| 端点 | Base URL | 模型 | 实测（2026-10-06） |
| --- | --- | --- | --- |
| DeepSeek 官方（主） | `https://api.deepseek.com`（OpenAI 兼容，可带 `/v1`） | `deepseek-chat`（通用）、`deepseek-reasoner`（推理） | `GET /models` → 200，返回 `deepseek-flash`、`deepseek-v4-pro`；`POST /chat/completions`（`deepseek-chat`）→ 200 |
| NVIDIA NIM（备） | `https://integrate.api.nvidia.com/v1` | `deepseek-ai/deepseek-v4-pro`（128k 输入） | `GET /models` → 200，列表含 `deepseek-ai/*` 系列 |

在 Cline / DeepSeek Agent 里切换端点时填三样：**Provider**（OpenAI Compatible）、**Base URL**、**API Key**，
模型 ID 用上表的值；密钥从 `.env` 取，别手打。

手工验证（不回显完整 key）：

```bash
# 用 .env 里的 key 打一次 /models（只打印状态码与模型名，不打印密钥）
curl -s -o /tmp/m.json -w '%{http_code}\n' https://api.deepseek.com/models \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" && cat /tmp/m.json
```

更省事：`bash scripts/agent-check.sh` 会把「DeepSeek 端点 + NIM 端点 + 模型可用性」一起验完。

---

## 8. SSH 免密与远程工具

`~/.ssh/config` 已有别名（**Agent 一律用别名，不要写 IP 直连**）：

```sshconfig
Host kaznu
    HostName 74.241.248.9
    User root
    IdentityFile ~/.ssh/kaznu_deploy
    IdentitiesOnly yes
    ServerAliveInterval 30
    StrictHostKeyChecking accept-new
```

自检与常用远程命令：

```bash
ssh -o BatchMode=yes kaznu 'echo SSH_OK'            # 免密自检（不应索要密码）
ssh kaznu "docker ps --format '{{.Names}}|{{.Status}}'"
ssh kaznu "cd /opt/personal-website && docker compose logs --tail=120 personal-website"
ssh kaznu "curl -s http://127.0.0.1:8881/healthz"   # 服务器本机探针
```

注意：

- Windows 上私钥权限过宽时 OpenSSH 会拒绝使用；本项目当前可用（`BatchMode` 实测通过），换机器时若报 `UNPROTECTED PRIVATE KEY FILE`，用 `icacls` 收紧权限；
- 不要开 SSH Agent 转发（`-A`）给不可信主机；
- 私钥、`known_hosts` 都不入库；`.gitignore` 里没有任何密钥路径，所以**不要**把密钥复制进仓库目录。

---

## 9. 部署流程

### 9.1 一键脚本 `deploy.sh`

```bash
bash deploy.sh                       # 自动判断模式（推荐）
bash deploy.sh --local               # 强制：本机 push → scp 脚本 → SSH 触发服务器部署
bash deploy.sh --server              # 强制：只在服务器上执行（需在 /opt/personal-website）
bash deploy.sh --local --allow-dirty  # 工作区有未提交改动时（上线不含这些改动）
bash deploy.sh --local --no-push      # 不推送，由服务器自行 fetch origin
bash deploy.sh --timeout 180          # 健康检查超时（默认 120s）
bash deploy.sh --no-rollback          # 失败不回滚（排障用）
```

服务器模式执行链路：**预检+备份现镜像 → `git fetch` + `git reset --hard origin/master` → `docker compose build` → `docker compose up -d` → 容器 health + `/healthz` + `/music/api/health` → 成功打印摘要 / 失败自动回滚**。

> 实测耗时（2026-10-06）：`docker compose build` 在这台 842MB 内存的机器上约 **7 分钟**
> （`npm run build` 阶段完全靠 swap 撑着），整条链路约 8~10 分钟。
> 日志长时间停在 `#20 ... npm run build` 属正常现象，**别误判为卡死**；
> `--timeout` 只作用于健康检查等待，不会掐断构建。
>
> ⚠️ **2026-10-09 实测：这条链路会失败。** 构建进程在
> `Creating an optimized production build...` 之后 27 分钟没有任何新输出，最后被内核 OOM
> 杀掉（`docker images` 里 `personal-website:latest` 的 ID 与 `:previous` 完全相同），
> 而 `deploy.sh` 仍打印了「✓ 远端部署流程结束」，很容易误判成「已上线」。
> 判定方法：**看镜像 ID 变没变**，别只看脚本退出的那行字。
> 遇到这种情况直接改用下面 **9.3** 的方案。


本地模式的四道保护：

1. 工作区有未提交改动 → 默认**拒绝部署**（避免“以为上线了其实线上还是旧代码”）；
2. `git push origin HEAD:master` 失败（凭证/远端领先）→ 立即中止；
3. 本地脚本 `scp` 到 `/tmp` 后 **`tr -d '\r'` 去掉 CRLF** 再执行（Windows 保存的脚本在 Linux 上会因 `$'\r'` 报错）；
4. 远端退出码原样带回本地，非 0 即失败，临时脚本无论成败都会清理。

### 9.2 手工等价命令（脚本坏掉时的保底手法）

```bash
# 1) 本地：提交并推送
git add -A && git commit -m "..." && git push origin master

# 2) 服务器：同步代码
ssh kaznu "cd /opt/personal-website && git fetch --prune origin && git reset --hard origin/master"

# 3) 服务器：构建并启动（这台 842MB 内存的机器请串行执行）
ssh kaznu "cd /opt/personal-website && docker compose build && docker compose up -d"

# 4) 服务器：验证
ssh kaznu "curl -s http://127.0.0.1:8881/healthz; curl -s http://127.0.0.1:8881/music/api/health"
```

### 9.3 服务器内存不够时的保底方案：本机编译 + 服务器只打 nginx 镜像

**什么时候用它**：`docker compose build` 卡住太久、或上面 9.1 的告警成立（镜像 ID 没变）。
这台机器 837MB 内存 + 2GB swap，剩余内存会被同机的 nodebb / mariadb / 1faka 吃掉，
能不能编译过并不稳定；把编译搬到开发机后就只剩「nginx + 静态文件」这一层，
打包 3~5 秒完成、几乎不吃内存。

```bash
# 本机（Git Bash / WSL）：编译 → 推送 → 上传产物 → 服务器打包切换（带产物自检与失败回滚）
bash scripts/deploy-prebuilt.sh

bash scripts/deploy-prebuilt.sh --no-build   # 复用现有 build/，跳过本机编译
bash scripts/deploy-prebuilt.sh --rollback   # 回滚：把 :previous 镜像换回 :latest 并重建容器
```

> 本机 `bash` **不在 PATH 里**（`where bash` 找不到，也没有 WSL），实际路径是
> `E:\pycham11\Git\bin\bash.exe`（PyCharm 自带的 Git for Windows）。
> 从 PowerShell 调用要写全路径：
> `& 'E:\pycham11\Git\bin\bash.exe' 'E:/个人网/scripts/deploy-prebuilt.sh'`

```powershell
# 没装 bash 时（纯 PowerShell 等价流程，2026-10-09 验证通过）
cd E:\个人网
$env:CI='true'; $env:GENERATE_SOURCEMAP='false'; $env:NODE_OPTIONS='--max-old-space-size=4096'
npm run build                                  # 约 1 分钟
git add -A; git commit -m "..."; git push origin master   # Dockerfile.prebuilt 必须先到远端

Remove-Item prebuilt -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory prebuilt | Out-Null
Copy-Item build\* prebuilt -Recurse -Force
tar -czf "$env:TEMP\prebuilt.tar.gz" -C . prebuilt
scp "$env:TEMP\prebuilt.tar.gz" kaznu:/tmp/pw-prebuilt-upload.tar.gz

ssh kaznu "cd /opt/personal-website && git fetch --prune origin && git reset --hard origin/master \
  && docker tag personal-website:latest personal-website:previous \
  && rm -rf prebuilt && mkdir prebuilt && tar -xzf /tmp/pw-prebuilt-upload.tar.gz -C . \
  && docker build -f Dockerfile.prebuilt -t personal-website:latest . \
  && docker compose up -d --force-recreate personal-website"
```

要点：

- `prebuilt/` 已在 `.gitignore` 里：不入库，服务器上 `git reset --hard` 也不会删它；
- **先 push 再让服务器 reset**，否则服务器上可能没有 `Dockerfile.prebuilt`；
- 切换前会自动 `docker tag personal-website:latest personal-website:previous`，回滚只换标签即可；
- 验收标准：`docker images` 里 `latest` 的 ID 变了 + 容器 `(healthy)` +
  首页 HTML 引用的 `main.<hash>.js/css` 与 `prebuilt/static/**` 里的文件名一致。


---

## 10. 验证命令清单

```bash
# 一把梭全量自检（本机 .env + DeepSeek/NIM 端点 + SSH + 容器 + 站点 + 线上版本比对）
bash scripts/agent-check.sh

# 离线时只查本机（不碰服务器、不调 API）
bash scripts/agent-check.sh --local

# 各单项
curl -s -o /dev/null -w '%{http_code}\n' https://i.1losion.me/healthz        # 期望 200
curl -s https://i.1losion.me/music/api/health                                # 期望 {"ok":true,...}
ssh kaznu "docker ps --filter name=personal-website --format '{{.Status}}'"  # 期望 Up ... (healthy)
ssh kaznu "cd /opt/personal-website && git --no-pager log --oneline -1"      # 线上版本
df -h / >/dev/null; ssh kaznu "free -m; df -h /"                             # 资源
```

自检脚本的判定：`[FAIL]` 会拉高退出码（→ 1），`[WARN]` 只是提醒（内存/磁盘偏低、线上版本与本地 build 不一致等）。
Windows 控制台若是 GBK，中文可能显示成乱码，先 `chcp 65001` 即正常；**脚本逻辑与退出码不受影响**。

---

## 11. 回滚与故障排查

| 症状 | 先做什么 | 说明 |
| --- | --- | --- |
| 部署后页面 502 | `ssh kaznu "cd /opt/personal-website && docker compose logs --tail=100 personal-website"` | 多数是构建失败/容器没起来；OpenResty 反代没问题（它只是转发 8881） |
| 容器 `unhealthy` | `docker inspect --format '{{json .State.Health}}' personal-website` | 健康检查打的是 `wget --spider http://127.0.0.1/`，失败通常是 nginx 配置写错 |
| 音乐播放不了 | `docker compose logs --tail=100 music-api`，并直接 `curl 127.0.0.1:8881/music/api/health` | 上游音源站点限流也会导致 5xx |
| 构建 OOM / 卡住 | 串行构建；`docker builder prune -f` 后再试 | 只有 842MB 内存，别并发构建 |
| 磁盘将满 | `docker builder prune -f`，必要时 `docker image prune -f` | 根分区 29GB，构建缓存是最大占用方 |
| 想回滚上一版镜像 | `docker tag personal-website:previous personal-website:latest && docker compose up -d --force-recreate` | `deploy.sh` 每次部署前都会刷新 `personal-website:previous` |
| 想回滚代码 | `cd /opt/personal-website && git reset --hard <旧 sha> && docker compose up -d --build` | 旧 sha 用 `git log --oneline` 找 |

改反代（域名、路径）后必须：`docker exec 1Panel-openresty-HuUs openresty -t && docker exec 1Panel-openresty-HuUs openresty -s reload`。

---

## 12. 安全红线（Agent 必须遵守）

1. **不提交密钥**：`.env` 只在本地；任何时候不要把 key 写进 `AGENT_GUIDE.md`、`.env.example`、源码、`git commit -m` 或 PR 描述。
2. **不动别人**：`shasha-faka-*`、`kaznu-nodebb-*`、`1losion.me` 的 uvicorn 都属于别的项目；涉及它们的改动先确认再说。
3. **不删数据**：禁止 `docker compose down -v`、`docker volume rm`、`docker system prune -a`（会连别人的镜像/数据卷一起清掉，其中 `shasha_mysql_data` 是真实交易数据）。
4. **不改端口映射**：`8881`（本站）、`8882`（发卡）都是公网反代的落点；新增端口前先确认防火墙与 1Panel 配置。
5. **不绕过验证**：部署后必须跑 `bash scripts/agent-check.sh`；`[FAIL]` 未清零不得宣称完成。
6. **不在服务器上装重型工具链**：没有 node、内存也放不下；前端构建交给 Docker，运维脚本用 bash + curl。

---

## 13. 本次新增 / 相关文件

| 文件 | 作用 | 是否入库 |
| --- | --- | --- |
| `AGENT_GUIDE.md` | 就是本文件：Agent 介入手册 | ✅ |
| `deploy.sh` | 一键部署（服务器模式 + 本地模式 + 健康检查 + 自动回滚），LF 行尾 | ✅ |
| `scripts/agent-check.sh` | 环境/链路自检（纯 bash + curl + ssh） | ✅ |
| `.env.example` | 环境变量模板（只有键名与注释） | ✅ |
| `.env` | 真实密钥与服务器参数 | ❌（`.gitignore` 已忽略） |
| `.gitattributes` | 强制 `*.sh` / `*.mjs` 用 LF，避免 Linux 上因 CRLF 报错 | ✅ |
| `.editorconfig` | 约束编辑器默认行尾（源码 CRLF、脚本 LF） | ✅ |
| `docker-compose.yml` / `Dockerfile` / `nginx.conf` | 站点编排、镜像、站点 Nginx（原有文件） | ✅ |
| `music-api/` | 音乐解析服务（原有） | ✅ |
| `src/theme/tokens.css` | 设计令牌：全站唯一色彩来源（HTML 黑白双主题） | ✅ |
| `src/theme/ThemeContext.tsx` | 主题上下文：持久化 / 跟随系统 / 过渡窗口 | ✅ |
| `src/components/Header.tsx` · `ThemeToggle.tsx` | 极简顶部导航 + 日夜切换（取代旧 `Navbar.js`） | ✅ |
| `src/lib/pixelArt.ts` · `src/components/CursorSprite.tsx` · `cursorStyles.ts` | 像素画工具 + 10 位角色 / 像素箭头 + 运行时注入的光标样式（详见 §15） | ✅ |
| `src/components/SplitText.tsx` | 逐字 / 逐词入场 + 黑白高亮扫过（Hero 标题 / 签名，详见 §15.4） | ✅ |
| `src/components/MusicBrandIcon.tsx` | 音乐频道品牌图标 + `brandKeyOf` 判定（详见 §16.4） | ✅ |
| `scripts/slim-server.sh` | 小内存服务器瘦身（默认只体检，`--apply` 才动手） | ✅ |
| `Dockerfile.prebuilt` | 预构建产物镜像：nginx + 静态文件，服务器不编译（小内存专用，见 9.3） | ✅ |
| `scripts/deploy-prebuilt.sh` | 本机编译 → 服务器只打 nginx 镜像（含产物自检、健康检查、`:previous` 回滚） | ✅ |
| `prebuilt/` | 部署时上传的编译产物（`Dockerfile.prebuilt` 的上下文） | ❌（`.gitignore` 已忽略） |

---

## 14. 前端主题系统（丝滑黑白双主题）

一句话：**颜色只认 CSS 变量**，主题只改 `<html data-theme="light|dark">`。

### 14.1 文件分工

| 文件 | 职责 |
| --- | --- |
| `src/theme/tokens.css` | 唯一色彩来源。核心五色（`--bg-primary` / `--text-primary` / `--text-secondary` / `--border-color` / `--card-bg`）+ 派生语义色 + 黑胶物件色 |
| `src/theme/ThemeContext.tsx` | `ThemeProvider` / `useTheme`；localStorage 持久化（键 `shasha-theme`）、首次访问跟随系统、多标签页同步、换肤过渡窗口、尊重 `prefers-reduced-motion` |
| `src/index.css` | 引入令牌、基底样式、`.theme-switching` 过渡窗口、`.monogram` 字章、`.focus-ring` 焦点兜底、选中态与滚动条 |
| `public/index.html` | 内联防闪脚本：首帧之前写好 `data-theme`（与 `resolveInitialTheme()` 同逻辑） |
| `src/components/Header.tsx` · `ThemeToggle.tsx` | 顶部导航（品牌字章 + 中英双语导航 + 滚动毛玻璃 + layoutId 下划线）与日月胶囊开关 |
| `tailwind.config.js` | `surface / elevated / ink / hairline / accent` 语义色（值 = CSS 变量），新组件可继续用 Tailwind 写 |

### 14.2 加新颜色 / 改配色

1. 在 `tokens.css` 的 `:root,[data-theme="light"]` 与 `[data-theme="dark"]` 里**各加一份**同名变量（两个主题都要有，缺一个会在另一主题下回落成非法值）；
2. 组件里只用 `var(--your-token)`；Tailwind 里想用就再往 `tailwind.config.js` 的 `colors` 加一行映射；
3. 不要在任何组件里写死色值 —— 写死了就不会跟着换肤。

### 14.3 三个坑（改之前先看）

1. **过渡窗口**：换肤的「丝滑」靠 `<html class="theme-switching">`，它只在切换后的 600ms 内存在，并用 `!important` 覆盖全树的 `transition`。**不要在窗口期内依赖 CSS transition 做关键动画**（framer-motion 的逐帧内联动画不受影响，这也是切换按钮用 framer-motion 而不是 CSS 过渡的原因）。
2. **老样式表**：`src/style.css` 是上游模板遗留 + 二改定制的混合体（1835 行），已经全量令牌化（207 处），但里面仍保留 `!important` 与 `rgba(0,0,0,x)` 阴影之类「与主题无关」的写法。**改它时优先复用令牌**，不要再引入紫色系（上游强调色 `#c770f0` 已统一映射到 `var(--accent)`；并在「全面黑白化」中把 `src/Assets/**/*.svg`、`public/favicon.svg`、`public/og-cover.svg`、MusicPlayer 的 APlayer 主题色与 `manifest.json` 的 `theme_color` 也全部改成灰阶）。
3. **首页区块的层叠（白屏元凶）**：`.home-section` 的 `z-index` 必须是 `0`，**绝不能是负数** —— 负值会把整个 Hero 丢进根层叠上下文的「负层」，绘制顺序排在 `<body>` 背景之前，于是正文被 body 的 `background-color` 整块盖住 = **首页白屏**（只有 `fixed` 的 Header / 音乐播放器 / 自定义光标还看得见）。配套约定：`#tsparticles` 固定为 `z-index:0; pointer-events:none`（粒子只做背景、不拦截点击），`.home-content` 抬到 `position:relative; z-index:1`。
4. **行尾**：`src/**` 是 CRLF（见 `.editorconfig`），`*.sh`/`*.mjs` 是 LF（见 `.gitattributes`）。用 Node 脚本批量改 `style.css` 时务必按文件原有行尾写回，否则会产生整文件 diff。

### 14.4 验证

```bash
npm test -- --watchAll=false   # 13 套件 / 82 用例（含主题持久化、过渡窗口、动效体系、光标皮肤、播放器控制条）
npm run build                  # 生产构建（CI=true 时 lint 警告会被当错误）
# 构建产物自检：令牌与工具类是否真的进包
grep -c -- '--bg-primary' build/static/css/*.css
```

---

## 15. 前端动效体系（光标 / 平滑滚动 / 入场 / 视差 / 无缝切页）

一句话：**所有「装饰性动效」只认一个开关 `--motion-play-state`**（定义在 `src/index.css` 的 `:root`，默认 `running`）。

### 15.1 文件分工

| 文件 | 职责 |
| --- | --- |
| `src/index.css` | 定义总开关 `--motion-play-state`（含说明与「跟随系统」的注释段）；`.reveal` / `.parallax-layer` / `.page-transition` / `.route-curtain` 的静态样式 |
| `src/lib/useMotionPlayState.ts` | 读总开关：`useMotionPlayState()`（`"running"` / `"paused"`）与 `useMotionPlaying()`（布尔）；拿不到时按 `running` |
| `src/components/SmoothScroll.tsx` | Lenis 平滑滚动，参数读 `portfolio.config.motion.lenis`；导出 `getLenis()` / `scrollToTop()` |
| `src/components/Reveal.tsx` | 滚动入场：`<Reveal direction delay distance as>`，`whileInView` 只播一次 |
| `src/components/SplitText.tsx` | 逐字 / 逐词入场 + 黑白高亮扫过：`<SplitText text by delay stagger highlight>`（Hero 标题 / 签名在用） |
| `src/components/Parallax.tsx` | 视差层：`<Parallax speed>`，`useScroll + useSpring + useTransform`（只改 transform） |
| `src/components/PageTransition.tsx` | `PageTransition`（页面转场外壳，配合 `AnimatePresence exitBeforeEnter`）+ `RouteCurtain`（整屏遮罩扫过） |
| `src/components/CustomCursor.tsx` | 自定义光标主体：像素箭头 + 像素小人（**位置零弹簧、1:1 跟手**），配置读 `portfolio.config.cursor` |
| `src/components/CursorSprite.tsx` · `CursorCartoon.tsx` | 三种来源：`PixelArrow`（像素箭头）/ `PixelCharacter`（10 位内置角色之一）/ `SpriteImage`（站长自己的 PNG / GIF / SVG）；`CursorCartoon` = 手绘小人皮肤 |
| `src/lib/pixelArt.ts` | 像素矩阵 → SVG 矩形（run-length 合并）；`PIXEL_CHARACTERS`（10 位角色）+ `PIXEL_ARROW`（11×15，尖端在 (0,0)）+ `findCharacter` / `pickRandomCharacter`；颜色只走 CSS 变量，主题自动反相 |
| `src/components/cursorStyles.ts` | 运行时注入的 CSS（彻底隐藏系统光标 + 箭头 / 竖线 / 皮肤动画），卸载时完整移除 |

### 15.2 总开关：`--motion-play-state`

| 取值 | 含义 |
| --- | --- |
| `running` | **当前选择**：唱片自转 / 光标呼吸 / Lenis 接管 / 入场与视差 / 切页遮罩全部播放 |
| `paused` | 跟随系统「减弱动态效果」：把 `src/index.css` 里那段 `@media (prefers-reduced-motion: reduce)` 的注释打开即可（**改一处，无需动任何组件**） |

**为什么不直接跟系统**：本机 Windows 的「动画效果」是关闭的（`SPI_GETCLIENTAREAANIMATION = False`、`MinAnimate = 0`），Chrome 会一直上报 `prefers-reduced-motion: reduce`，跟随系统 = 全站动效永久静止。所以裁决权收在站点自己手里。

三条边界（与 `index.css` 注释一致）：

1. 只影响**装饰性**动效，不影响播放逻辑与信息表达（音乐照播、歌单照能滚）；
2. 置为 `paused` 时：`Reveal` 退化成普通 `div`（`data-reveal="paused"`）、`Parallax` 不挂 `y`、`RouteCurtain` 完全不出现 —— **关动效 ≠ 丢内容**；
3. 换肤过渡（`html.theme-switching`）仍尊重系统设置，见 `index.css` 里那段 `@media`。

组件侧的正确读法：React 里用 `useMotionPlaying()`；CSS 里用 `animation-play-state: var(--motion-play-state)`。**不要各写一份 `matchMedia`**（现在全站已经收敛成一处）。

### 15.3 换光标皮肤 / 用自己的图

全在 `src/portfolio.config.js` 的 `cursor` 块里改：

| 字段 | 说明 |
| --- | --- |
| `skin` | `"pixel"`（默认，内置「像素箭头 + 像素小人」）/ `"cartoon"`（手绘矢量小人，会眨眼 / 挥手），其余写法一律回落成 `pixel` |
| `randomSkin` | `true`（默认）= 每次刷新从 10 位内置角色里随机抽一位（挂载时抽一次，同一次访问内稳定） |
| `character` | 角色 id 或序号（见 `src/lib/pixelArt.ts` 的 `PIXEL_CHARACTERS`）。留空 = 跟随 `randomSkin`；填了就以它为准（截图 / 视觉回归用）。写错时静默回落，`portfolio.config.test.js` 会拦住 |
| `spriteUrl` | 填自己的图案就整体替换：支持 PNG / GIF / SVG。图片放 `public/` 就写 `"/cursor.png"`（**文件名别用中文**）；留空 = 用内置像素小人（填了它 `randomSkin` 不生效） |
| `spriteWidth` | 精灵显示宽度（px），高度按图案比例自动算（内置图案是 12:16），默认 30 |
| `tilt` | 悬停到可点击元素（`a[href]` / `button` / `[role="option"]` / `[data-cursor="pointer"]` …）时的旋转角度（deg），`0` = 只放大不旋转 |
| `enabled` | `false` = 整体关掉，回到系统光标 |

补充约定：

- **原生光标是彻底隐藏的**（`cursor: none !important` 连 `*::before` / `*::after` 一起，输入框也不例外）：不再有「交还系统光标」那套逻辑，否则同一坐标会同时出现两个光标；
- 输入框 / `textarea` / `[contenteditable]` / `[data-cursor="text"]` 上改由 **像素竖线** 提示插入点（`.cur--text`，箭头淡出、竖线接管），保留「这里能打字」的心理暗示；
- 想给某个可点击元素加悬停气泡，写 `data-cursor-text="打开项目"`；
- 触屏 / 不支持 hover 的设备**完全不渲染光标**（保留系统原生手感、也不注入任何样式）；
- 改内置像素图案：在 `src/lib/pixelArt.ts` 的 `PIXEL_CHARACTERS` 里加 / 改角色（**统一 12×16** 字符矩阵：`.` 透明 / `o` 描边 / `f` 填充 / `m` 装饰 / `g` 发光）。矩阵不等宽、出现未知字符、或漏掉某种角色，`src/lib/pixelArt.test.js` 会拦住；
- 颜色别写死：只改组件级变量 `--cur-px-line` / `--cur-px-face` / `--cur-px-mark` / `--cur-px-glow`（默认分别取 `--text-primary` / `--bg-primary` / `--accent` / `--text-secondary`），这样深浅主题自动反相、悬停反相也只是一改变量。

### 15.4 加一处入场 / 视差 / 新页面

```jsx
<Reveal direction="up" delay={0.12} as="li">…</Reveal>        // 列表项：as 换标签，别多套一层
<Parallax speed={28} className="parallax-fill">…</Parallax>   // 视差层：speed 正 = 向上漂（看起来更慢）
<SplitText as="h1" text="Hi There!" by="word" stagger={0.07} />          // 逐词入场 + 高亮扫过
<SplitText text="I'M 莎莎 SHASHA" highlight="莎莎 SHASHA" charClassName="main-name" />  // 命中片段挂高亮类
```

- 风格统一是「淡入 + 24px 上移 + 0.7s expo-out」；列表按 `index * 0.08` 依次浮现。**别再往里塞弹跳 / 旋转**，那是廉价感的来源；
- `SplitText` 只接**纯文本字符串**（拆完再拼回去必须和原文一模一样）；长句用 `by="word"`（省一半节点），短标题用 `by="char"`；
- `SplitText` 的高亮扫过是「白色光带 + `mix-blend-mode: difference`」：经过之处黑白互换，所以深浅主题都不用另配颜色。`.split-text` 上的 `isolation: isolate` 不能删（否则会把整块背景一起反相）；
- `Reveal` 内部是 `whileInView`（IntersectionObserver）只播一次，元素一进视口就到位；
- `Parallax` 的 `className` 常常是必要的（例如 `parallax-fill`）：`img { width: 100% }` 需要一个百分比参照，多出来的一层 div 不加 `position: relative` 会把图弄塌；
- `SkillSection` 自带滚动驱动动画（`data-motion`），**不要**再套 `Reveal` / `Parallax`（两套动画会互相盖，见 `Home.js` 里的注释）；
- 新加页面时必须包在 `<PageTransition>` 里，并挂在 `App.js` 的 `<Routes location={location} key={location.pathname}>` 下：`key` 换掉子树、`AnimatePresence exitBeforeEnter` 留住旧页播完 exit（升到 framer-motion v7 需把 `exitBeforeEnter` 改成 `mode="wait"`）；
- 真正**无缝**的关键是 `RouteCurtain`：新页在「遮罩盖住」的那一小段里完成挂载，观感是「旧页退场 → 遮罩扫过 → 新页已就位」，全程无白闪。遮罩 `pointer-events: none`（绝不吃点击）且用 `createPortal` 挂到 `body`（不受祖先 `transform` 影响）。

### 15.5 验证

```bash
npm test -- --watchAll=false    # 15 套件 / 114 用例（含 Reveal / SplitText / Parallax / PageTransition / pixelArt / 光标皮肤 / 播放器 / 品牌图标）
npx tsc --noEmit                # 动效组件是 TS，类型必须干净（0 输出 = 通过）
npm run build                   # 生产构建（CI=true 时 lint 警告会被当错误）
```

浏览器手查清单（改完动效必走一遍）：

1. **光标**：鼠标动一格箭头与小人就动一格（位置零弹簧，都咬住坐标）；悬停按钮 → 放大 + 轻微旋转 + 箭头反相 + 气泡；按下 → 缩一下并像素位移一格；移进输入框 → 箭头换成会闪的像素竖线；F12 里 `document.documentElement` 应带 `has-custom-cursor`，刷新几次应能看到不同角色。
2. **平滑滚动**：滚轮一格一格跳 = Lenis 没接管（先查 `--motion-play-state` 是否 `running`、浏览器是否有 `ResizeObserver`）；滚到页面顶部 / 底部不应再有「顿一下」（靠 `overscroll-behavior-y: none`）；播放器歌单内滚动应仍是原生（靠 `data-lenis-prevent`）。
3. **切页**：旧页淡出 → 遮罩自下而上扫过 → 新页就位，全程无白闪；首屏不扫（首屏入场交给 `LoadingScreen`）；点当前路由不扫（`seen.current === pathname` 直接 return）。
4. **静音回归**：把 `--motion-play-state` 临时改成 `paused` 再走 1~3 步 —— 光标仍在、内容完整、只是不动；遮罩与视差位移都不出现；Hero 标题不再拆字（`data-split="paused"`）。

### 15.6 坑（改之前先看）

1. **别把动效开关写进 `portfolio.config.js`**：配置里只有 `motion.lenis` 参数（`portfolio.config.test.js` 会断言这一点），开关统一走 CSS 变量 —— 否则「关动效」要改两处。
2. **`paused` 绝不能藏内容**：新写动画沿用「暂停时用终止状态渲染（`initial={false}`）」的做法，永远不要让内容停在 `opacity: 0` 或位移里。`Reveal` / `SplitText` / `Parallax` / `PageTransition` 都已经遵守。
3. **Lenis 改的是真实滚动位置**（`window.scrollY`），所以 `useScroll` / `useTransform` 量到的进度始终准确。哪天换成「给内容容器套 transform」的平滑滚动方案，`Parallax` 与 `SkillSection` 的滚动测量会立刻失准。
4. **jsdom 里的 `IntersectionObserver` 是 `setupTests.js` 的空实现**（只注册回调、不触发），所以 `whileInView` 在测试里永远停在初始态：**别断言「元素最终可见」**，要断言结构 / 标记（`data-reveal` / `data-split` / `data-parallax` / `data-route-curtain`）以及 `paused` 分支。
5. **光标与遮罩都用 `createPortal` 挂 `document.body`**：祖先的 `transform` / `filter` / `backdrop-filter` 会让 `position: fixed` 失效或把绘制限制在局部层里；改这两处时别顺手挪回组件树里。
6. **`will-change` 只加在 `.reveal` / `.split-text__unit` 这类小元素本身**：别写 `*` 或给父级批量提升，元素一多滚动反而更卡。
7. **`RouteCurtain` 的 `key={sweep}` 不能删**：这是「连续切页时遮罩能重播」的唯一依据（同一个 motion 元素不会重播已有动画）。
8. **光标位置是「零弹簧」的，别再加回去**：`figureX/figureY` 直接吃 `pointerX/pointerY`（只有 scale / rotate / opacity 走弹簧）。加回弹簧 = 鼠标停下后小人还在追，主观感受就是「不跟手」。
9. **`.split-text` 的 `isolation: isolate` 不能删**：高亮扫过靠 `mix-blend-mode: difference`，没有独立混合上下文就会把整块背景一起反相。




---

## 16. 悬浮音乐播放器（APlayer 发动机 + 自绘控制条）

播放器仍然是**单文件组件** `src/components/MusicPlayer.js`，音频 / 歌单 / 歌词 / 解析链路完全交给 APlayer，
但**界面壳子全部自己画**：APlayer 自带的那条原生控制条已经整条 `display: none`（见下），
换成面板里的 `.mp-controls`。这样黑白主题、图标、对齐都只由我们自己的令牌与 flex 决定。

### 16.1 尺寸（改大小只动两个变量）

| 变量 / 位置 | 现值 | 说明 |
| --- | --- | --- |
| `--mp-panel-width`（`.music-player`） | `264px` | 面板宽度（改造前 372px）；标题栏 / 唱机 / 控制条宽度都跟着它 |
| `--mp-disc`（`.mp-stage`） | `104px` | 唱片直径（改造前 144px） |
| `--mp-disc-top`（`.mp-stage`） | `26px` | 唱片顶部偏移，给抬起的唱针留高度 |
| `listMaxHeight`（组件里传 APlayer） | `"156px"` | 歌单抽屉高度（跟着一起变小，**别只改 CSS**） |
| `.mp-body { max-height }` | `min(660px, calc(100vh - 72px))` | 展开歌单时的总高度上限 |

唱针（枢轴 / 唱臂 / 唱头）是绝对定位的 px 值，已按 144 → 104 的同一比例（≈72%）缩过；
**再改 `--mp-disc` 时记得同步这几个 px**，否则唱臂会比唱片还长。窄屏（≤767px）另有一档 `96px`。

### 16.2 控制条：五个按钮 ↔ APlayer 公开 API

按钮行结构固定为 `[循环] [上一曲] 【播放/暂停】 [下一曲] [播放列表]` —— 主按钮居中，左右各两个，**严格对称**：

```jsx
<div className="mp-buttons">   /* display:flex; align-items:center; justify-content:center; gap:8px */
  <Repeat size={14} />        /* 循环模式：point at player.options.loop */
  <SkipBack size={16} />
  <Play size={18} /> / <Pause size={18} />   /* 主按钮：.mp-btn-main，实心 accent 圆钮 */
  <SkipForward size={16} />
  <ListMusic size={14} />
</div>
```

| 按钮 | 调用 | 备注 |
| --- | --- | --- |
| 上一曲 / 下一曲 | `player.skipBack()` / `player.skipForward()` | 内部走 `list.switch(prevIndex/nextIndex)`，`order: random` 也能正确处理 |
| 播放 / 暂停 | `player.toggle()` | 图标由 React 状态切换（`playing` 来自原生 play / pause 事件） |
| 循环模式 | `player.options.loop = "all" \| "one" \| "none"` | APlayer 的 `ended` 回调真的会读它；one 时按钮带角标「1」，none 时压暗 |
| 播放列表 | `player.list.toggle()` | 开 / 关歌单抽屉 |
| 进度 | `player.seek(秒)` | 见 16.3 |
| 音量 | `player.volume(v, true)` | 见 16.3；**1.10.1 里方法名是 `volume`，没有 `setVolume`** |

图标来自 `lucide-react`（`stroke: currentColor` → 颜色跟着按钮的 `color` 走，黑白主题自动反相）。
只引 6 个图标，生产包实测 **+3.05 kB gzip**（ESM 的 tree-shaking 生效）。


### 16.3 进度条与音量条（都是自绘的 `input[type=range]`）

- 数据源只有 `player.audio.currentTime` / `player.audio.duration`：APlayer 会把原生 `timeupdate` /
  `durationchange` / `loadedmetadata` / `seeked` / `canplay` 事件转发出来，组件在这些回调里同步 state。
- 视觉：2px 细轨（`--surface-tint-strong`）+ 8px 圆点（`--accent`）+ 淡淡的 `--accent-glow` 外圈；
  时间用 `font-variant-numeric: tabular-nums`，跳动时左右不抖。
- **拖动期间挂起 timeupdate**（`draggingRef`，由滑条的 mouse / touch / key / blur 事件开关）：
  否则每 250ms 一次的回流会把滑块从手指底下抢走。
- 音量入口在**标题栏**（`Volume2` 按钮，`aria-expanded` 标记展开态），展开后是控制条最下面那根横向细滑条；
  `player.volume(v, true)` 的第二个参数 = 不写 APlayer 自己的 storage（音量统一存在我们的 `shasha-music-player` prefs 里）。
  触屏设备（`@media (hover: none)`）隐藏音量入口，音量交给系统按键。

### 16.4 平台 / 榜单下拉（自绘 listbox，弃用原生 `<select>`）

| 文件 | 职责 |
| --- | --- |
| `src/components/MusicPlayer.js` | 触发按钮（`.mp-select-trigger`）+ 弹层（`.mp-menu`，`createPortal` 到 `body`）；状态 `pickerOpen` / `menuBox`；键盘 ↑↓ / Home / End / Esc |
| `src/components/MusicBrandIcon.tsx` | 六个频道的自绘单色图标 + `brandKeyOf(platform)` 判定（配置里的频道 → 图标种类） |

判定优先级写在 `RULES` 里（`brandKeyOf`）：**spotify → 抖音 → 汽水 → 纯音乐 → QQ → 网易云**。
抖音 / 汽水 / 纯音乐在配置里的 `provider` 也是 `netease`，所以必须靠 `group` / `key` **先**认出频道，
最后才轮到 `provider` 兜底 —— 顺序错了六个图标会退化成同一枚（`MusicBrandIcon.test.js` 拦这个）。

弹层的三条硬约束：

1. **`createPortal` 到 `document.body`**：面板本身有 `backdrop-filter` 与 `overflow: hidden`，
   面板内的弹层会被裁掉；`filter` / `backdrop-filter` 还会把 `position: fixed` 后代的包含块拽回面板内部，
   所以「挂在面板里 + fixed」也救不了，必须挂到 body；
2. **`position: fixed` + 每次打开按触发按钮的矩形定位**（下方放不下就向上翻，`data` 见 `menuBox.placement`），
   窗口 resize / 任意内部滚动时重算（`scroll` 不冒泡，但捕获阶段监听能收到，所以用 `capture: true`）；
3. **`z-index: 2147483000`**：高于播放器（`.music-player` = 9999）、低于自定义光标（2147483647），
   否则弹层会把光标盖住。

### 16.5 层级（弹层已经不再压住控制条）

| 层 | z-index | 说明 |
| --- | --- | --- |
| `.mp-menu`（平台弹层，portal 到 body） | `2147483000` | 高于播放器、低于自定义光标 |
| `.mp-picker`（触发按钮所在行） | 5 | 面板内的层叠上下文（弹层已不依赖它） |
| `.mp-controls` | 2 | 控制条 |
| `.mp-aplayer` / `.mp-stage` | 1 | 唱机台面 |
| `.mp-mask`（加载 / 错误遮罩） | 6 | 临时盖住整块 stage |

- 原生 `<select>` 的弹出列表由浏览器画在 top layer（`z-index` 管不到它，这是 HTML 规范行为），
  而且它的配色跟着系统走（深色页面里会冒出一块系统灰），所以**整体换成自绘 listbox**（见 16.4）；
- 触发按钮是普通按钮，留在文档流里，不再挤压唱机与控制条；弹层是 `fixed` 浮层，
  展开时只盖住下方的按钮，收起即消失。

### 16.6 验证

```bash
npm test -- --watchAll=false --testPathPattern MusicPlayer   # 23 用例：结构 / 图标 / 下拉交互 / 循环 / 进度 / 音量 / 样式契约
npm test -- --watchAll=false --testPathPattern MusicBrandIcon # 3 用例：频道 → 图标判定
npx tsc --noEmit                                            # 0 输出 = 通过
npm run build                                               # CI=true 时 lint 警告即失败
```

浏览器手查：① 面板是否约 264px 宽、唱片约 104px；② 五个按钮是否一行居中、图标是否齐全；
③ 点播放能否听到声音、唱片开始转、按钮变暂停；④ 拖进度条是否跟手；
⑤ 循环按钮角标 a11y 文案是否随模式变化；⑥ 打开下拉是否浮在唱机与控制条之上、六个频道图标各不相同、
选中项反白；点页面别处 / 按 Esc 能否收起；⑦ 深浅主题各看一遍配色。

### 16.7 坑（改之前先看）

1. **别把 `.aplayer-controller` 从 DOM 里删掉**（只能 `display: none`）：APlayer 的 `seek()` / `volume()` /
   `setUIPlaying()` 都会回来改这条子树上的行内样式，元素不在 DOM 里就得多写一堆空值判断。
2. **`player.options.loop` 没有 `loopMode` 这个名字**（1.10.1 源码里就这一个字段），也**没有 `setVolume`**（是 `volume(v, skipStorage)`）。
3. **换歌要在 `listswitch` 里把进度归零**（`setPosition(0)` + `setDuration(0)`），否则上一首的时间会挂在界面上。
4. **时长未知时显示 `--:--`**（`duration > 0 ? formatTime(duration) : "--:--"`），别让 `NaN:NaN` 出现在界面里。
5. **测试替身必须补齐新接口**：`MusicPlayer.test.js` 里的 FakePlayer 需要 `toggle / pause / skipBack / skipForward /
   seek / volume / options.loop / list.toggle`，以及 `audio.currentTime` / `audio.duration`，否则新按钮一点就 TypeError。
6. **样式相关的验收写在测试里**：jsdom 不解析 `src/style.css`，所以「面板 264px、`.mp-menu` 是 fixed + 高层级、
   `.mp-buttons` 是 flex + gap 8px、`.mp-picker select` 已删除、原生控制条 `display: none`」这几条由
   `describe("MusicPlayer 样式契约")` 直接读样式文件断言 —— 改样式时留意它别被删。
7. **`--mp-panel-width` / `--mp-disc` 与组件里的 `listMaxHeight` 是同一套尺寸**：只改 CSS 会让歌单抽屉与新面板不匹配。
8. **无 `:has()` 兜底的场景已经没了**：以前靠 `.mp-panel:has(.aplayer-button.aplayer-pause)` 猜播放状态，
   现在唱片 / 唱针 / 图标只跟 React 的 `playing`（原生事件同步）—— 别再把 `:has()` 那套加回来。
9. **弹层别挪回面板里**（第 16.4 节）：`backdrop-filter` + `overflow: hidden` 会把它裁掉，
   而且 `backdrop-filter` 会把 `fixed` 的包含块拽回面板内部 —— 只有 portal 到 `body` 才盖得住。
10. **触发按钮在加载中是 `disabled`**：测试里点开下拉前要先 `await` 榜单加载完成，否则点了个寂寞
    （`MusicPlayer.test.js` 里就是在这一条上踩过坑）。

