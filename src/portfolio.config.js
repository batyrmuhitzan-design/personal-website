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
