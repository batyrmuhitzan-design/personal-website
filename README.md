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

其它细节：启动预加载动画、回到顶部按钮、移动端折叠导航、未匹配路由自动回首页。

## 二、技术栈

- 前端框架：React 17（CRA / react-scripts 5）
- UI：Bootstrap 5 + react-bootstrap + 自定义 `src/style.css`
- 图标：react-icons
- 动效：react-tsparticles（粒子）、typewriter-effect（打字机）、react-parallax-tilt（头像倾斜）
- 部署：Docker 多阶段构建 + Nginx（SPA 回退 / gzip / 静态资源强缓存）

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

### ⚠️ 上线前请务必替换的占位内容

1. `src/portfolio.config.js` 中的 `email`（`hello@shasha.dev`）、`github`（`https://github.com/shasha`）、`bilibili`、`juejin` 均为**占位值**，请改成你自己的；
2. 项目卡片的仓库地址由 `profile.github` + 仓库名拼接，改完 `github` 后自动生效；
3. `src/Assets/Shasha_Resume.pdf` 是脚本生成的**示例简历**（内容为英文，便于使用 PDF 内置字体渲染），请替换为你自己的简历；
4. 若访问者设备缺少中文字体，SVG 里的中文会回退为默认无衬线字体，属正常现象。

## 五、Docker 部署

镜像采用多阶段构建：`node:20-alpine` 中执行 `npm run build` → `nginx:alpine` 托管 `build/`，最终镜像只包含 Nginx 与静态文件，体积小、启动快。

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
| Nginx 配置 | `nginx.conf`：SPA `try_files` 回退、gzip、静态资源 30 天强缓存、入口 HTML 不缓存 |

### 1Panel 部署步骤

1. 把项目目录上传到服务器（或用 Git 拉取）；
2. 「容器」→「编排」→「创建编排」，粘贴 `docker-compose.yml` 内容并确认；
3. 或先在「容器」→「镜像」→「构建镜像」里选择该目录构建，再「容器」→「创建容器」，端口填 **8881**，重启策略选「总是」；
4. 需要域名访问时，在「网站」→「反向代理」中代理到 `127.0.0.1:8881`；也可把容器接入 1Panel 网络后直接代理容器名 `personal-website:80`（`docker-compose.yml` 中已预留注释开关）。

## 六、注意事项与可优化项

- 字体来自 Google Fonts（`src/index.css` 顶部 `@import`），国内访问较慢时可删除该行改用系统字体；
- 上游遗留、本项目已不再使用的依赖：`react-pdf`、`@react-pdf/renderer`、`video-react`、`axios`、`react-github-calendar`，可从 `package.json` 移除，移除后建议重新执行 `npm install --legacy-peer-deps`；
- 站点是纯前端静态站点，无需数据库；如需访问统计或留言功能，可在 1Panel 中另行部署服务；
- 所有插图、头像、Logo、项目封面均为本项目自绘 SVG，不含第三方版权素材。

## 七、许可证

上游模板为 MIT License，版权归原作者 [Soumyajit4419](https://github.com/Soumyajit4419) 所有；
本仓库的二次开发部分（文案、素材、样式定制、部署配置）同样以 MIT 协议开源。

