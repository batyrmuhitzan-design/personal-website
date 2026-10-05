import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * 自定义光标
 * ------------------------------------------------------------------
 * · 隐藏系统默认光标，改由两个 DOM 元素绘制：外层圆环 + 内层实心点
 * · 外圈：x / y 各挂一条弹簧（useSpring(useMotionValue)），产生「被拖着走」的延迟感
 * · 内点：直接吃原始 motion value，零延迟跟手（移动鼠标不会触发 React 重渲染）
 * · 悬停到可点击元素（a / button / [data-cursor="pointer"] 等）时：外圈放大并填成白色，
 *   配合 mix-blend-mode: difference —— 白色像素反相、黑色像素保持原样，
 *   于是在深色背景上是「白底黑字」、在浅色背景上自动变成「黑底白字」
 * · 用 createPortal 挂到 document.body：避免祖先元素的 transform / filter 让
 *   position: fixed 失效，或把 difference 的混合范围限制在某个局部层里
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

const RING_SIZE = 34; // 外圈直径（px）
const DOT_SIZE = 6; // 内点直径（px）
const HOVER_SCALE = 1.9; // 悬停可点击元素时外圈的放大倍数
const LABEL_HOVER_SCALE = 2.6; // 悬停带 data-cursor-text 的元素时再放大一点，给文字留位置

/**
 * 只在「精确指针 + 支持 hover」的设备上隐藏系统光标，触屏设备完全不受影响。
 * 选择器写到 html.xxx body *（特异度 0,1,3），足以压过站点里那些
 * 带 !important 的 cursor: pointer。
 */
const HIDE_NATIVE_CURSOR_CSS = `
@media (hover: hover) and (pointer: fine) {
  html.${ACTIVE_CLASS},
  html.${ACTIVE_CLASS} body,
  html.${ACTIVE_CLASS} body * {
    cursor: none !important;
  }
}
`;

/** 圆环与内点共用的定位 / 混合样式 */
const CURSOR_BASE_STYLE: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  borderRadius: "50%",
  pointerEvents: "none",
  mixBlendMode: "difference",
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

  // 外圈：两轴各一条弹簧 → 延迟跟随
  const ringX = useSpring(pointerX, { stiffness: 280, damping: 26, mass: 0.6 });
  const ringY = useSpring(pointerY, { stiffness: 280, damping: 26, mass: 0.6 });

  // 缩放 / 透明度同样交给弹簧，hover、离开时都是平滑过渡
  const ringScale = useSpring(0.6, { stiffness: 320, damping: 22, mass: 0.5 });
  const dotScale = useSpring(1, { stiffness: 420, damping: 26, mass: 0.4 });
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
    style.textContent = HIDE_NATIVE_CURSOR_CSS;
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

  /* 4) 悬停 / 按下 → 外圈放大、内点缩没；目标带文字时再多留一点空间 */
  useEffect(() => {
    const hoverScale = label ? LABEL_HOVER_SCALE : HOVER_SCALE;
    if (pointerOver) {
      ringScale.set(pressed ? hoverScale * 0.88 : hoverScale);
    } else {
      ringScale.set(pressed ? 0.82 : 1);
    }
    dotScale.set(pointerOver ? 0 : 1);
  }, [pointerOver, pressed, label, ringScale, dotScale]);

  /* 5) 鼠标移出窗口 → 整体淡出 */
  useEffect(() => {
    cursorOpacity.set(visible ? 1 : 0);
  }, [visible, cursorOpacity]);

  // 不支持的设备什么都不渲染，也就不会挂上任何全局样式
  if (!supported) return null;

  const ringBox: React.CSSProperties = {
    width: RING_SIZE,
    height: RING_SIZE,
    marginLeft: -RING_SIZE / 2,
    marginTop: -RING_SIZE / 2,
    border: "1.5px solid #ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const dotBox: React.CSSProperties = {
    width: DOT_SIZE,
    height: DOT_SIZE,
    marginLeft: -DOT_SIZE / 2,
    marginTop: -DOT_SIZE / 2,
    backgroundColor: "#ffffff",
  };

  return createPortal(
    <>
      {/* 外圈：由弹簧驱动的延迟跟随；悬停时填成白色 */}
      <motion.div
        aria-hidden="true"
        initial={false}
        animate={{
          backgroundColor: pointerOver ? "#ffffff" : "rgba(255, 255, 255, 0)",
        }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        style={{
          ...CURSOR_BASE_STYLE,
          ...ringBox,
          x: ringX,
          y: ringY,
          scale: ringScale,
          opacity: cursorOpacity,
        }}
      >
        {label ? (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            style={{
              // 白底上的黑色像素会被 difference 保留为背景色 → 「白底黑字」
              color: "#000000",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.6,
              whiteSpace: "nowrap",
              userSelect: "none",
              // 反向缩放：抵消外圈的放大，让文字保持原本大小
              scale: 1 / LABEL_HOVER_SCALE,
            }}
          >
            {label}
          </motion.span>
        ) : null}
      </motion.div>

      {/* 内点：不吃弹簧，零延迟跟手 */}
      <motion.div
        aria-hidden="true"
        style={{
          ...CURSOR_BASE_STYLE,
          ...dotBox,
          x: pointerX,
          y: pointerY,
          scale: dotScale,
          opacity: cursorOpacity,
        }}
      />
    </>,
    document.body
  );
}

export default CustomCursor;
