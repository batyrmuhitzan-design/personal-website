/**
 * ==========================================================================
 *  莎莎 · 个人主页全局配置（二改时优先改这一个文件）
 * ==========================================================================
 *  站点上出现的人名、定位、打字机文案、邮箱、社交链接、页脚版权
 *  全部从这里读取，改完保存即可，无需逐个组件去翻。
 * ==========================================================================
 */

const profile = {
  /* ---------------- 身份标识 ---------------- */
  name: "莎莎", // 中文名（Hero 大字、页脚、简历等处统一使用）
  nameEn: "Shasha", // 英文 / 拼音标识
  monogram: "S", // 头像与 Logo 上的首字母

  /* ---------------- 顶部 Header 品牌区 ----------------
     只作用于导航栏左上角的「字章 + 双行署名」；
     Hero 大标题用的仍然是 name / nameEn，改这里不会动首屏主视觉。 */
  brand: {
    primary: "莎莎", // 第一行（中文）
    secondary: "Batyr", // 第二行（拉丁字母，大写小字距展示）
  },

  /* ---------------- 个人定位 ---------------- */
  role: "Web 全栈开发与自动化编程", // 中文定位
  roleEn: "Web Developer & Automation Specialist", // 英文定位
  slogan: "把重复的事情交给代码，把时间留给创造。", // 一句话签名

  /* ---------------- Hero 打字机文案 ---------------- */
  typewriter: [
    "Web 全栈开发",
    "自动化编程工程师",
    "Web Developer",
    "Automation Specialist",
    "React · TypeScript · FastAPI",
  ],

  /* ---------------- 联系与社交（TODO: 换成你自己的） ---------------- */
  location: "中国 · 支持远程协作",
  email: "hello@shasha.dev",
  github: "https://github.com/shasha",
  githubUser: "shasha",
  bilibili: "https://space.bilibili.com/0",
  juejin: "https://juejin.cn/",

  /* ---------------- 简历 PDF（由 scripts/make-resume-pdf.mjs 生成） ---------------- */
  resumeFile: "Shasha_Resume.pdf",

  /* ---------------- 自定义光标（由 src/components/CustomCursor.tsx 读取） ----------------
     皮肤：pixel = 内置「像素小人 + 像素箭头」（默认，内联 SVG，颜色随主题反相）
           cartoon = 手绘矢量卡通小人（原有皮肤，会眨眼 / 挥手 / 咧嘴）
     randomSkin：true = 每次刷新页面从内置 10 种像素角色里随机抽一个（Math.random），
                 想让某一位固定出场就把它设成 false，再用 character 指定
     character：角色 id 或序号（见 src/lib/pixelArt.ts 的 PIXEL_CHARACTERS）。
                留空 = 跟随 randomSkin；填了就以它为准（方便截图 / 做视觉回归）
     spriteUrl：填自己的图片就能整体替换图案（支持 PNG / GIF / SVG，动画 GIF 会自己播）
                · 图片放 public/ 就写 "/cursor.png"（文件名别用中文）
                · 也可以用 import 把资源交给打包器（见 CustomCursor.tsx 顶部注释）
                · 留空 = 用内置像素小人（注意：填了它 randomSkin 就不生效）
     spriteWidth：精灵显示宽度（px），高度按图案比例自动算，不写默认 30
     tilt：悬停到可点击元素（a / button / [data-cursor="pointer"] …）时的旋转角度（deg），
           设 0 就只放大不旋转
     enabled：false = 整体关掉，回到系统光标
     说明：原生光标是「彻底」隐藏的（连输入框都不再交还系统光标），
           悬停输入框时箭头会变成像素竖线（.cur--text），保留文本插入点的心理暗示 */
  cursor: {
    enabled: true,
    skin: "pixel",
    randomSkin: true,
    character: "",
    spriteUrl: "",
    spriteWidth: 30,
    tilt: 8,
  },

  /* ---------------- 动效体系（平滑滚动 / 入场 / 视差 / 切页） ----------------
     平滑滚动：Lenis，参数在下面 motion.lenis（场景见 src/components/SmoothScroll.tsx）
       · duration：滚轮松手后「滑行」多久，越大越沉。0.8~1.0 是「丝滑但不迟钝」的甜点区
       · easingExponent：收尾指数，曲线是 `1 - 2^(-e·t)`。⚠️ 必须 ≥ 8：
        这是从官方示例 `1.001 - 2^(-e·t)` 抄漏出来的坑 —— 指数 3.6 时曲线在
        t=1 只到 0.9185，末端 8% 的距离会被 Lenis 的硬钳（progress ≥ 1 时它直接
        取 1、不看曲线）在 1~2 帧里补完，表现就是「到顶 / 到底顿一下再猛地拉满」；
        完整推导见 src/components/SmoothScroll.tsx 里 makeEasing 的注释。
        10 = 官方默认档：t=0.5 已走完 96.9%，末段约 0.4s 匀速收尾，跟手不毛躁
       · wheelMultiplier：滚轮速度倍率（1 = 原生一格就是它自己）
       · touchMultiplier：触屏拖动倍率，略大一点更接近手指滑动的惯性预期
       · syncTouch：true = 触屏也交给 Lenis 做插值（默认 false 是「触屏用原生滚动」）。
                     开着更顺，代价是 iOS 原生的橡皮筋手感会变；
                     @studio-freight/lenis@1.0.42 没有 overscroll 选项，
                     「触顶 / 触底顿挫」由 CSS 的 overscroll-behavior: none 解决
                     （见 src/components/SmoothScroll.tsx 注入的 LENIS_CSS）
       · syncTouchLerp / touchInertiaMultiplier：上面那套的插值速度与惯性衰减
       · lerp：想用「固定插值」而不是 duration 曲线时填它（填了则忽略 duration）
     入场 / 视差 / 切页动画的开关**不在这里**：统一是 CSS 变量 --motion-play-state
     （默认 running，定义与说明在 src/index.css，改一处即可让全站动效静音） */
  motion: {
    lenis: {
      duration: 0.85,
      easingExponent: 10,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      syncTouch: true,
      syncTouchLerp: 0.11,
      touchInertiaMultiplier: 28,
      lerp: 0,
    },
  },

  /* ---------------- 3D 全屏背景（Three.js · 点阵星门） ----------------
     见 src/components/Stage3D.js。它是一条「不抢内容」的底层：
     · 固定定位铺满视口、pointer-events: none、aria-hidden，永远在正文之下
       （层叠顺序的坑见 src/style.css 里 .stage3d 与 .home-section 的注释）；
     · three 走动态 import —— 文字与样式先到，3D 在空闲时再进来，
       所以「有没有 3D」都不影响首屏可读性与响应速度；
     · 没有 WebGL / 动效总开关 paused / 窄屏 → 直接不加载，返回空层。
     想整体关掉：enabled: false（three 那个 chunk 连请求都不会发）。 */
  stage3d: {
    enabled: true,
    grid: 26, // 点阵边长（粒子数 = grid²）：26 → 676 个粒子组成的光隧道
    span: 44, // 点阵在世界坐标里的横向铺开宽度
    depth: 92, // 纵深（z 轴长度），越大越像「隧道」
    pixelRatio: 1.5, // DPR 上限：2 会让中低端笔记本掉帧，1.5 是清晰 / 帧率的折中
    cameraZ: 16, // 起始镜头距离
    travel: 34, // 从首屏滚到底部镜头推进的距离（越大越像「穿越」而不是平移）
    tilt: 0.16, // 滚动中段镜头绕 X 轴的俯仰（弧度）
    spin: 0.24, // 整段滚动里点阵的自转量（弧度）
    introMs: 1500, // 开场：粒子从散开的球壳汇聚成点阵
    opacityLight: 0.4, // 浅色主题的整体不透明度（白底上要克制，可读性优先）
    opacityDark: 0.58, // 深色主题（黑底可以更亮、更「赛博」）
    ring: true, // 是否叠加线框圆环（星门本体）
  },

  /* ---------------- 滚动镜头（GSAP ScrollTrigger · 无缝衔接） ----------------
     见 src/components/CinemaScroll.tsx。把「首屏 → 第二屏」变成一次镜头推近：
     · pin + scrub：把 Hero 钉住一段滚动距离，期间内容沿 Z 轴推近、第二屏从
       远处淡入就位 —— 是「被镜头带进去」，而不是「整块上移」；
     · 与 Lenis 不冲突：Lenis 改的是真实滚动位置，ScrollTrigger 直接读 window；
       pin 会插入占位符（spacer），Lenis 靠自身 ResizeObserver 跟随高度，
       切页 / 字体 / 图片就位后我们再主动 ScrollTrigger.refresh() 一次。
     想整体关掉：enabled: false（首屏退回普通滚动，也不加载 gsap）。 */
  cinema: {
    enabled: true,
    pinScreens: 1.15, // Hero 钉住多少屏的滚动距离（1.15 = 一屏多一点）
    zoom: 1.34, // 钉住期间 Hero 的推近倍率（1 = 不推近；1.3~1.5 最像镜头）
    lift: -0.16, // 推近时 Hero 的纵向漂移（占视口高度的比例，负值 = 上飘）
    fade: true, // 末段把 Hero 淡出，交给第二屏
    titleDepth: 88, // 大标题在 Z 轴上的额外分离量（px）：越大越像 3D 排字
  },

  /* ---------------- 微音效（Web Audio API · 不需要任何音频文件） ----------------
     见 src/lib/sound.ts：全部用振荡器现场合成（0 请求、0 版权风险），
     音色是极短的「像素 / 科技」气泡音。右上角有全局开关
     （src/components/SoundToggle.tsx），默认关 —— 浏览器要求用户手势之后
     才能出声，而且一进站就响对访客很不礼貌。 */
  sound: {
    enabled: true, // 站点是否具备发声能力（false = 连开关都不显示）
    defaultOn: false, // 首次访问的默认状态（点一下开关才开）
    volume: 0.16, // 主音量（0~1）：微音效要「听得到但不打扰」
    hover: true, // 悬停按钮 / 链接的轻响
    click: true, // 点击（含菜单展开、切页）的确认音
    hz: { hover: 1180, click: 660, open: 880, close: 520, toggle: 1320 }, // 各事件的基频
  },

  /* ---------------- 悬浮音乐播放器 ---------------- */
  /* 榜单数据由 music-api/ 解析服务提供（nginx 反向代理到 /music/api）：
     - 网易云 / QQ / 抖音 / 汽水：走公共 Meting 聚合解析
     - Spotify：服务端解析公开歌单，再自动匹配国内可播放音源（无梯子也能听）
     换榜单只改下面的 id；找 id 的方法见 music-api/README.md。 */
  musicPlayer: {
    enabled: true, // 关掉即整个悬浮播放器不渲染
    title: "莎莎的歌单",
    subtitle: "国内直连 · 无需梯子",
    apiBase: "/music/api", // 解析服务地址（本地开发可用 REACT_APP_MUSIC_API 覆盖）
    streamingProxy: true, // 音频经自己的服务器中转：修正响应头、避开混合内容与防盗链
    defaultPlatform: "spotify",
    volume: 0.65,
    limit: 20, // 每个榜单最多加载多少首（越少首屏越快）
    listFolded: true, // 播放列表默认折叠
    fallbackMeting: "https://api.qijieya.cn/meting/", // 解析服务不可用时的前端兜底实例
    platforms: [
      {
        key: "spotify",
        group: "Spotify",
        name: "全球 Top 50",
        provider: "spotify",
        id: "37i9dQZEVXbMDoHDwVN2tF",
        mode: "match",
      },
      { key: "netease-hot", group: "网易云音乐", name: "热歌榜", provider: "netease", id: "3778678", mode: "meting" },
      { key: "netease-rising", group: "网易云音乐", name: "飙升榜", provider: "netease", id: "19723756", mode: "meting" },
      { key: "netease-new", group: "网易云音乐", name: "新歌榜", provider: "netease", id: "3779629", mode: "meting" },
      { key: "tencent-hot", group: "QQ 音乐", name: "热歌榜", provider: "tencent", id: "7051235710", mode: "meting" },
      { key: "douyin-hot", group: "抖音", name: "爆款热歌", provider: "netease", id: "2629584905", mode: "meting" },
      { key: "douyin-viral", group: "抖音", name: "爆红精选", provider: "netease", id: "17887842370", mode: "meting" },
      { key: "instrumental", group: "纯音乐", name: "专注学习", provider: "netease", id: "316192152", mode: "meting" },
      { key: "soda-hot", group: "汽水音乐", name: "热歌榜", provider: "netease", id: "7517623099", mode: "meting" },
    ],
  },
};

export default profile;
