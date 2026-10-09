/**
 * 滚动镜头（GSAP ScrollTrigger）的**纯逻辑**部分：参数收敛 + 时间线数据
 * ==========================================================================
 * 为什么要把「时间线」抽成纯函数返回的**普通对象**：
 *   1) gsap 只在真正要跑的时候动态 import —— 测试环境（jsdom）里没有 gsap
 *      也不会失败，仍然能断言「推近多少、钉多久、第二屏从多远进来」这些手感参数；
 *   2) 手感是这个阶段的核心资产：把它做成可断言的数字，回归时一眼能看出被动过。
 *
 * 镜头语言（首屏 → 第二屏）：
 *   hero  钉住 pinScreens 屏，期间沿 Z 轴推近 zoom 倍、纵向漂移 lift、末段淡出；
 *   next  从「远处 + 略小 + 透明」滑到位，所以第二屏是**被镜头带进来**的；
 *   title 大标题额外沿 Z 轴前移 titleDepth —— 同一块屏里出现层差 = 3D 排字。
 */

/** 收敛后的 cinema 参数 */
export type CinemaConfig = {
  enabled: boolean;
  pinScreens: number;
  zoom: number;
  lift: number;
  fade: boolean;
  titleDepth: number;
};

export const CINEMA_DEFAULTS = {
  enabled: true,
  pinScreens: 1.15,
  zoom: 1.34,
  lift: -0.16,
  fade: true,
  titleDepth: 88,
} as const;

/** 低于这个宽度不钉住：手机地址栏会改视口高度，钉住容易抖（与 Stage3D 同一门槛） */
export const CINEMA_MIN_WIDTH = 768;

/** 数值收敛：缺项 / 空值按「没写」处理（用 fallback），写坏的数值退回 fallback，再夹进 [min, max] */
function num(value: unknown, fallback: number, min: number, max: number): number {
  // ⚠️ 别把 null / "" 交给 Number()：结果是 0，会悄悄变成「钉 0 屏」「不推近」这类合法但没意义的值
  if (value === null || value === undefined || value === "") return fallback;
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

export function readCinemaConfig(raw: unknown): CinemaConfig {
  const cfg = (raw || {}) as Partial<Record<keyof CinemaConfig, unknown>>;
  return {
    enabled: cfg.enabled !== false,
    pinScreens: num(cfg.pinScreens, CINEMA_DEFAULTS.pinScreens, 0, 4),
    // 推近小于 1 会变成「拉远」，那就不叫镜头进入场景了，所以下限锁 1
    zoom: num(cfg.zoom, CINEMA_DEFAULTS.zoom, 1, 2.2),
    lift: num(cfg.lift, CINEMA_DEFAULTS.lift, -1, 1),
    fade: cfg.fade !== false,
    titleDepth: num(cfg.titleDepth, CINEMA_DEFAULTS.titleDepth, 0, 400),
  };
}

/** 钉住（pin）的滚动距离（px）：屏数 × 视口高度 */
export function pinDistance(cfg: CinemaConfig, viewportHeight: number): number {
  const height = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800;
  return Math.round(cfg.pinScreens * height);
}

/** 这个视口要不要启用镜头（窄屏退回普通滚动） */
export function cinemaSupported(width: number): boolean {
  return Number.isFinite(width) && width >= CINEMA_MIN_WIDTH;
}

/**
 * 时间线数据（普通对象，直接喂给 gsap.to / fromTo）。
 * 全部用 ease: "none" —— 手感来自滚动位置本身（scrub），再加缓动就「糯」了。
 */
export function cinemaTimeline(cfg: CinemaConfig) {
  return {
    /** 首屏：推近 + 上飘 + 淡出 */
    hero: {
      scale: cfg.zoom,
      yPercent: cfg.lift * 100,
      opacity: cfg.fade ? 0 : 1,
      ease: "none" as const,
    },
    /** 第二屏：从远处进来（起点是下面这个 from） */
    nextFrom: { yPercent: 9, scale: 0.93, opacity: 0 },
    nextTo: { yPercent: 0, scale: 1, opacity: 1, ease: "none" as const },
    /** 大标题：沿 Z 轴前移（3D 排字） */
    title: { z: cfg.titleDepth, ease: "none" as const },
    /** scrub：跟随滚动的「软」程度（越大越跟手，0 = 完全同步） */
    scrub: 0.6,
    /** 第二屏比首屏早一点收尾：镜头还没停，画面已经就位 */
    nextRatio: 0.85,
  };
}
