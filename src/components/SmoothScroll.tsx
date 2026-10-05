import React, { useEffect } from "react";
import Lenis from "@studio-freight/lenis";

/**
 * 全局平滑滚动（Lenis）
 * ------------------------------------------------------------------
 * · 用 useEffect 初始化 Lenis、连上 rAF 循环，卸载时销毁实例并移除样式
 * · 和 framer-motion 不冲突：Lenis 改的是「真实滚动位置」（window.scrollY），
 *   不是给内容容器套 transform，所以 useScroll / useTransform 量到的进度始终准确。
 *   （如果哪天把 Lenis 换成 transform 方案，framer-motion 的滚动测量才会开始飘）
 * · 内部滚动区域（例如播放器歌单）加 data-lenis-prevent 即可交还给原生滚动，
 *   Lenis 会沿事件 composedPath 向上查找该属性
 * · 没有 ResizeObserver 的环境（jsdom、老 Safari）或用户开启「减少动态效果」时，
 *   自动回退到系统原生滚动，页面依然可用
 */

/** 缓动曲线：前段快、末段平滑收尾 */
const easing = (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t));

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

/** 当前环境是否适合接管滚动 */
function canTakeOverScroll(): boolean {
  if (typeof window === "undefined") return false;
  // Lenis 内部靠 ResizeObserver 测量内容高度，没有它就别接管（否则状态会算错）
  if (typeof window.ResizeObserver !== "function") return false;
  // 尊重系统「减少动态效果」：惯性滚动本身就是一种动态效果
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return false;
  }
  return true;
}

function SmoothScroll({ children, enabled = true }: SmoothScrollProps) {
  useEffect(() => {
    if (!enabled || !canTakeOverScroll()) return undefined;

    const lenis = new Lenis({
      duration: 1.1,
      easing,
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
