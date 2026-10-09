import React, { useEffect } from "react";
import Lenis from "@studio-freight/lenis";
import profile from "../portfolio.config";

/**
 * 全局平滑滚动（Lenis）
 * ------------------------------------------------------------------
 * · 用 useEffect 初始化 Lenis、连上 rAF 循环，卸载时销毁实例并移除样式
 * · 参数（duration / easing / 滚轮与触屏倍率 / syncTouch …）全部从
 *   portfolio.config 的 motion.lenis 读，改配置即可调手感；
 *   lerp > 0 时改用「固定插值」，此时忽略 duration/easing（Lenis 自身行为）
 * · 两端手感是两件事叠加，缺一不可（改这两处时都别退回去）：
 *   ① 曲线末端的「台阶」—— 见下面 makeEasing 的长注释，这是「顿一下再拉满」的主因；
 *   ② 浏览器的滚动链 —— Chrome 到边界会继续把滚动传给父级/浏览器层（橡皮筋 +
 *      下拉刷新），表现也是顶端底端突然一顿，由注入的 overscroll-behavior: none 掐断。
 *      @studio-freight/lenis@1.0.42 的 options 里**没有** overscroll 这一项
 *      （已核对 dist/lenis.mjs 的默认参数表：wrapper/content/eventsTarget/
 *      smoothWheel/syncTouch/syncTouchLerp/touchInertiaMultiplier/duration/easing/
 *      lerp/infinite/orientation/gestureOrientation/touchMultiplier/wheelMultiplier/
 *      autoResize/__experimental__naiveDimensions），所以边界那一层只能由 CSS 来做。
 * · 和 framer-motion 不冲突：Lenis 改的是「真实滚动位置」（window.scrollY），
 *   不是给内容容器套 transform，所以 useScroll / useTransform 量到的进度始终准确。
 *   （如果哪天把 Lenis 换成 transform 方案，framer-motion 的滚动测量才会开始飘）
 * · 内部滚动区域（例如播放器歌单）加 data-lenis-prevent 即可交还给原生滚动，
 *   Lenis 会沿事件 composedPath 向上查找该属性
 * · 没有 ResizeObserver 的环境（jsdom、老 Safari）自动回退到系统原生滚动，页面依然可用
 * · 不做「动效总开关」判断：惯性滚动是页面的基本手感，被一个变量拦住时，
 *   表现就是「滚轮一格一格硬跳」。需要静音时用 prefers-reduced-motion 的 CSS 分支
 *   （见 src/index.css），而不是让 JS 把平滑滚动关掉。
 */

/** 配置（都有默认值，配置缺字段也不会出事） */
const LENIS_CONFIG: {
  duration?: number;
  easingExponent?: number;
  wheelMultiplier?: number;
  touchMultiplier?: number;
  syncTouch?: boolean;
  syncTouchLerp?: number;
  touchInertiaMultiplier?: number;
  /** 填了它就改用「固定插值」，忽略 duration/easing（Lenis 自身的行为） */
  lerp?: number;
} = (profile && profile.motion && profile.motion.lenis) || {};

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const LENIS_DURATION = num(LENIS_CONFIG.duration, 0.85);
const LENIS_EASING_EXPONENT = num(LENIS_CONFIG.easingExponent, 10);
const LENIS_WHEEL_MULTIPLIER = num(LENIS_CONFIG.wheelMultiplier, 1);
const LENIS_TOUCH_MULTIPLIER = num(LENIS_CONFIG.touchMultiplier, 1.6);
const LENIS_SYNC_TOUCH = LENIS_CONFIG.syncTouch === true;
const LENIS_SYNC_TOUCH_LERP = num(LENIS_CONFIG.syncTouchLerp, 0.11);
const LENIS_TOUCH_INERTIA = num(LENIS_CONFIG.touchInertiaMultiplier, 28);
/** 0 / 未配置 = 用 duration 曲线；> 0 = 用固定插值（每帧追当前差值的百分比） */
const LENIS_LERP = num(LENIS_CONFIG.lerp, 0);

/**
 * 缓动曲线：前段快、末段平滑收尾（指数越大收尾越「沉」）
 * ---------------------------------------------------------------------------
 * ⚠️ 「划到顶部 / 底部会顿一下再猛地拉满」的根因就在这条曲线，别再写成
 *    `Math.min(1, 1.001 - Math.pow(2, -exponent * t))`（网上到处抄的 Lenis 示例）：
 *
 *   1) `1.001` 那个「加料」只在指数 ≈ 10 时成立 —— t=1 时 2^-10 ≈ 0.00098，
 *      1.001 - 0.00098 ≈ 1，正好把曲线顶到 1。指数 3.6 时 t=1 只有 0.9185，
 *      也就是**曲线在中段就饱和了**：末端 8% 的时长里只走 0.4% 的距离；
 *   2) 而 Lenis 的 Animate.advance（node_modules/@studio-freight/lenis/dist/
 *      lenis.mjs）在进度到 1 时根本不看曲线：
 *          const s = clamp(0, this.currentTime / this.duration, 1);
 *          const o = s >= 1 ? 1 : this.easing(s);   // ← 直接取 1
 *          this.value = this.from + (this.to - this.from) * o;
 *      于是「曲线的最后一帧」与「钳到 1」之间就多出一段台阶：松手后先是几乎
 *      不动，随后 1~2 帧被拉到位 —— 400px 的目标滚动 ≈ 35px 的瞬移，肉眼就是
 *      「顿一下然后拉满」；
 *   3) 还有一层放大：滚轮每个事件都会以 programmatic:false 重设 target 并
 *      fromTo 重启整条曲线（同文件 onVirtualScroll），所以曲线末端那段「几乎
 *      不动」的尾巴会被反复重播 —— 连续滚动时表现为「滚动总差一口气」的滞后感。
 *
 * 修法：去掉 `1.001` 偏移，直接用 `1 - 2^(-e·t)`：
 *   · t=1 时值为 0.99902，Lenis 钳到 1 只补 0.098% 的距离
 *     （400px → 0.4px，亚像素级，看不见台阶）；
 *   · 形状仍是「起步快、末段匀速收尾」，与官方默认手感同档。
 * 指数取 10（官方默认档）：t=0.5 已走完 96.9%，收尾约 0.4s —— 跟手但不毛躁。
 * 调小（<6）会重新长出「先停一下」的尾巴，调大（>14）则末段发飘。
 */
const makeEasing = (exponent: number) => (t: number) =>
  t >= 1 ? 1 : 1 - Math.pow(2, -exponent * t);

/**
 * Lenis 会在 <html> 上挂类名，这几条是它官方推荐的配套样式；
 * 最后一条 overscroll-behavior 是本项目额外加的，解决「触顶 / 触底硬顿挫」：
 *   · Chrome 到边界会触发「滚动链」（继续滚就带着父级/浏览器层一起动）与橡皮筋，
 *     表现就是顶端 / 底端突然一顿；
 *   · overscroll-behavior: none 把这条链掐断，到边界就是干净地停住；
 *   · @studio-freight/lenis@1.0.42 没有 overscroll 选项（已核对源码），
 *     所以这件事只能由 CSS 来做，而不是配置项。
 */
const LENIS_CSS = `
/* Lenis 官方推荐：接管后 <html> / <body> 的高度交给内容决定。
   body 也要写 —— 只写 html 时，某些浏览器仍把 body 按视口高度参与布局，
   边界处会「少一截 / 多一截」的可滚动高度。 */
html.lenis {
  height: auto;
}
html.lenis body {
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
html, body {
  overscroll-behavior-y: none;
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
  return true;
}

function SmoothScroll({ children, enabled = true }: SmoothScrollProps) {
  useEffect(() => {
    if (!enabled || !canTakeOverScroll()) return undefined;

    const lenis = new Lenis({
      /* lerp 与 duration 是「二选一」：Lenis 内部 lerp = !duration && 0.1，
         所以要么给 duration 曲线，要么给固定 lerp，别两个都当主角 */
      ...(LENIS_LERP > 0
        ? { lerp: LENIS_LERP }
        : { duration: LENIS_DURATION, easing: makeEasing(LENIS_EASING_EXPONENT) }),
      smoothWheel: true,
      wheelMultiplier: LENIS_WHEEL_MULTIPLIER,
      touchMultiplier: LENIS_TOUCH_MULTIPLIER,
      /* 触屏也走 Lenis 插值（配合上面注入的 overscroll-behavior: none，
         两端不再有橡皮筋式的硬顿挫） */
      syncTouch: LENIS_SYNC_TOUCH,
      syncTouchLerp: LENIS_SYNC_TOUCH_LERP,
      touchInertiaMultiplier: LENIS_TOUCH_INERTIA,
      gestureOrientation: "vertical",
      /* 不吃「无限滚动」：到底就是到底，顶部/底部不会绕回，符合个人主页的阅读预期 */
      infinite: false,
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
