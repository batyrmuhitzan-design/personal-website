import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * 自定义光标 · 卡通版
 * ------------------------------------------------------------------
 * 隐藏系统默认光标，改由两个 DOM 层绘制：
 * · ① 卡通小人（在前）：x / y 各挂一条弹簧（useSpring(useMotionValue)），
 *   产生「被拖着走」的延迟感 —— 它才是这套光标的主角：
 *     ‣ 常态：眨眼（一个周期眨三次、间隔刻意不等，避免机械节奏）、轻轻呼吸浮动、呆毛与马尾跟着摆
 *     ‣ 悬停到可点击元素（a / button / [data-cursor="pointer"] 等）：挥手 + 咧嘴笑 + 腮红加深
 *     ‣ 按下：换成「眯眼」并缩一下
 *   全部由注入的 CSS 动画驱动（不占 React 渲染，鼠标移动不会触发重渲染）；
 *   播放 / 暂停统一交给站内开关 --motion-play-state（见 src/index.css）
 * · ② 小箭头（在后）：直接吃原始 motion value，零延迟跟手、尖端严格咬住鼠标坐标，
 *   保证「指哪点哪」的精度不被弹簧拖累
 * · 配色全部走设计令牌（--accent / --bg-primary / --text-primary），
 *   深浅两套主题下都自带反相描边，落在任何背景上都能看清；
 *   这里不再使用 mix-blend-mode: difference —— 卡通人物需要真彩色
 * · 用 createPortal 挂到 document.body：避免祖先元素的 transform / filter 让
 *   position: fixed 失效，或把混合范围限制在某个局部层里
 * · 触屏 / 不支持 hover 的设备直接不渲染，保持系统原生光标
 */

/** 视为「可点击」的元素；额外支持用 data-cursor="pointer" 手动标记 */
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "select",
  "summary",
  "label",
  "[role='button']",
  "[data-cursor='pointer']",
].join(",");

/** 挂在 <html> 上的标记类：把「隐藏系统光标」限定在光标启用期间 */
const ACTIVE_CLASS = "has-custom-cursor";

const FIGURE_WIDTH = 26; // 卡通小人显示宽度（px）；SVG viewBox 为 44×52，等比高度见下
const FIGURE_HEIGHT = Math.round((FIGURE_WIDTH * 52) / 44); // ≈ 31px
const FIGURE_OFFSET_Y = 8; // 小人整体下移：鼠标点落在它头顶上方，不遮挡点击目标
const POINTER_WIDTH = 12; // 小箭头：viewBox 尖端在左上角 (0,0)，因此箭头严格咬住鼠标坐标
const POINTER_HEIGHT = 19;
const OVER_SCALE = 1.14; // 悬停可点击元素时小人的放大倍数
const PRESS_SCALE = 0.9; // 按下鼠标时小人缩一下

/**
 * 注入的两部分样式：
 *   1) 只在「精确指针 + 支持 hover」的设备上隐藏系统光标（触屏完全不受影响）。
 *      选择器写到 html.xxx body *（特异度 0,1,3），足以压过站点里那些
 *      带 !important 的 cursor: pointer。
 *   2) 卡通人物的动画与表情。全部是 CSS，鼠标移动不会引起 React 渲染。
 *
 * 关于 prefers-reduced-motion：这里刻意「不」跟着系统一刀切。
 * 站长这台机器的系统「动画效果」是关闭的（实测 SPI_GETCLIENTAREAANIMATION=False），
 * Chrome 会一直上报 reduce，跟随系统就等于卡通人物永不眨眼、黑胶唱片永不旋转。
 * 因此播放 / 暂停统一交给站内开关 --motion-play-state（默认 running，
 * 定义与说明在 src/index.css，想跟随系统只改那一个变量）。
 */
const CURSOR_CSS = `
@media (hover: hover) and (pointer: fine) {
  html.${ACTIVE_CLASS},
  html.${ACTIVE_CLASS} body,
  html.${ACTIVE_CLASS} body * {
    cursor: none !important;
  }
}

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

/* ---------- 文字气泡（元素上的 data-cursor-text）：贴在卡通小人下面 ---------- */
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

/** 卡通小人与小箭头共用的定位样式 */
const CURSOR_BASE_STYLE: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  pointerEvents: "none",
  willChange: "transform",
  zIndex: 2147483647,
};

function CustomCursor() {
  const [supported, setSupported] = useState(false); // 当前设备是否启用自定义光标
  const [visible, setVisible] = useState(false); // 鼠标是否停在窗口内
  const [pointerOver, setPointerOver] = useState(false); // 是否悬停在可点击元素上
  const [pressed, setPressed] = useState(false); // 是否按下鼠标
  const [label, setLabel] = useState(""); // 目标元素上的 data-cursor-text

  /* ---- motion value：位置与形变都走它，鼠标移动不进入 React 渲染 ---- */
  const pointerX = useMotionValue(-100);
  const pointerY = useMotionValue(-100);

  // 卡通小人：两轴各一条弹簧 → 延迟跟随（箭头的跟手精度由原始坐标保证）
  const figureX = useSpring(pointerX, { stiffness: 280, damping: 26, mass: 0.6 });
  const figureY = useSpring(pointerY, { stiffness: 280, damping: 26, mass: 0.6 });

  // 缩放 / 透明度同样交给弹簧，hover、按下、离开时都是平滑过渡
  const figureScale = useSpring(0.6, { stiffness: 320, damping: 22, mass: 0.5 });
  const cursorOpacity = useSpring(0, { stiffness: 300, damping: 30, mass: 0.4 });

  /* ref：记录原始坐标与可见性，供滚动重算 / 事件回调使用，不参与渲染 */
  const visibleRef = useRef(false);
  const pointRef = useRef({ x: -100, y: -100 });

  /* 1) 能力检测：只有「精确指针 + 支持 hover」的设备才启用 */
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setSupported(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /* 2) 启用时注入「隐藏系统光标」的样式并给 <html> 打标记，卸载时完整还原 */
  useEffect(() => {
    if (!supported) return undefined;
    const style = document.createElement("style");
    style.setAttribute("data-custom-cursor", "true");
    style.textContent = CURSOR_CSS;
    document.head.appendChild(style);
    document.documentElement.classList.add(ACTIVE_CLASS);
    return () => {
      document.documentElement.classList.remove(ACTIVE_CLASS);
      style.remove();
    };
  }, [supported]);

  /* 3) 事件绑定：坐标直接写进 motion value；只有「悬停 / 按下」这类状态才 setState */
  useEffect(() => {
    if (!supported) return undefined;

    const syncHover = (element: Element | null) => {
      // closest 从事件目标往上找：鼠标落在 <a> 里的图标上也照样算悬停
      const interactive = element ? element.closest(INTERACTIVE_SELECTOR) : null;
      setPointerOver(Boolean(interactive));
      setLabel(interactive ? interactive.getAttribute("data-cursor-text") || "" : "");
    };

    const show = () => {
      if (visibleRef.current) return;
      visibleRef.current = true;
      setVisible(true);
    };

    const hide = () => {
      if (!visibleRef.current) return;
      visibleRef.current = false;
      setVisible(false);
      setPointerOver(false);
      setLabel("");
      setPressed(false);
    };

    const handleMove = (event: MouseEvent) => {
      pointerX.set(event.clientX);
      pointerY.set(event.clientY);
      pointRef.current = { x: event.clientX, y: event.clientY };
      show();
    };

    const handleOver = (event: MouseEvent) => {
      syncHover(event.target as Element | null);
    };

    const handleDown = () => setPressed(true);
    const handleUp = () => setPressed(false);

    // 平滑滚动时鼠标不动、元素在动：借 elementFromPoint 重新判定一次悬停目标，
    // 否则「滚过来一个按钮」时光标状态会停留在旧元素上。
    let frame = 0;
    const handleScroll = () => {
      // 平滑滚动时这一条每帧都会触发；鼠标不在窗口里时没必要做命中测试
      if (!visibleRef.current || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncHover(document.elementFromPoint(pointRef.current.x, pointRef.current.y));
      });
    };

    // mouseover 用捕获阶段监听：后渲染出来的元素也能捕捉到，也不怕中途 stopPropagation
    window.addEventListener("mousemove", handleMove, { passive: true });
    document.addEventListener("mouseover", handleOver, true);
    document.addEventListener("mousedown", handleDown, true);
    document.addEventListener("mouseup", handleUp, true);
    document.documentElement.addEventListener("mouseleave", hide);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseover", handleOver, true);
      document.removeEventListener("mousedown", handleDown, true);
      document.removeEventListener("mouseup", handleUp, true);
      document.documentElement.removeEventListener("mouseleave", hide);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [supported, pointerX, pointerY]);

  /* 4) 悬停 / 按下 → 小人放大一点、按下时缩一下（表情切换交给下面注入的 CSS 类） */
  useEffect(() => {
    if (pressed) {
      figureScale.set(pointerOver ? OVER_SCALE * 0.94 : PRESS_SCALE);
    } else {
      figureScale.set(pointerOver ? OVER_SCALE : 1);
    }
  }, [pointerOver, pressed, figureScale]);

  /* 5) 鼠标移出窗口 → 整体淡出 */
  useEffect(() => {
    cursorOpacity.set(visible ? 1 : 0);
  }, [visible, cursorOpacity]);

  // 不支持的设备什么都不渲染，也就不会挂上任何全局样式
  if (!supported) return null;

  /* 卡通小人的「贴纸描边」：描边色取 --text-primary（深色主题接近白、浅色主题接近黑），
     于是无论落在什么背景上都自带反差轮廓；paint-order: stroke 让描边画在填充下面，
     轮廓只向外扩，不会吃掉五官。 */
  const sticker: React.CSSProperties = {
    stroke: "var(--text-primary)",
    strokeWidth: 1.1,
    strokeLinejoin: "round",
    paintOrder: "stroke",
  };

  return createPortal(
    <>
      {/* ① 卡通小人：弹簧驱动的延迟跟随（被「拖着走」的感觉）+ data-cursor-text 气泡 */}
      <motion.div
        aria-hidden="true"
        className={
          "cur-figure-wrap" +
          (pointerOver ? " cur--over" : "") +
          (pressed ? " cur--press" : "")
        }
        style={{
          ...CURSOR_BASE_STYLE,
          width: FIGURE_WIDTH,
          height: FIGURE_HEIGHT,
          marginLeft: -FIGURE_WIDTH / 2,
          marginTop: FIGURE_OFFSET_Y,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          x: figureX,
          y: figureY,
          scale: figureScale,
          opacity: cursorOpacity,
        }}
      >
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
            style={{ ...sticker, fill: "#2f2b3a" }}
          />
          {/* 身体：衣服取强调色，随主题反相 */}
          <path
            d="M13.4 32.4 C 15 30.4, 29 30.4, 30.6 32.4 C 32.6 38, 33.6 45.6, 33.6 49.6 C 33.6 50.6, 10.4 50.6, 10.4 49.6 C 10.4 45.6, 11.4 38, 13.4 32.4 Z"
            style={{ ...sticker, fill: "var(--accent)" }}
          />
          {/* 左臂：安静地垂着 */}
          <g>
            <rect x="5" y="33.4" width="5" height="12" rx="2.5" style={{ ...sticker, fill: "var(--accent)" }} />
            <circle cx="7.5" cy="46.2" r="2.6" style={{ ...sticker, fill: "#ffd9b8" }} />
          </g>
          {/* 右臂：悬停到可点击元素时挥起来 */}
          <g className="cur-arm-wave">
            <rect x="34" y="33.4" width="5" height="12" rx="2.5" style={{ ...sticker, fill: "var(--accent)" }} />
            <circle cx="36.5" cy="46.2" r="2.6" style={{ ...sticker, fill: "#ffd9b8" }} />
          </g>
          {/* 头 */}
          <ellipse cx="22" cy="19.4" rx="12.6" ry="12.2" style={{ ...sticker, fill: "#ffd9b8" }} />
          {/* 刘海 */}
          <path
            d="M9.2 18.6 C 9.6 6.6, 34.4 5.6, 34.8 18.6 C 31.8 11.4, 26.4 10.8, 22 14.4 C 17.6 10.8, 12.2 11.4, 9.2 18.6 Z"
            style={{ ...sticker, fill: "#2f2b3a" }}
          />
          {/* 呆毛 */}
          <path
            className="cur-tuft"
            d="M22 7.4 C 22.8 3.2, 25.8 1.4, 27 2.8 C 25.2 4.2, 24.4 5.8, 24 8.8 Z"
            style={{ ...sticker, fill: "#2f2b3a" }}
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

        {label ? <span className="cur-label">{label}</span> : null}
      </motion.div>

      {/* ② 小箭头：不吃弹簧，尖端严格咬住鼠标坐标（保证「指哪点哪」的精度） */}
      <motion.div
        aria-hidden="true"
        style={{
          ...CURSOR_BASE_STYLE,
          width: POINTER_WIDTH,
          height: POINTER_HEIGHT,
          x: pointerX,
          y: pointerY,
          opacity: cursorOpacity,
        }}
      >
        <svg viewBox="0 0 12 19" width={POINTER_WIDTH} height={POINTER_HEIGHT} aria-hidden="true" focusable="false">
          {/* 填充取强调色、描边取背景色 → 深色主题是「白箭头 + 深描边」，
              浅色主题自动变成「黑箭头 + 浅描边」，任何背景上都看得见 */}
          <path
            d="M0.9 0.9 L0.9 15.4 L4.6 12.1 L7.2 17.8 L9.5 16.8 L6.9 11.1 L11.1 11.1 Z"
            style={{
              fill: "var(--accent)",
              stroke: "var(--bg-primary)",
              strokeWidth: 1.6,
              strokeLinejoin: "round",
              paintOrder: "stroke",
            }}
          />
        </svg>
      </motion.div>
    </>,
    document.body
  );
}

export default CustomCursor;
