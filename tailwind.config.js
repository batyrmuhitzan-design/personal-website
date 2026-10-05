/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tailwind 扫描这些路径里的类名，按需生成 CSS（与 CRA 的 src 结构对齐）
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],

  theme: {
    extend: {
      // ---------------------------------------------------------------
      // 颜色系统：极简黑白
      // · 纯黑 / 纯白锁定为两极，全站不用其它色相
      // · 灰度全部用「白色 + 透明度修饰符」表达：
      //     text-white/60   → 次级文字
      //     text-white/20   → 弱化文字 / 分隔线
      //     border-white/10 → 极细描边
      //   需要实色灰时用 Tailwind 内置 neutral（等价灰度，无彩色相）
      // ---------------------------------------------------------------
      colors: {
        black: "#000000",
        white: "#ffffff",
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
