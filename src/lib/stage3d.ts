/**
 * 3D 背景的「纯逻辑」部分（不含 three，也不碰 DOM —— 便于在 jsdom 里直接测）
 * ==========================================================================
 * 这里只做三件事，且全是纯函数：
 *   1) 把 portfolio.config 的 stage3d 段收敛成**可信**的参数（缺项 / NaN / 越界
 *      都收进安全区），3D 渲染层拿到的永远是干净数值；
 *   2) 把「滚动进度 0~1」映射成**镜头姿态**（z / 俯仰 / 自转 / 淡出）——
 *      镜头运动是这个阶段的灵魂，把它做成纯函数就能被断言（端点、单调性）；
 *   3) 生成粒子场的两个位姿：**散开态**（开场球壳）与**成形态**（隧道点阵），
 *      以及开场插值曲线。
 *
 * 为什么不用 three 现成的粒子/曲线：这点几何量（几百个点）自己算反而更可控，
 * 也避免把「手感」藏在别人的黑盒里 —— 想调只要改这几个数。
 */

/** 收敛后的 stage3d 参数 */
export type Stage3dConfig = {
  enabled: boolean;
  grid: number;
  span: number;
  depth: number;
  pixelRatio: number;
  cameraZ: number;
  travel: number;
  tilt: number;
  spin: number;
  introMs: number;
  opacityLight: number;
  opacityDark: number;
  ring: boolean;
};

/** 缺省值：与 portfolio.config.js 里的注释一一对应 */
export const STAGE_DEFAULTS = {
  enabled: true,
  grid: 26,
  span: 44,
  depth: 92,
  pixelRatio: 1.5,
  cameraZ: 16,
  travel: 34,
  tilt: 0.16,
  spin: 0.24,
  introMs: 1500,
  opacityLight: 0.4,
  opacityDark: 0.58,
  ring: true,
} as const;

/** 数值收敛：缺项 / 空值按「没写」处理（用 fallback），写坏的数值退回 fallback，再夹到 [min, max] */
function num(value: unknown, fallback: number, min: number, max: number): number {
  // ⚠️ 别把 null / "" 交给 Number()：结果是 0，会悄悄变成「0 点粒子」「DPR 0」这类合法但没意义的值
  if (value === null || value === undefined || value === "") return fallback;
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/**
 * 读配置 → 可信参数。
 * 上界都是「别把显卡/CPU 拖垮」的硬门槛：grid 最大 64（4096 点）、
 * pixelRatio 最大 2（4K 屏上也不爆），其余同理。
 */
export function readStageConfig(raw: unknown): Stage3dConfig {
  const cfg = (raw || {}) as Partial<Record<keyof Stage3dConfig, unknown>>;
  return {
    enabled: cfg.enabled !== false,
    grid: Math.round(num(cfg.grid, STAGE_DEFAULTS.grid, 4, 64)),
    span: num(cfg.span, STAGE_DEFAULTS.span, 4, 120),
    depth: num(cfg.depth, STAGE_DEFAULTS.depth, 4, 400),
    pixelRatio: num(cfg.pixelRatio, STAGE_DEFAULTS.pixelRatio, 0.5, 2),
    cameraZ: num(cfg.cameraZ, STAGE_DEFAULTS.cameraZ, 1, 200),
    travel: num(cfg.travel, STAGE_DEFAULTS.travel, 0, 400),
    tilt: num(cfg.tilt, STAGE_DEFAULTS.tilt, -1.4, 1.4),
    spin: num(cfg.spin, STAGE_DEFAULTS.spin, -3.2, 3.2),
    introMs: num(cfg.introMs, STAGE_DEFAULTS.introMs, 0, 6000),
    opacityLight: num(cfg.opacityLight, STAGE_DEFAULTS.opacityLight, 0, 1),
    opacityDark: num(cfg.opacityDark, STAGE_DEFAULTS.opacityDark, 0, 1),
    ring: cfg.ring !== false,
  };
}

/** 当前主题下的整体不透明度（深色主题可以更亮：黑底不怕压文字） */
export function stageOpacity(cfg: Stage3dConfig, isDark: boolean): number {
  return isDark ? cfg.opacityDark : cfg.opacityLight;
}

/** 镜头姿态：滚动进度 → 相机 z、俯仰、自转、整体淡出 */
export type CameraPose = { z: number; tilt: number; spin: number; fade: number };

/**
 * 镜头推近的映射：
 *   z     从 cameraZ 一路推进 travel（越滚越「进隧道」）；
 *   tilt  走一条 sin 曲线（0 → 峰值 → 0），中段轻微俯视，两端归零，
 *         这样首屏与文末都不歪，只有「穿梭途中」才有角度；
 *   spin  单调递增（整段滚动转 spin 弧度），慢且不回头；
 *   fade  头 12% 淡入、尾 12% 淡出（进出场都不硬切）。
 */
export function cameraPose(progress: number, cfg: Stage3dConfig): CameraPose {
  const t = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const fade = Math.min(1, Math.min(t / 0.12, (1 - t) / 0.12));
  return {
    z: cfg.cameraZ - cfg.travel * t,
    tilt: cfg.tilt * Math.sin(Math.PI * t),
    spin: cfg.spin * t,
    fade: Math.min(1, Math.max(0, fade)),
  };
}

/** 开场插值：0 = 还在散开态，1 = 已成阵（先快后慢，收尾干净） */
export function introEase(progress: number): number {
  const t = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return 1 - Math.pow(1 - t, 3);
}

/** 确定性伪随机（LCG）：同一份配置每次刷新得到的粒子布局完全一致，便于截图对比 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 粒子场的两个位姿：成形态（隧道点阵）与散开态（开场球壳） */
export type PointField = {
  /** 点数（= grid²） */
  count: number;
  /** 成形态坐标（xyz 连续排列） */
  formed: Float32Array;
  /** 散开态坐标（开场从这里汇聚过去） */
  scattered: Float32Array;
};

/**
 * 生成点阵：把点铺在一段**圆柱面**上，就成了「隧道」。
 *   · 环向：grid 等分圆周（半径 span/2）；
 *   · 纵向：grid 等分深度 depth，z 从 -depth/2 到 +depth/2；
 *   · 半径带一点确定性抖动 —— 完全整齐的圆环看起来像「塑料管」，
 *     抖动 8% 才像实拍里的星尘。
 * 散开态：同一批点放到半径 ×2.6~×3.4 的球壳上（角度沿用环向角，只是拉远），
 * 于是开场时「所有点从远处汇成一个隧道」，而不是乱飞。
 */
export function buildPointField(cfg: Stage3dConfig, seed = 20240718): PointField {
  const count = cfg.grid * cfg.grid;
  const formed = new Float32Array(count * 3);
  const scattered = new Float32Array(count * 3);
  const random = makeRandom(seed);
  const radius = cfg.span / 2;

  for (let ring = 0; ring < cfg.grid; ring += 1) {
    const angle = (ring / cfg.grid) * Math.PI * 2;
    for (let step = 0; step < cfg.grid; step += 1) {
      const index = (ring * cfg.grid + step) * 3;
      const jitter = 0.92 + random() * 0.16; // 半径 ±8%
      const r = radius * jitter;
      const z = (step / (cfg.grid - 1) - 0.5) * cfg.depth;
      formed[index] = Math.cos(angle) * r;
      formed[index + 1] = Math.sin(angle) * r * 0.62; // 压扁一点 = 宽银幕感
      formed[index + 2] = z;

      const far = r * (2.6 + random() * 0.8);
      scattered[index] = Math.cos(angle) * far;
      scattered[index + 1] = Math.sin(angle) * far * 0.62;
      scattered[index + 2] = z * 1.4 + (random() - 0.5) * cfg.depth * 0.3;
    }
  }

  return { count, formed, scattered };
}

/** 把「散开 → 成形」写进渲染用的坐标缓冲（就地改写，避免每帧新建数组） */
export function writeIntroFrame(
  target: Float32Array,
  field: PointField,
  amount: number
): Float32Array {
  const t = Math.min(1, Math.max(0, amount));
  for (let i = 0; i < target.length; i += 1) {
    target[i] = field.scattered[i] + (field.formed[i] - field.scattered[i]) * t;
  }
  return target;
}
