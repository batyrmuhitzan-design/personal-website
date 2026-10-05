/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tailwind 扫描这些路径里的类名，按需生成 CSS（与 CRA 的 src 结构对齐）
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],

  theme: {
    extend: {
      // ---------------------------------------------------------------
      // 颜色系统：极简黑白 + 设计令牌
      // · 纯黑 / 纯白仍是两极，全站不用其它色相
      // · 语义色全部映射到 src/theme/tokens.css 的 CSS 变量：
      //     bg-surface / bg-elevated / text-ink / border-hairline …
      //   这样新组件可以继续用 Tailwind 写，同时自动跟随日夜主题。
      // ---------------------------------------------------------------
      colors: {
        black: "#000000",
        white: "#ffffff",

        /* 令牌语义色（值 = CSS 变量，随 data-theme 自动换肤） */
        surface: "var(--bg-primary)", // 页面底色
        "surface-2": "var(--bg-secondary)", // 次级底色（分区）
        "surface-3": "var(--bg-tertiary)",
        elevated: "var(--card-bg)", // 卡片 / 控件底色
        "elevated-hover": "var(--card-bg-hover)",
        ink: "var(--text-primary)", // 主文字
        "ink-2": "var(--text-secondary)", // 次要文字
        "ink-3": "var(--text-tertiary)", // 弱化文字
        hairline: "var(--border-color)", // 极细分割线
        "hairline-strong": "var(--border-strong)",
        accent: "var(--accent)", // 强调（= 与背景对立的那一极）
        "accent-contrast": "var(--accent-contrast)", // 强调底上的文字
        "accent-soft": "var(--accent-soft)",
      },

      // ---------------------------------------------------------------
      // 字体：视觉冲击力无衬线（Space Grotesk，几何感强、字腔大）
      // 中文自动回退系统黑体，保证中英混排观感一致
      // ---------------------------------------------------------------
      fontFamily: {
        sans: [
          "Space Grotesk",
          "Inter",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "Noto Sans SC",
          "Source Han Sans SC",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },

      // ---------------------------------------------------------------
      // 自定义动画
      // ---------------------------------------------------------------
      animation: {
        // 黑胶唱片旋转（20s 一圈，恒速）
        "spin-slow": "rotate360 20s linear infinite",
        // 更慢的装饰环 / 大唱片（40s 一圈）
        "spin-slower": "rotate360 40s linear infinite",
        // 先锋排版跑马灯（配合外层 translateX(-50%) 无缝循环）
        marquee: "marquee 30s linear infinite",
      },
      keyframes: {
        rotate360: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },

  plugins: [],
};
