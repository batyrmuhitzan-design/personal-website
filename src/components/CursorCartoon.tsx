import React from "react";

/**
 * 自定义光标 · 皮肤「卡通小人」（skin="cartoon"）
 * ==========================================================================
 * 原有皮肤，保留可选（默认皮肤是像素小人，见 CustomCursor 的 DEFAULT_SKIN）。
 * 全部是矢量路径 + CSS 动画（动画规则在 cursorStyles.ts），
 * 颜色走设计令牌与少量固定肤色 / 发色：
 *   · 衣服 = var(--accent)  → 深浅主题自动反相
 *   · 描边 = var(--text-primary)，paint-order: stroke 让轮廓只向外扩
 *
 * 细节都在注释里，改表情 / 手势直接改这里的 class 与路径即可。
 */

const FIGURE_WIDTH = 26; // 显示宽度（px），viewBox 是 44×52
const FIGURE_HEIGHT = Math.round((FIGURE_WIDTH * 52) / 44); // ≈ 31px

/** 贴纸描边：描边色取 --text-primary，落在任何背景上都自带反差轮廓 */
const STICKER: React.CSSProperties = {
  stroke: "var(--text-primary)",
  strokeWidth: 1.1,
  strokeLinejoin: "round",
  paintOrder: "stroke",
};

function CursorCartoon() {
  return (
    <svg
      className="cur-figure"
      viewBox="0 0 44 52"
      width={FIGURE_WIDTH}
      height={FIGURE_HEIGHT}
      aria-hidden="true"
      focusable="false"
    >
      {/* 马尾（最后面，随呼吸摆动） */}
      <path
        className="cur-tail"
        d="M9.6 14 C 2.6 19.4, 1.6 33, 6.4 44.2 C 3.2 33.2, 4.8 20.8, 11 16.2 Z"
        style={{ ...STICKER, fill: "#2f2b3a" }}
      />
      {/* 身体：衣服取强调色，随主题反相 */}
      <path
        d="M13.4 32.4 C 15 30.4, 29 30.4, 30.6 32.4 C 32.6 38, 33.6 45.6, 33.6 49.6 C 33.6 50.6, 10.4 50.6, 10.4 49.6 C 10.4 45.6, 11.4 38, 13.4 32.4 Z"
        style={{ ...STICKER, fill: "var(--accent)" }}
      />
      {/* 左臂：安静地垂着 */}
      <g>
        <rect x="5" y="33.4" width="5" height="12" rx="2.5" style={{ ...STICKER, fill: "var(--accent)" }} />
        <circle cx="7.5" cy="46.2" r="2.6" style={{ ...STICKER, fill: "#ffd9b8" }} />
      </g>
      {/* 右臂：悬停到可点击元素时挥起来（.cur--over .cur-arm-wave） */}
      <g className="cur-arm-wave">
        <rect x="34" y="33.4" width="5" height="12" rx="2.5" style={{ ...STICKER, fill: "var(--accent)" }} />
        <circle cx="36.5" cy="46.2" r="2.6" style={{ ...STICKER, fill: "#ffd9b8" }} />
      </g>
      {/* 头 */}
      <ellipse cx="22" cy="19.4" rx="12.6" ry="12.2" style={{ ...STICKER, fill: "#ffd9b8" }} />
      {/* 刘海 */}
      <path
        d="M9.2 18.6 C 9.6 6.6, 34.4 5.6, 34.8 18.6 C 31.8 11.4, 26.4 10.8, 22 14.4 C 17.6 10.8, 12.2 11.4, 9.2 18.6 Z"
        style={{ ...STICKER, fill: "#2f2b3a" }}
      />
      {/* 呆毛 */}
      <path
        className="cur-tuft"
        d="M22 7.4 C 22.8 3.2, 25.8 1.4, 27 2.8 C 25.2 4.2, 24.4 5.8, 24 8.8 Z"
        style={{ ...STICKER, fill: "#2f2b3a" }}
      />
      {/* 眼睛：两只共用 .cur-eye，眨眼同步 */}
      <g className="cur-eye">
        <ellipse cx="16.9" cy="20.8" rx="2.2" ry="2.9" fill="#2a2632" />
        <circle cx="17.7" cy="19.8" r="0.8" fill="#ffffff" />
      </g>
      <g className="cur-eye">
        <ellipse cx="27.1" cy="20.8" rx="2.2" ry="2.9" fill="#2a2632" />
        <circle cx="27.9" cy="19.8" r="0.8" fill="#ffffff" />
      </g>
      {/* 按下时替换成「眯眼」 */}
      <path className="cur-eye-happy" d="M14.4 21.6 Q16.9 18.2 19.4 21.6" stroke="#2a2632" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path className="cur-eye-happy" d="M24.6 21.6 Q27.1 18.2 29.6 21.6" stroke="#2a2632" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* 腮红 */}
      <ellipse className="cur-blush" cx="12.6" cy="25.2" rx="3" ry="1.9" fill="#ff9d9d" />
      <ellipse className="cur-blush" cx="31.4" cy="25.2" rx="3" ry="1.9" fill="#ff9d9d" />
      {/* 嘴：常态抿嘴 / 悬停可点击元素时咧嘴笑 */}
      <path className="cur-mouth-idle" d="M19.7 26.6 Q22 28.5 24.3 26.6" stroke="#a8666a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path className="cur-mouth-happy" d="M18.9 25.9 Q22 30.6 25.1 25.9 Q22 28.4 18.9 25.9 Z" fill="#b8565c" />
    </svg>
  );
}

export default CursorCartoon;
