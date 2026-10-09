import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, useSpring } from "framer-motion";
import profile from "../portfolio.config";
import CursorCartoon from "./CursorCartoon";
import { PixelArrow, PixelCharacter, SpriteImage } from "./CursorSprite";
import { findCharacter, pickRandomCharacter, PIXEL_CHARACTERS } from "../lib/pixelArt";
import { ACTIVE_CLASS, CURSOR_CSS } from "./cursorStyles";

/**
 * 自定义光标 · 像素箭头 + 随机像素小人
 * ==========================================================================
 * 隐藏系统默认光标，改由两个 DOM 层绘制（都挂 createPortal 到 body）：
 *
 * ① 像素箭头（图层一 · 精准定位）—— 图案是 pixelArt 的 PIXEL_ARROW，
 *    尖端就在矩阵 (0,0)，盒子左上角严格咬住鼠标坐标 → 「指哪点哪」；
 *    x / y 直接吃原始 motion value，**零弹簧零延迟**，鼠标动一格它动一格。
 *    悬停在输入类控件上时，箭头淡出、换成一根像素竖线（.cur-caret）——
 *    原生文本光标已经被全局禁用，这里必须自己补一个插入点提示。
 *
 * ② 像素小人（图层二 · 个性）—— 也是零弹簧，和箭头同一帧跟手（从前是弹簧
 *    拖尾，鼠标停了它还在追，看着「不跟手」；现在只在悬停 / 按下时才有形变，
 *    位置永远 1:1）。皮肤来自 pixelArt 的 10 位角色：
 *    ‣ cursor.character 写 id 或序号 → 固定某一位；
 *    ‣ 否则 cursor.randomSkin（默认开）→ 每次刷新随机抽一位；
 *    ‣ 都关掉 → 第一位「赛博小人」。
 *    形变（放大 / 旋转 / 淡入淡出）仍走弹簧，那点惯性反而是「手感」。
 *
 * 其余约定：
 * · 颜色只走设计令牌与光标角色变量（--cur-px-*），深浅主题自动反相，
 *   任何背景上都自带反差描边（箭头是「黑边白箭头 / 白边黑箭头」）；
 * · 触屏 / 不支持 hover 的设备（matchMedia("(hover: hover) and (pointer: fine)")）
 *   直接不渲染 —— 移动端保持系统原生手感（那时箭头也没有意义）；
 * · 鼠标移动只写 motion value，不触发任何 React 重渲染（setState 只发生在
 *   悬停 / 按下 / 进文本区这类低频事件上）；
 * · 装饰性动效的播放 / 暂停统一交给站内开关 --motion-play-state（src/index.css），
 *   刻意不跟系统的 prefers-reduced-motion（站长机器的系统动画是关闭的，
 *   跟随系统 = 光标永不呼吸），想跟随系统只改 index.css 那一个变量。
 */

/**
 * 视为「可点击」的元素；额外支持用 data-cursor="pointer" 手动标记。
 * 说明：自绘下拉的选项按钮带 role="option"（不是 button），
 * 因此这里同时认 role="button" / role="option" / [data-cursor='pointer']。
 */
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "select",
  "summary",
  "label",
  "input[type='checkbox']",
  "input[type='radio']",
  "input[type='range']",
  "[role='button']",
  "[role='option']",
  "[role='menuitem']",
  "[data-cursor='pointer']",
].join(",");

/**
 * 「文本区」：光标进入这些元素时换成像素竖线。
 * 注意这不是「交还系统光标」—— 全局 cursor: none 依然生效，
 * 我们只是把箭头换成插入点提示，避免同一位置出现两个光标。
 */
const TEXT_ZONE_SELECTOR = [
  "input:not([type='checkbox']):not([type='radio']):not([type='range'])",
  "input:not([type])",
  "textarea",
  "[contenteditable='true']",
  "[data-cursor='text']",
].join(",");

const FIGURE_WIDTH = 26; // 卡通小人显示宽度（px）；viewBox 为 44×52，等比高度见下
const FIGURE_HEIGHT = Math.round((FIGURE_WIDTH * 52) / 44); // ≈ 31px
const PIXEL_WIDTH = 30; // 像素小人显示宽度（px）；viewBox 为 12×16，等比高度见下
const PIXEL_HEIGHT = Math.round((PIXEL_WIDTH * 16) / 12); // 40px
const FIGURE_OFFSET_Y = 8; // 小人整体下移：鼠标点落在它头顶上方，不遮挡点击目标
/* 像素箭头：图案 11 列 × 15 行，尖端在 (0,0)。
   13px 宽 → 高 = round(13 * 15 / 11) = 18px；方格约 1.18px，足够锐利又不顶眼 */
const ARROW_WIDTH = 13;
const ARROW_HEIGHT = Math.round((ARROW_WIDTH * 15) / 11);
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
  character?: string | number;
  randomSkin?: boolean;
  tilt?: number;
} = (profile && profile.cursor) || {};

const DEFAULT_SKIN: CursorSkin =
  CURSOR_CONFIG.skin === "cartoon" ? "cartoon" : "pixel";
const DEFAULT_SPRITE_URL = CURSOR_CONFIG.spriteUrl || "";
const DEFAULT_SPRITE_WIDTH = CURSOR_CONFIG.spriteWidth || PIXEL_WIDTH;
const DEFAULT_RANDOM_SKIN = CURSOR_CONFIG.randomSkin !== false;
const DEFAULT_TILT =
  typeof CURSOR_CONFIG.tilt === "number" ? CURSOR_CONFIG.tilt : OVER_TILT;
/** 配置里 cursor.enabled === false 时整个光标不启用（回落到系统光标） */
const CURSOR_ENABLED = CURSOR_CONFIG.enabled !== false;
/** 配置里固定了角色（id 或序号）就优先用它，且不再随机 */
const CONFIG_CHARACTER = findCharacter(CURSOR_CONFIG.character);

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
  /** 固定某一位内置角色（id 或序号），传了就不随机 */
  characterId?: string | number;
  /** 是否随机抽角色；不传则用配置里的 cursor.randomSkin（默认 true） */
  randomSkin?: boolean;
  /** 悬停到可点击元素时的旋转角度（deg），0 = 不旋转 */
  tilt?: number;
};

function CustomCursor({
  skin = DEFAULT_SKIN,
  spriteUrl = DEFAULT_SPRITE_URL,
  spriteWidth,
  characterId,
  randomSkin,
  tilt = DEFAULT_TILT,
}: CustomCursorProps) {
  const [supported, setSupported] = useState(false); // 当前设备是否启用自定义光标
  const [visible, setVisible] = useState(false); // 鼠标是否停在窗口内
  const [pointerOver, setPointerOver] = useState(false); // 是否悬停在可点击元素上
  const [pressed, setPressed] = useState(false); // 是否按下鼠标
  const [textZone, setTextZone] = useState(false); // 是否在输入框 / 可编辑区域内
  const [label, setLabel] = useState(""); // 目标元素上的 data-cursor-text

  /* ---- motion value：位置与形变都走它，鼠标移动不进入 React 渲染 ---- */
  const pointerX = useMotionValue(-100);
  const pointerY = useMotionValue(-100);

  /* 随机皮肤：只在挂载时抽一次（useState 的惰性初值），
     因此「每次刷新换一位」但在同一次访问里稳定 —— 不会因为重渲染换脸。 */
  const [randomCharacter] = useState(() =>
    pickRandomCharacter() || PIXEL_CHARACTERS[0]
  );

  /* 角色优先级：props.characterId > 配置 cursor.character > 随机 > 默认第一位 */
  const character = useMemo(() => {
    const fixed = findCharacter(characterId);
    if (fixed) return fixed;
    if (CONFIG_CHARACTER) return CONFIG_CHARACTER;
    const wantRandom = randomSkin === undefined ? DEFAULT_RANDOM_SKIN : randomSkin;
    return wantRandom ? randomCharacter : PIXEL_CHARACTERS[0];
  }, [characterId, randomSkin, randomCharacter]);

  /* 小人位置：直接用原始坐标（零弹簧）。
     从前这里各挂一条弹簧，鼠标停下后小人还在追，主观感受就是「不跟手」；
     现在位置和箭头同帧更新，只有「形变」保留惯性。 */
  const figureX = pointerX;
  const figureY = pointerY;

  // 缩放 / 旋转 / 透明度走弹簧：hover、按下、进出窗口时都是平滑过渡
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
      // 文本区优先级最高：箭头换成像素竖线、收起气泡、不再算「可点击悬停」
      if (element && element.closest(TEXT_ZONE_SELECTOR)) {
        setTextZone(true);
        setPointerOver(false);
        setLabel("");
        return;
      }
      setTextZone(false);
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
      setTextZone(false);
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

  /* 5) 鼠标移出窗口 → 整体淡出（文本区不再淡出：箭头换成竖线，照常可见） */
  useEffect(() => {
    cursorOpacity.set(visible ? 1 : 0);
  }, [visible, cursorOpacity]);

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

  /* 状态类挂在两层上：
     · 小人层要 cur--over / cur--press 驱动表情与反相；
     · 箭头层要 cur--over / cur--press / cur--text 驱动箭头反相、像素位移与竖线切换。 */
  const stateClasses =
    (pointerOver ? " cur--over" : "") +
    (pressed ? " cur--press" : "") +
    (textZone ? " cur--text" : "");

  const figureClassName =
    "cur-figure-wrap cur-figure-wrap--" + skin + stateClasses;
  const arrowClassName = "cur-arrow" + stateClasses;

  return createPortal(
    <>
      {/* ① 像素小人：位置零弹簧（与箭头同帧），形变走弹簧；data-cursor-text 气泡也在这层 */}
      <motion.div
        aria-hidden="true"
        className={figureClassName}
        data-cursor-character={isPixel ? character.id : undefined}
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
              <PixelCharacter width={pixelSpriteWidth} character={character} />
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

      {/* ② 像素箭头 + 像素竖线：尖端严格咬住鼠标坐标（保证「指哪点哪」的精度） */}
      <motion.div
        aria-hidden="true"
        className={arrowClassName}
        style={{
          ...CURSOR_BASE_STYLE,
          width: ARROW_WIDTH,
          height: ARROW_HEIGHT,
          x: pointerX,
          y: pointerY,
          opacity: cursorOpacity,
        }}
      >
        <PixelArrow width={ARROW_WIDTH} />
        {/* 文本区专用：原生文本光标已全局禁用，这里补一根会闪的像素竖线 */}
        <span className="cur-caret" />
      </motion.div>
    </>,
    document.body
  );
}

export default CustomCursor;
