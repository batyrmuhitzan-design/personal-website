import React, { useEffect } from "react";
import Lenis from "@studio-freight/lenis";
import profile from "../portfolio.config";

/**
 * 全局平滑滚动（Lenis）
 * ------------------------------------------------------------------
 * · 用 useEffect 初始化 Lenis、连上 rAF 循环，卸载时销毁实例并移除样式
 * · 参数（时长 / 缓动指数）从 portfolio.config 的 motion.lenis 读，改配置即可调手感
 * · 和 framer-motion 不冲突：Lenis 改的是「真实滚动位置」（window.scrollY），
 *   不是给内容容器套 transform，所以 useScroll / useTransform 量到的进度始终准确。
 *   （如果哪天把 Lenis 换成 transform 方案，framer-motion 的滚动测量才会开始飘）
 * · 内部滚动区域（例如播放器歌单）加 data-lenis-prevent 即可交还给原生滚动，
 *   Lenis 会沿事件 composedPath 向上查找该属性
 * · 没有 ResizeObserver 的环境（jsdom、老 Safari）自动回退到系统原生滚动，页面依然可用
 * · 是否接管只认站内开关 --motion-play-state，不认系统的 prefers-reduced-motion：
 *   站长这台机器的系统「动画效果」是关闭的（SPI_GETCLIENTAREAANIMATION = False），
 *   Chrome 因此一直上报 reduce —— 跟随系统就等于「平滑滚动永远不生效」。
 *   想跟随系统只改 src/index.css 里那一个变量，无需改本文件。
 */

/** 配置（都有默认值，配置缺字段也不会出事） */
const LENIS_CONFIG: { duration?: number; easingExponent?: number } =
  (profile && profile.motion && profile.motion.lenis) || {};

const LENIS_DURATION =
  typeof LENIS_CONFIG.duration === "number" ? LENIS_CONFIG.duration : 1.1;
const LENIS_EASING_EXPONENT =
  typeof LENIS_CONFIG.easingExponent === "number"
    ? LENIS_CONFIG.easingExponent
    : 4.2;

/** 缓动曲线：前段快、末段平滑收尾（指数越大收尾越「沉」） */
const makeEasing = (exponent: number) => (t: number) =>
  Math.min(1, 1.001 - Math.pow(2, -exponent * t));

/** Lenis 会在 <html> 上挂类名，这几条是它官方推荐的配套样式 */
const LENIS_CSS = `
html.lenis {
  height: auto;
}
.lenis.lenis-smooth {
  scroll-behavior: auto !important;
}
.lenis.lenis-smooth [data-lenis-prevent] {
  overscroll-behavior: contain;
}
.lenis.lenis-stopped {
  overflow: hidden;
}
`;

let lenisInstance: Lenis | null = null;

/** 给非 React 的场景（路由切换 / 锚点跳转）复用同一个实例 */
export function getLenis(): Lenis | null {
  return lenisInstance;
}

/** 回到顶部：Lenis 就绪时交给它，否则回退原生滚动 */
export function scrollToTop(immediate = true): void {
  if (lenisInstance) {
    lenisInstance.scrollTo(0, { immediate });
    return;
  }
  window.scrollTo(0, 0);
}

type SmoothScrollProps = {
  /** 可选：Lenis 作用于 window，本身不产生 DOM，包不包住页面都可以 */
  children?: React.ReactNode;
  /** 预加载遮罩（#no-scroll）期间可以暂不接管滚动，等页面真正可滚了再启动 */
  enabled?: boolean;
};

/** 站内「装饰性动效」总开关是否处于暂停（变量定义在 src/index.css） */
function motionPaused(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.getComputedStyle !== "function"
  ) {
    return false;
  }
  return (
    window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--motion-play-state")
      .trim() === "paused"
  );
}

/** 当前环境是否适合接管滚动 */
function canTakeOverScroll(): boolean {
  if (typeof window === "undefined") return false;
  // Lenis 内部靠 ResizeObserver 测量内容高度，没有它就别接管（否则状态会算错）
  if (typeof window.ResizeObserver !== "function") return false;
  // 惯性滚动属于「装饰性动效」：裁决权交给站内开关，理由见文件头
  if (motionPaused()) return false;
  return true;
}

function SmoothScroll({ children, enabled = true }: SmoothScrollProps) {
  useEffect(() => {
    if (!enabled || !canTakeOverScroll()) return undefined;

    const lenis = new Lenis({
      duration: LENIS_DURATION,
      easing: makeEasing(LENIS_EASING_EXPONENT),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
      gestureOrientation: "vertical",
      autoResize: true,
    });
    lenisInstance = lenis;

    const style = document.createElement("style");
    style.setAttribute("data-lenis-base", "true");
    style.textContent = LENIS_CSS;
    document.head.appendChild(style);

    // 官方推荐：用 rAF 驱动 lenis.raf，而不是 setInterval
    let frame = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      style.remove();
      if (lenisInstance === lenis) lenisInstance = null;
    };
  }, [enabled]);

  return <>{children}</>;
}

export default SmoothScroll;
