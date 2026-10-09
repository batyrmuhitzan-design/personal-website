import {
  STAGE_DEFAULTS,
  buildPointField,
  cameraPose,
  introEase,
  readStageConfig,
  stageOpacity,
  writeIntroFrame,
} from "./stage3d";

/**
 * 3D 背景的纯逻辑测试（不引入 three、不碰 WebGL，因此在 jsdom 里可跑）
 * ------------------------------------------------------------------
 * 这一块的价值全在数值上：镜头怎么推、粒子怎么聚、不透明度给多少。
 * 所以测试只盯三件事 —— 端点、单调性、越界兜底：改参数时一眼看得出动过哪一项。
 */

const cfg = (patch = {}) => readStageConfig({ ...STAGE_DEFAULTS, ...patch });

describe("stage3d · 参数收敛", () => {
  test("配置整段缺失也用默认值", () => {
    expect(readStageConfig(undefined)).toEqual({ ...STAGE_DEFAULTS });
    expect(readStageConfig(null)).toEqual({ ...STAGE_DEFAULTS });
  });

  test("grid 取整并夹在 4~64（粒子数 = grid²，太大直接拖垮显卡）", () => {
    expect(cfg({ grid: 26.4 }).grid).toBe(26);
    expect(cfg({ grid: 2 }).grid).toBe(4);
    expect(cfg({ grid: 4096 }).grid).toBe(64);
  });

  test("DPR / 不透明度 / 开场时长都夹在安全区", () => {
    expect(cfg({ pixelRatio: 8 }).pixelRatio).toBe(2);
    expect(cfg({ pixelRatio: 0.1 }).pixelRatio).toBe(0.5);
    expect(cfg({ opacityLight: -1 }).opacityLight).toBe(0);
    expect(cfg({ opacityDark: 9 }).opacityDark).toBe(1);
    expect(cfg({ introMs: -100 }).introMs).toBe(0);
    expect(cfg({ introMs: 1e9 }).introMs).toBe(6000);
  });

  test("写坏的数值退回默认值（NaN 绝不进渲染循环）", () => {
    expect(cfg({ travel: "abc" }).travel).toBe(STAGE_DEFAULTS.travel);
    expect(cfg({ cameraZ: Number.NaN }).cameraZ).toBe(STAGE_DEFAULTS.cameraZ);
    expect(cfg({ tilt: Infinity }).tilt).toBe(STAGE_DEFAULTS.tilt);
  });

  test("null / 空串算「没写」：用默认值，而不是被 Number() 变成 0", () => {
    expect(cfg({ grid: null }).grid).toBe(STAGE_DEFAULTS.grid);
    expect(cfg({ cameraZ: "" }).cameraZ).toBe(STAGE_DEFAULTS.cameraZ);
    expect(cfg({ introMs: null }).introMs).toBe(STAGE_DEFAULTS.introMs);
  });

  test("enabled / ring 只有显式 false 才关", () => {
    expect(readStageConfig({}).enabled).toBe(true);
    expect(readStageConfig({ enabled: false }).enabled).toBe(false);
    expect(readStageConfig({}).ring).toBe(true);
    expect(readStageConfig({ ring: false }).ring).toBe(false);
  });
});

describe("stage3d · 主题不透明度", () => {
  test("深色主题更亮（黑底不怕压文字），浅色主题更克制（白底可读性优先）", () => {
    const config = cfg();
    expect(stageOpacity(config, false)).toBe(config.opacityLight);
    expect(stageOpacity(config, true)).toBe(config.opacityDark);
    expect(config.opacityDark).toBeGreaterThan(config.opacityLight);
  });
});

describe("stage3d · 镜头姿态（滚动进度 → 相机）", () => {
  const config = cfg();

  test("端点干净：开头正对、无自转；末尾推进 travel 并把俯仰收回", () => {
    const start = cameraPose(0, config);
    expect(start.z).toBe(config.cameraZ);
    expect(start.tilt).toBeCloseTo(0, 6);
    expect(start.spin).toBeCloseTo(0, 6);
    expect(start.fade).toBe(0);

    const end = cameraPose(1, config);
    expect(end.z).toBeCloseTo(config.cameraZ - config.travel, 6);
    expect(end.tilt).toBeCloseTo(0, 6);
    expect(end.spin).toBeCloseTo(config.spin, 6);
    expect(end.fade).toBe(0);
  });

  test("俯仰只有中段有（sin 曲线峰值在中点），此时完全可见", () => {
    const mid = cameraPose(0.5, config);
    expect(mid.z).toBeCloseTo(config.cameraZ - config.travel * 0.5, 6);
    expect(mid.tilt).toBeCloseTo(config.tilt, 6);
    expect(mid.spin).toBeCloseTo(config.spin * 0.5, 6);
    expect(mid.fade).toBe(1);
  });

  test("镜头一路只往前推、自转单调递增（不许回头）", () => {
    let previous = cameraPose(0, config);
    for (let i = 1; i <= 20; i += 1) {
      const pose = cameraPose(i / 20, config);
      expect(pose.z).toBeLessThan(previous.z);
      expect(pose.spin).toBeGreaterThan(previous.spin);
      previous = pose;
    }
  });

  test("进出场各 12% 淡入淡出：中间全不透明，两端不硬切", () => {
    expect(cameraPose(0.06, config).fade).toBeCloseTo(0.5, 6);
    expect(cameraPose(0.5, config).fade).toBe(1);
    expect(cameraPose(0.94, config).fade).toBeCloseTo(0.5, 6);
  });

  test("越界 / NaN 都能兜住，淡出值也不越界（浮点误差不许弄出负透明度）", () => {
    expect(cameraPose(-5, config).z).toBe(config.cameraZ);
    expect(cameraPose(5, config).z).toBeCloseTo(config.cameraZ - config.travel, 6);
    expect(cameraPose(Number.NaN, config).z).toBe(config.cameraZ);

    [-0.001, 0, 0.001, 0.999, 1, 1.001].forEach((t) => {
      const fade = cameraPose(t, config).fade;
      expect(fade).toBeGreaterThanOrEqual(0);
      expect(fade).toBeLessThanOrEqual(1);
    });
  });
});

describe("stage3d · 开场汇聚曲线", () => {
  test("0 → 0、1 → 1，先快后慢（启动就有反馈，收尾不拖）", () => {
    expect(introEase(0)).toBe(0);
    expect(introEase(1)).toBe(1);
    expect(introEase(0.5)).toBeGreaterThan(0.5); // 比线性快
    expect(introEase(0.5)).toBeCloseTo(0.875, 6);
  });

  test("单调递增且夹在 0~1（越界 / NaN 兜住）", () => {
    let previous = -1;
    for (let i = 0; i <= 10; i += 1) {
      const value = introEase(i / 10);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(introEase(-3)).toBe(0);
    expect(introEase(9)).toBe(1);
    expect(introEase(Number.NaN)).toBe(0);
  });
});

describe("stage3d · 点阵几何", () => {
  const config = cfg({ grid: 8, span: 20, depth: 40 });

  test("点数是 grid²，坐标缓冲按 xyz 连续排列", () => {
    const field = buildPointField(config);
    expect(field.count).toBe(64);
    expect(field.formed).toHaveLength(64 * 3);
    expect(field.scattered).toHaveLength(64 * 3);
  });

  test("确定性：同一份配置每次生成的点阵完全一致（否则截图对比不可信）", () => {
    const first = Array.from(buildPointField(config).formed);
    expect(Array.from(buildPointField(config).formed)).toEqual(first);
    // 换种子就该换布局，否则「seed」这个参数是假的
    expect(Array.from(buildPointField(config, 7).formed)).not.toEqual(first);
  });

  test("成形态铺在圆柱面上：z 在 ±depth/2 内，环向半径落在 span/2 的 ±8% 抖动带里", () => {
    const field = buildPointField(config);
    const base = config.span / 2;

    for (let i = 0; i < field.count; i += 1) {
      const x = field.formed[i * 3];
      const y = field.formed[i * 3 + 1];
      const z = field.formed[i * 3 + 2];
      const radius = Math.hypot(x, y / 0.62); // 反解纵向压扁，还原环向半径

      expect(Math.abs(z)).toBeLessThanOrEqual(config.depth / 2 + 1e-5);
      expect(radius).toBeLessThanOrEqual(base * 1.08 + 1e-4);
      expect(radius).toBeGreaterThanOrEqual(base * 0.92 - 1e-4);
    }
  });

  test("散开态一定在同一点的成形态之外（开场是「从远处汇聚」，不是乱飞）", () => {
    const field = buildPointField(config);

    for (let i = 0; i < field.count; i += 1) {
      const formedRadius = Math.hypot(field.formed[i * 3], field.formed[i * 3 + 1] / 0.62);
      const scatteredRadius = Math.hypot(field.scattered[i * 3], field.scattered[i * 3 + 1] / 0.62);
      expect(scatteredRadius).toBeGreaterThan(formedRadius);
    }
  });
});

describe("stage3d · 开场插值写入缓冲", () => {
  const config = cfg({ grid: 6, span: 10, depth: 20 });
  const field = buildPointField(config);

  test("0 = 完全散开，1 = 完全成阵，0.5 恰好取中，并且就地改写（返回同一个缓冲）", () => {
    const target = new Float32Array(field.count * 3);

    expect(writeIntroFrame(target, field, 0)).toBe(target);
    expect(Array.from(target)).toEqual(Array.from(field.scattered));

    writeIntroFrame(target, field, 1);
    expect(Array.from(target)).toEqual(Array.from(field.formed));

    writeIntroFrame(target, field, 0.5);
    for (let i = 0; i < target.length; i += 1) {
      const expected = field.scattered[i] + (field.formed[i] - field.scattered[i]) * 0.5;
      expect(target[i]).toBeCloseTo(expected, 5);
    }
  });

  test("越界的插值量被夹住（时长算错也不会把点甩飞）", () => {
    const target = new Float32Array(field.count * 3);

    writeIntroFrame(target, field, -1);
    expect(Array.from(target)).toEqual(Array.from(field.scattered));

    writeIntroFrame(target, field, 5);
    expect(Array.from(target)).toEqual(Array.from(field.formed));
  });
});
