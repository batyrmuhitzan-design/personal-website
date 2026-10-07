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
| `scripts/slim-server.sh` | 小内存服务器瘦身（默认只体检，`--apply` 才动手） | ✅ |

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
npm test -- --watchAll=false   # 8 套件 / 35 用例（含主题持久化、过渡窗口、切换不重挂载播放器）
npm run build                  # 生产构建（CI=true 时 lint 警告会被当错误）
# 构建产物自检：令牌与工具类是否真的进包
grep -c -- '--bg-primary' build/static/css/*.css
```

