/**
 * 自定义光标 · 运行时注入的样式（唯一来源）
 * ==========================================================================
 * 这些规则由 CustomCursor 在「精确指针 + 支持 hover」的设备上动态插入 <head>，
 * 卸载时整块移除 —— 因此它们只在该启用的时候存在，不会影响触屏设备。
 *
 * 拆成独立模块的原因：
 *   1) CSS 很长（像素小人 + 卡通小人两套动画），混在组件里会淹没逻辑；
 *   2) 样式与「皮肤」一一对应，加新皮肤时只在这里追加一段；
 *   3) 静态兜底写在 src/index.css（只有 cursor: none 那几条），
 *      这里负责动态部分，职责分开。
 */

/** 挂在 <html> 上的标记类：把「隐藏系统光标」限定在光标启用期间 */
export const ACTIVE_CLASS = "has-custom-cursor";

export const CURSOR_CSS = `
@media (hover: hover) and (pointer: fine) {
  html.${ACTIVE_CLASS},
  html.${ACTIVE_CLASS} body,
  html.${ACTIVE_CLASS} body * {
    cursor: none !important;
  }

  /* 输入类控件交还系统光标：规则写在元素自身（同特异度、位置更靠后 → 后者胜）。
     这样「看起来」是系统文本光标；与此同时组件会给两层加 .cur--native 让它们淡出，
     不会出现「系统箭头 + 自定义小人」叠在一起。 */
  html.${ACTIVE_CLASS} body input,
  html.${ACTIVE_CLASS} body textarea,
  html.${ACTIVE_CLASS} body select,
  html.${ACTIVE_CLASS} body [contenteditable='true'],
  html.${ACTIVE_CLASS} body [data-cursor='native'] {
    cursor: auto !important;
  }
}

/* ==========================================================================
   皮肤一：像素小人（skin="pixel"）
   --------------------------------------------------------------------------
   · 颜色是「角色变量」：--cur-px-line / face / mark / glow，
     悬停时只改变量 → SVG 里的 fill 自动刷新（不需要 React 重算任何东西）
   · 呼吸与闪烁都用 steps() —— 像素画的动感应该是一格一格跳的；
     平滑缓动会把像素边缘「糊」掉，反而不像素了
   ========================================================================== */
.cur-pixel-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cur-pixel {
  animation: cur-pixel-bob 2.6s steps(6, end) infinite;
  shape-rendering: crispEdges;
  will-change: transform;
}

.cur-px--glow {
  animation: cur-pixel-blink 1.4s steps(2, end) infinite;
}

/* 悬停到可点击元素：护目镜 / 天线 / 头盔三层一起反相，明确「这个能点」 */
.cur--over .cur-pixel-wrap {
  --cur-px-mark: var(--accent-contrast);
  --cur-px-glow: var(--accent);
  --cur-px-face: var(--accent);
}

/* 交还系统光标（输入框等）时，卡通/像素小人与箭头一起淡出 */
.cur--native .cur-figure-wrap,
.cur--native .cur-arrow {
  opacity: 0 !important;
}

/* 像素小人的待机浮动：整数像素位移，边缘始终对齐设备像素 */
@keyframes cur-pixel-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

/* 天线发光端：两帧闪烁（steps(2) 才是硬切，不会出现渐变中间态） */
@keyframes cur-pixel-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}

/* 站内开关必须在 animation 简写之后落笔（同特异度、后者胜） */
.cur-pixel,
.cur-px--glow {
  animation-play-state: var(--motion-play-state, running);
}

/* ==========================================================================
   皮肤二：卡通小人（skin="cartoon"）· 原有皮肤，保留可选
   ========================================================================== */
/* ---------- 眨眼：一个周期眨三次，间隔刻意不等，避免机械节奏 ---------- */
@keyframes cur-blink {
  0%, 3% { transform: scaleY(0.08); }
  6%, 44% { transform: scaleY(1); }
  47% { transform: scaleY(0.08); }
  50%, 85% { transform: scaleY(1); }
  88% { transform: scaleY(0.08); }
  91%, 100% { transform: scaleY(1); }
}

/* ---------- 呼吸：整体微微上下浮动 + 左右歪头（原点在脚下） ---------- */
@keyframes cur-bob {
  0%, 100% { transform: translateY(0) rotate(-1.8deg); }
  50% { transform: translateY(-1.6px) rotate(1.8deg); }
}

/* ---------- 呆毛 / 马尾：比呼吸慢半拍地摆 ---------- */
@keyframes cur-sway {
  0%, 100% { transform: rotate(-4deg); }
  50% { transform: rotate(5deg); }
}

/* ---------- 挥手：只在悬停到可点击元素时才播放 ---------- */
@keyframes cur-wave {
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(-38deg); }
}

.cur-figure {
  animation: cur-bob 3.8s ease-in-out infinite;
  transform-origin: 50% 94%;
}

.cur-eye {
  animation: cur-blink 5.4s ease-in-out infinite;
  /* fill-box：以眼球自身的包围盒做参考，缩放围绕眼球中心收缩 */
  transform-box: fill-box;
  transform-origin: 50% 50%;
}

.cur-tuft {
  animation: cur-sway 3.8s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: 50% 100%;
}

.cur-tail {
  animation: cur-sway 4.6s ease-in-out infinite;
  animation-delay: -1.4s; /* 与呆毛错开，看起来更自然 */
  transform-box: fill-box;
  transform-origin: 74% 8%;
}

/* 右臂：默认冻结在初始角度（paused），悬停到可点击元素才挥起来 */
.cur-arm-wave {
  animation: cur-wave 0.64s ease-in-out infinite;
  animation-play-state: paused;
  transform-box: fill-box;
  transform-origin: 50% 6%;
}

.cur--over .cur-arm-wave {
  animation-play-state: var(--motion-play-state, running);
}

/* 注意：animation-play-state 必须写在上面那些 animation 简写「之后」，
   否则会被简写重置回 running（同特异度、后者胜），站内开关就失效了。 */
.cur-figure,
.cur-eye,
.cur-tuft,
.cur-tail {
  animation-play-state: var(--motion-play-state, running);
}

/* ---------- 表情：常态抿嘴；悬停可点击元素咧嘴笑 + 腮红加深；按下眯眼 ---------- */
.cur-mouth-happy,
.cur-eye-happy {
  opacity: 0;
}

.cur--over .cur-mouth-happy {
  opacity: 1;
}

.cur--over .cur-mouth-idle {
  opacity: 0;
}

.cur--press .cur-eye {
  opacity: 0;
}

.cur--press .cur-eye-happy {
  opacity: 1;
}

.cur-blush {
  opacity: 0.5;
  transition: opacity 0.2s ease;
}

.cur--over .cur-blush {
  opacity: 0.95;
}

/* ---------- 文字气泡（元素上的 data-cursor-text）：贴在小人下面 ---------- */
.cur-label {
  margin-top: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.6px;
  white-space: nowrap;
  user-select: none;
}
`;
