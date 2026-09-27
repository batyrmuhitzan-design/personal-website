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
};

export default profile;
