import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, useSpring } from "framer-motion";
import profile from "../portfolio.config";
import CursorCartoon from "./CursorCartoon";
import { PixelCharacter, SpriteImage } from "./CursorSprite";
import { ACTIVE_CLASS, CURSOR_CSS } from "./cursorStyles";

/**
 * 自定义光标 · 多皮肤（pixel 像素小人 / cartoon 卡通小人）
 * ==========================================================================
 * 隐藏系统默认光标，改由两个 DOM 层绘制：
 *
 * ① 主角（在前）—— 皮肤由 portfolio.config 的 cursor.skin 决定：
 *     ‣ pixel  ：内置「赛博像素小人」（内联 SVG，12×16 格，crispEdges），
 *                 或站长自己的 PNG / GIF / SVG（cursor.spriteUrl）；
 *                 常态：像素呼吸浮动 + 天线闪烁（CSS steps，一格一格跳）；
 *                 悬停可点击元素：放大 + 轻微旋转 + 护目镜 / 天线反相；
 *                 按下：缩一下并反向轻转。
 *     ‣ cartoon：手绘矢量卡通小人（原有皮肤，保留）；眨眼 / 挥手 / 咧嘴 / 眯眼。
 *     x / y 各挂一条弹簧（useSpring(useMotionValue)）→ 被「拖着走」的延迟感；
 *     悬停 / 按下 / 旋转 / 透明度同样是弹簧，且全部由注入的 CSS 驱动，
 *     鼠标移动不会触发任何 React 重渲染。
 *
 * ② 小箭头（在后）—— 直接吃原始 motion value：零延迟跟手、尖端严格咬住鼠标坐标，
 *    保证「指哪点哪」的精度不被弹簧拖累。
 *
 * 其余约定：
 * · 颜色只走设计令牌（--accent / --bg-primary / --text-primary）与光标的角色变量
 *   （--cur-px-*），深浅主题自动反相，任何背景上都自带反差轮廓；
 * · 用 createPortal 挂到 document.body：避免祖先的 transform / filter 让
 *   position: fixed 失效，或把绘制限制在某个局部层里；
 * · 触屏 / 不支持 hover 的设备（matchMedia("(hover: hover) and (pointer: fine)")）
 *   直接不渲染 —— 移动端保持系统原生光标与触摸手感；
 * · 输入框 / textarea / select / [contenteditable] / [data-cursor="native"] 会
 *   交还系统光标（CSS 还原 cursor: auto，两层同时淡出），文本插入点体验不受影响；
 * · 装饰性动效的播放 / 暂停统一交给站内开关 --motion-play-state（见 src/index.css），
 *   刻意不跟系统的 prefers-reduced-motion（站长机器的系统动画是关闭的，
 *   跟随系统 = 光标永不呼吸），想跟随系统只改 index.css 那一个变量。
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

/** 需要「交还系统光标」的元素：输入类控件用文本光标才有插入点体验 */
const NATIVE_CURSOR_SELECTOR = [
  "input",
  "textarea",
  "[contenteditable='true']",
  "[data-cursor='native']",
].join(",");

const FIGURE_WIDTH = 26; // 卡通小人显示宽度（px）；viewBox 为 44×52，等比高度见下
const FIGURE_HEIGHT = Math.round((FIGURE_WIDTH * 52) / 44); // ≈ 31px
const PIXEL_WIDTH = 30; // 像素小人显示宽度（px）；viewBox 为 12×16，等比高度见下
const PIXEL_HEIGHT = Math.round((PIXEL_WIDTH * 16) / 12); // 40px
const FIGURE_OFFSET_Y = 8; // 小人整体下移：鼠标点落在它头顶上方，不遮挡点击目标
const POINTER_WIDTH = 12; // 小箭头：viewBox 尖端在左上角 (0,0)，因此箭头严格咬住鼠标坐标
const POINTER_HEIGHT = 19;
const OVER_SCALE = 1.14; // 悬停可点击元素时小人的放大倍数
const PRESS_SCALE = 0.9; // 按下鼠标时小人缩一下
const OVER_TILT = 8; // 悬停可点击元素时的轻微旋转（deg）
const PRESS_TILT = -4; // 按下时的反向旋转（deg），配合缩放做出「压下去」的手感

/** 光标皮肤：默认取 portfolio.config 的 cursor.skin */
export type CursorSkin = "pixel" | "cartoon";

/** 配置读取（每一项都有默认值，配置里缺字段也不会出事）
    注意 skin 这里故意声明成 string：portfolio.config.js 是 JS，
    字面量会被推断成 string，所以「收进来再收窄」，而不是直接断言成 CursorSkin */
const CURSOR_CONFIG: {
  enabled?: boolean;
  skin?: string;
  spriteUrl?: string;
  spriteWidth?: number;
  tilt?: number;
} = (profile && profile.cursor) || {};

const DEFAULT_SKIN: CursorSkin =
  CURSOR_CONFIG.skin === "cartoon" ? "cartoon" : "pixel";
const DEFAULT_SPRITE_URL = CURSOR_CONFIG.spriteUrl || "";
const DEFAULT_SPRITE_WIDTH = CURSOR_CONFIG.spriteWidth || PIXEL_WIDTH;
const DEFAULT_TILT =
  typeof CURSOR_CONFIG.tilt === "number" ? CURSOR_CONFIG.tilt : OVER_TILT;
/** 配置里 cursor.enabled === false 时整个光标不启用（回落到系统光标） */
const CURSOR_ENABLED = CURSOR_CONFIG.enabled !== false;

/** 两层共用的定位样式 */
const CURSOR_BASE_STYLE: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  pointerEvents: "none",
  willChange: "transform",
  zIndex: 2147483647,
};

type CustomCursorProps = {
  /** 皮肤；不传则用配置里的默认值 */
  skin?: CursorSkin;
  /**
   * 自定义精灵：支持 PNG / GIF / SVG 的 URL（既可 import 资源，也可写 public 路径）。
   * 传了它优先于内置像素小人 —— 换成站长自己的像素图案 / 动图就靠这个。
   */
  spriteUrl?: string;
  /** 精灵宽度（px），高度按图案比例自动算 */
  spriteWidth?: number;
  /** 悬停到可点击元素时的旋转角度（deg），0 = 不旋转 */
  tilt?: number;
};

function CustomCursor({
  skin = DEFAULT_SKIN,
  spriteUrl = DEFAULT_SPRITE_URL,
  spriteWidth,
  tilt = DEFAULT_TILT,
}: CustomCursorProps) {
  const [supported, setSupported] = useState(false); // 当前设备是否启用自定义光标
  const [visible, setVisible] = useState(false); // 鼠标是否停在窗口内
  const [pointerOver, setPointerOver] = useState(false); // 是否悬停在可点击元素上
  const [pressed, setPressed] = useState(false); // 是否按下鼠标
  const [nativeZone, setNativeZone] = useState(false); // 是否悬停在「交还系统光标」的控件上
  const [label, setLabel] = useState(""); // 目标元素上的 data-cursor-text

  /* ---- motion value：位置与形变都走它，鼠标移动不进入 React 渲染 ---- */
  const pointerX = useMotionValue(-100);
  const pointerY = useMotionValue(-100);

  // 小人：两轴各一条弹簧 → 延迟跟随（箭头的跟手精度由原始坐标保证）
  const figureX = useSpring(pointerX, { stiffness: 280, damping: 26, mass: 0.6 });
  const figureY = useSpring(pointerY, { stiffness: 280, damping: 26, mass: 0.6 });

  // 缩放 / 旋转 / 透明度同样交给弹簧，hover、按下、离开时都是平滑过渡
  const figureScale = useSpring(0.6, { stiffness: 320, damping: 22, mass: 0.5 });
  const figureRotate = useSpring(0, { stiffness: 260, damping: 24, mass: 0.5 });
  const cursorOpacity = useSpring(0, { stiffness: 300, damping: 30, mass: 0.4 });

  /* ref：记录原始坐标与可见性，供滚动重算 / 事件回调使用，不参与渲染 */
  const visibleRef = useRef(false);
  const pointRef = useRef({ x: -100, y: -100 });

  /* 1) 能力检测：只有「精确指针 + 支持 hover」且配置未关闭时才启用 */
  useEffect(() => {
    if (!CURSOR_ENABLED || typeof window.matchMedia !== "function") {
      setSupported(false);
      return undefined;
    }
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setSupported(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /* 2) 启用时注入「隐藏系统光标 + 皮肤动画」的样式并给 <html> 打标记，卸载时完整还原 */
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
      // 输入类控件优先级最高：交还系统光标，并让两层淡出
      if (element && element.closest(NATIVE_CURSOR_SELECTOR)) {
        setNativeZone(true);
        setPointerOver(false);
        setLabel("");
        return;
      }
      setNativeZone(false);
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
      setNativeZone(false);
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

  /* 4) 悬停 / 按下 → 放大 + 轻微旋转；按下时缩小并反向轻转（表情 / 反相交给注入的 CSS 类） */
  useEffect(() => {
    if (pressed) {
      figureScale.set(pointerOver ? OVER_SCALE * 0.94 : PRESS_SCALE);
      figureRotate.set(pointerOver ? tilt : PRESS_TILT);
      return;
    }
    figureScale.set(pointerOver ? OVER_SCALE : 1);
    figureRotate.set(pointerOver ? tilt : 0);
  }, [pointerOver, pressed, figureScale, figureRotate, tilt]);

  /* 5) 鼠标移出窗口 / 悬停在输入类控件上 → 整体淡出（交还系统光标） */
  useEffect(() => {
    cursorOpacity.set(visible && !nativeZone ? 1 : 0);
  }, [visible, nativeZone, cursorOpacity]);

  // 不支持的设备什么都不渲染，也就不会挂上任何全局样式
  if (!supported) return null;

  const isPixel = skin === "pixel";
  const pixelSpriteWidth = spriteWidth || DEFAULT_SPRITE_WIDTH;
  const figureWidth = isPixel ? pixelSpriteWidth : FIGURE_WIDTH;
  /* 像素精灵按内置图案的比例（PIXEL_WIDTH : PIXEL_HEIGHT = 12 : 16）算高度；
     自定义精灵同样先按这个比例占位，图片本身用 height: auto，不会被拉变形 */
  const figureHeight = isPixel
    ? Math.round((figureWidth * PIXEL_HEIGHT) / PIXEL_WIDTH)
    : FIGURE_HEIGHT;

  const figureClassName =
    "cur-figure-wrap cur-figure-wrap--" +
    skin +
    (pointerOver ? " cur--over" : "") +
    (pressed ? " cur--press" : "") +
    (nativeZone ? " cur--native" : "");

  return createPortal(
    <>
      {/* ① 主角：弹簧驱动的延迟跟随（被「拖着走」的感觉）+ data-cursor-text 气泡 */}
      <motion.div
        aria-hidden="true"
        className={figureClassName}
        style={{
          ...CURSOR_BASE_STYLE,
          width: figureWidth,
          height: figureHeight,
          marginLeft: -figureWidth / 2,
          marginTop: FIGURE_OFFSET_Y,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          x: figureX,
          y: figureY,
          scale: figureScale,
          rotate: figureRotate,
          opacity: cursorOpacity,
        }}
      >
        {isPixel ? (
          <div className="cur-pixel-wrap">
            {spriteUrl ? (
              <SpriteImage url={spriteUrl} width={pixelSpriteWidth} />
            ) : (
              <PixelCharacter width={pixelSpriteWidth} />
            )}
            {label ? <span className="cur-label">{label}</span> : null}
          </div>
        ) : (
          <>
            <CursorCartoon />
            {label ? <span className="cur-label">{label}</span> : null}
          </>
        )}
      </motion.div>

      {/* ② 小箭头：不吃弹簧，尖端严格咬住鼠标坐标（保证「指哪点哪」的精度） */}
      <motion.div
        aria-hidden="true"
        className="cur-arrow"
        style={{
          ...CURSOR_BASE_STYLE,
          width: POINTER_WIDTH,
          height: POINTER_HEIGHT,
          x: pointerX,
          y: pointerY,
          opacity: cursorOpacity,
        }}
      >
        <svg
          viewBox="0 0 12 19"
          width={POINTER_WIDTH}
          height={POINTER_HEIGHT}
          aria-hidden="true"
          focusable="false"
        >
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
