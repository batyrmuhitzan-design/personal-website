# 莎莎 · 个人主页（Shasha Portfolio）

一个暗色系、带粒子背景的个人主页站点，用于展示 Web 全栈开发与自动化编程方向的个人介绍、技术栈、项目经历与联系方式。

> 本项目基于开源模板 [Soumyajit4419/Portfolio](https://github.com/Soumyajit4419/Portfolio)（MIT License）**二次开发**：
> 已移除模板作者的全部示例内容（姓名、头像、项目截图、简历 PDF、GitHub 活跃度组件），
> 替换为「莎莎」的个人信息与自绘 SVG 素材，并新增 Docker + Nginx 部署方案。

---

## 一、页面结构

| 路由 | 内容 |
| --- | --- |
| `/` | 首页：粒子背景 Hero、打字机职位轮播、技术插图、个人简介、联系方式区块 |
| `/about` | 关于我：个人卡片、专业技术栈、常用工具 |
| `/project` | 项目：6 张项目卡片（自绘 SVG 封面 + GitHub 链接） |
| `/resume` | 经历：个人简介、工作经历时间线、核心技能、教育背景、PDF 下载 |
| `/contact` | 联系：邮箱一键复制、所在地、可合作方向、社交链接 |

其它细节：启动预加载动画、回到顶部按钮、移动端折叠导航、未匹配路由自动回首页，
以及左下角的**悬浮音乐播放器**（详见第五节，无需梯子即可播放 Spotify 榜单）。

## 二、技术栈

- 前端框架：React 17（CRA / react-scripts 5）
- UI：Bootstrap 5 + react-bootstrap + 自定义 `src/style.css`
- 图标：react-icons
- 动效：react-tsparticles（粒子）、typewriter-effect（打字机）、react-parallax-tilt（头像倾斜）
- 音乐播放：`aplayer`（走 npm 本地打包，不用 CDN，国内可正常加载）+ 自建解析服务 `music-api/`
  （公共 Meting 实例聚合 + Spotify 歌单跨源匹配，零第三方依赖）
- 部署：Docker 多阶段构建 + Nginx（SPA 回退 / gzip / 静态资源强缓存 / `/music/api` 反向代理）

## 三、本地开发

```bash
npm install --legacy-peer-deps   # 上游依赖存在 peer 冲突，需要该参数
npm start                        # 开发服务器 http://localhost:3000
npm run build                    # 生产构建，产物在 build/
npm test                         # 运行 src/portfolio.config.test.js 配置校验
```

要求 Node 18 及以上（实测 Node 20 / 24 均可构建）。

## 四、二改指南：想改什么，就改哪个文件

| 想修改的内容 | 对应文件 |
| --- | --- |
| 姓名、定位、打字机文案、邮箱、社交链接、所在地 | `src/portfolio.config.js`（**改这里最省事**） |
| 个人简介正文（首页） | `src/components/Home/Home2.js` |
| 关于我卡片文案 | `src/components/About/AboutCard.js` |
| 专业技术栈标签 | `src/components/About/Techstack.js` |
| 常用工具 | `src/components/About/Toolstack.js` |
| 项目列表与链接 | `src/components/Projects/Projects.js` |
| 项目封面图 | `src/Assets/Projects/*.svg`（替换同名文件即可） |
| 工作经历时间线 | `src/components/Resume/ResumeNew.js` |
| 可下载的简历 PDF | `src/Assets/Shasha_Resume.pdf`（或运行 `node scripts/make-resume-pdf.mjs` 重新生成） |
| 联系方式区块 | `src/components/Contact/Contact.js` |
| 页脚版权与社交图标 | `src/components/Footer.js` |
| 顶部导航与 Logo | `src/components/Navbar.js`、`src/Assets/logo.svg` |
| 标题 / 描述 / 图标 / 分享卡片 | `public/index.html`、`public/favicon.svg`、`public/manifest.json`、`public/og-cover.svg` |
| 样式与配色 | `src/style.css` 末尾「莎莎 · 二改定制样式」段落 |
| 音乐播放器的平台与歌单 ID | `src/portfolio.config.js` 的 `musicPlayer.platforms` |
| 播放器开关、默认平台、音量、每榜曲目数 | `src/portfolio.config.js` 的 `musicPlayer` |
| 播放器外观（暗黑配色、悬浮位置、折叠） | `src/style.css` 末尾「悬浮音乐播放器」段落 |
| 播放器交互逻辑（切换、失败重试、兜底） | `src/components/MusicPlayer.js` |
| 音源解析服务（换解析源 / 加新平台） | `music-api/lib/*.js`，说明见 `music-api/README.md` |

### ⚠️ 上线前请务必替换的占位内容

1. `src/portfolio.config.js` 中的 `email`（`hello@shasha.dev`）、`github`（`https://github.com/shasha`）、`bilibili`、`juejin` 均为**占位值**，请改成你自己的；
2. 项目卡片的仓库地址由 `profile.github` + 仓库名拼接，改完 `github` 后自动生效；
3. `src/Assets/Shasha_Resume.pdf` 是脚本生成的**示例简历**（内容为英文，便于使用 PDF 内置字体渲染），请替换为你自己的简历；
4. 若访问者设备缺少中文字体，SVG 里的中文会回退为默认无衬线字体，属正常现象。

## 五、悬浮音乐播放器（国内免 VPN 听 Spotify 榜单）

左下角常驻的暗黑播放器：**平台/榜单下拉切换**、播放列表、歌词、封面、音量、折叠与一键隐藏。
切换平台时会清空当前列表 → 加载新榜单 → 自动播放；组件挂在 `Routes` 之外，**路由切换音乐不中断**。

### 5.1 榜单与解析方式

| 下拉分组 | 榜单 | 解析方式 |
| --- | --- | --- |
| Spotify | 全球 Top 50 | 服务端读取公开歌单信息 → 逐曲匹配国内可播放音源 |
| 网易云音乐 | 热歌榜 / 飙升榜 / 新歌榜 | 公共 Meting 实例聚合解析 |
| QQ 音乐 | 热歌榜 | 公共 Meting 实例聚合解析 |
| 抖音 | 爆款热歌 / 爆红精选 | 网易云同名歌单（内容一致，国内可直出音频） |
| 纯音乐 | 专注学习 | 网易云「纯音乐图书馆」歌单 |
| 汽水音乐 | 热歌榜 | 网易云「汽水音乐热歌榜」歌单 |

### 5.2 为什么 Spotify 必须自建解析服务

- Meting 生态**没有 Spotify 音源**：把 Spotify 歌单 ID 丢给公共 Meting 实例只会得到
  `{"error":"unknown playlist id"}`；
- Spotify 官方匿名 token 也已封禁（`get_access_token` → 403、`/api/token` → 400 not permitted），
  浏览器端拿不到歌单曲目；
- 因此 `music-api/` 在**服务器侧**完成三件事：
  1. 读取 Spotify 公开歌单页（embed 页面内嵌了曲目数据）拿到「歌名 + 艺人」；
  2. 用网易云搜索匹配封面与歌词；
  3. 用网易云 / 酷我（`convert_url3`）解析出**国内可直连的 MP3**，
     并用 Range 探测（只取 2 字节读 `content-range`）剔除小于 1.2MB 的试听片段。
- 结果是国内网络**无需 VPN** 即可播放 Spotify 榜单，全程不经过 Spotify 的音频服务。

> ⚠️ 现实限制：跨平台匹配受版权影响，个别欧美曲目只能拿到试听片段或匹配失败；
> 播放器会提示「部分曲目为版权试听片段」，播放失败会自动重试并跳过。

### 5.3 接口与自测

| 接口 | 说明 |
| --- | --- |
| `GET /music/api/health` | 健康检查 |
| `GET /music/api/playlist?platform=&provider=&id=&mode=&limit=&proxy=` | 榜单曲目（播放器调用） |
| `GET /music/api/resolve?origin=&sid=&name=&artist=` | 单曲重新解析（直链过期时重试） |
| `GET /music/api/lrc?u=` / `GET /music/api/stream?u=` | 歌词文本 / 音频转发（同源、透传 Range） |

```bash
# 部署后验证（走 Nginx 反代；网页端口为 8881）
curl 'http://127.0.0.1:8881/music/api/health'
curl 'http://127.0.0.1:8881/music/api/playlist?platform=netease-hot&limit=3'
curl 'http://127.0.0.1:8881/music/api/playlist?platform=spotify&limit=3'   # 跨源匹配，首次约 10~20s
curl 'http://127.0.0.1:8881/music/api/playlist?platform=soda-hot&limit=3'
```

### 5.4 常见调整

- **换榜单**：改 `src/portfolio.config.js` 对应平台的 `id`（Spotify 填歌单 ID、网易云填歌单/榜单 ID、QQ 填 disstid）；
- **找网易云歌单 ID**：
  `cd music-api && node -e "import('./lib/netease.js').then(m => m.neteaseSearchPlaylists('抖音热歌')).then(console.log)"`；
- **本地开发**：解析服务可单独跑 `cd music-api && npm start`，
  然后 `REACT_APP_MUSIC_API=http://127.0.0.1:8080/api npm start` 指向它；
- **解析服务挂掉时**：前端自动退回「公共 Meting 实例直连」（仅限聚合频道，Spotify 频道会提示不可用）；
- **后端自检（不联网）**：`cd music-api && npm run check`。

## 六、Docker 部署

镜像采用多阶段构建：`node:20-alpine` 中执行 `npm run build` → `nginx:alpine` 托管 `build/`，最终镜像只包含 Nginx 与静态文件，体积小、启动快。
`docker-compose.yml` 里共有两个服务：**网站**（`personal-website`）与**音乐解析服务**（`music-api`，仅内网 `expose 8080`，由 Nginx 反代 `/music/api/`）。

```bash
# 方式一：docker compose（推荐）
docker compose up -d --build      # 构建并启动
docker compose logs -f            # 查看日志
docker compose down               # 停止并删除容器

# 方式二：原生 docker
docker build -t personal-website:latest .
docker run -d --name personal-website -p 8881:80 --restart always personal-website:latest
```

启动后访问 `http://服务器IP:8881`。

| 项目 | 值 |
| --- | --- |
| 服务名 / 容器名 | `personal-website` |
| 端口映射 | 宿主 `8881` → 容器 `80` |
| 重启策略 | `restart: always` |
| 健康检查 | `wget --spider http://127.0.0.1/`（Nginx 同时提供 `/healthz`） |
| Nginx 配置 | `nginx.conf`：SPA `try_files` 回退、gzip、静态资源 30 天强缓存、入口 HTML 不缓存、`/music/api/` 反向代理 |
| 音乐解析服务 | 容器 `music-api`（镜像 `shasha-music-api:latest`）：零第三方依赖，`expose 8080` 不占宿主端口，`restart: always` |
| 解析服务健康检查 | `wget --spider http://127.0.0.1:8080/api/health` |
| 解析服务可调环境变量 | `ALLOW_HOSTS`（追加音源域名白名单）、`ALLOW_ANY=1`（仅调试）、`PLAYLIST_TTL_MS`（榜单缓存时长） |

### 1Panel 部署步骤

1. 把项目目录上传到服务器（或用 Git 拉取）；
2. 「容器」→「编排」→「创建编排」，粘贴 `docker-compose.yml` 内容并确认；
3. 或先在「容器」→「镜像」→「构建镜像」里选择该目录构建，再「容器」→「创建容器」，端口填 **8881**，重启策略选「总是」；
4. 需要域名访问时，在「网站」→「反向代理」中代理到 `127.0.0.1:8881`；也可把容器接入 1Panel 网络后直接代理容器名 `personal-website:80`（`docker-compose.yml` 中已预留注释开关）。

## 七、注意事项与可优化项

- 字体来自 Google Fonts（`src/index.css` 顶部 `@import`），国内访问较慢时可删除该行改用系统字体；
- 上游遗留、本项目已不再使用的依赖：`react-pdf`、`@react-pdf/renderer`、`video-react`、`axios`、`react-github-calendar`，可从 `package.json` 移除，移除后建议重新执行 `npm install --legacy-peer-deps`；
- 站点是纯前端静态站点，无需数据库；如需访问统计或留言功能，可在 1Panel 中另行部署服务；
- 所有插图、头像、Logo、项目封面均为本项目自绘 SVG，不含第三方版权素材。

## 八、许可证

上游模板为 MIT License，版权归原作者 [Soumyajit4419](https://github.com/Soumyajit4419) 所有；
本仓库的二次开发部分（文案、素材、样式定制、部署配置）同样以 MIT 协议开源。

