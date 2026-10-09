import {
  CINEMA_DEFAULTS,
  CINEMA_MIN_WIDTH,
  cinemaSupported,
  cinemaTimeline,
  pinDistance,
  readCinemaConfig,
} from "./cinema";

/**
 * 滚动镜头的纯逻辑测试
 * ------------------------------------------------------------------
 * 镜头手感（推近多少 / 钉多久 / 第二屏从多远进来）是这个阶段的**核心资产**，
 * 所以这里把三件事钉死：
 *   1) 配置收敛：缺项 / 写坏的数值 / 越界都进安全区，绝不让 NaN 流进 gsap；
 *   2) 视口门槛：窄屏退回普通滚动（手机上地址栏会改视口高度，钉住必抖）；
 *   3) 时间线：端点与单调性（第二屏确实「从远处进来」、镜头确实「推近」）。
 */

/** 造一份「默认 + 覆盖」的配置，省得每个用例都写全量字段 */
const cfg = (patch = {}) => readCinemaConfig({ ...CINEMA_DEFAULTS, ...patch });

describe("cinema · 参数收敛", () => {
  test("配置整段缺失也用默认值，静默降级而不是报错", () => {
    expect(readCinemaConfig(undefined)).toEqual({ ...CINEMA_DEFAULTS });
    expect(readCinemaConfig(null)).toEqual({ ...CINEMA_DEFAULTS });
    expect(readCinemaConfig("")).toEqual({ ...CINEMA_DEFAULTS });
  });

  test("数值夹在安全区：推近不许小于 1、钉住 ≤ 4 屏、标题层差 ≤ 400px", () => {
    expect(cfg({ zoom: 0.4 }).zoom).toBe(1); // < 1 就成了「拉远」，不叫镜头进入
    expect(cfg({ zoom: 99 }).zoom).toBe(2.2);
    expect(cfg({ pinScreens: -3 }).pinScreens).toBe(0);
    expect(cfg({ pinScreens: 40 }).pinScreens).toBe(4);
    expect(cfg({ lift: -8 }).lift).toBe(-1);
    expect(cfg({ titleDepth: 9999 }).titleDepth).toBe(400);
  });

  test("写坏的数值退回默认值（NaN / 字符串都不会流进 gsap）", () => {
    expect(cfg({ zoom: "abc" }).zoom).toBe(CINEMA_DEFAULTS.zoom);
    expect(cfg({ pinScreens: NaN }).pinScreens).toBe(CINEMA_DEFAULTS.pinScreens);
    expect(cfg({ titleDepth: Infinity }).titleDepth).toBe(CINEMA_DEFAULTS.titleDepth);
  });

  test("null / 空串算「没写」：用默认值，而不是被 Number() 变成 0", () => {
    // 0 屏钉住 = pin 距离 0，比默认值更糟：这里刻意不让它发生
    expect(cfg({ pinScreens: null }).pinScreens).toBe(CINEMA_DEFAULTS.pinScreens);
    expect(cfg({ zoom: null }).zoom).toBe(CINEMA_DEFAULTS.zoom);
    expect(cfg({ lift: "" }).lift).toBe(CINEMA_DEFAULTS.lift);
  });

  test("enabled / fade 只有显式 false 才关（配置漏写 = 开）", () => {
    expect(readCinemaConfig({}).enabled).toBe(true);
    expect(readCinemaConfig({ enabled: false }).enabled).toBe(false);
    expect(readCinemaConfig({ enabled: 0 }).enabled).toBe(true);
    expect(readCinemaConfig({}).fade).toBe(true);
    expect(readCinemaConfig({ fade: false }).fade).toBe(false);
  });
});

describe("cinema · 视口门槛与钉住距离", () => {
  test("窄屏（< 768）不启用镜头：退回普通滚动", () => {
    expect(cinemaSupported(CINEMA_MIN_WIDTH - 1)).toBe(false);
    expect(cinemaSupported(CINEMA_MIN_WIDTH)).toBe(true);
    expect(cinemaSupported(Number.NaN)).toBe(false);
  });

  test("钉住距离 = 屏数 × 视口高，且是整数（gsap 的 end 会拼成字符串，小数会抖）", () => {
    const config = cfg({ pinScreens: 1.15 });
    expect(pinDistance(config, 800)).toBe(Math.round(1.15 * 800));
    expect(Number.isInteger(pinDistance(config, 913))).toBe(true);
  });

  test("视口高不可信时退回 800，而不是算出 0（0 会让 pin 直接失效）", () => {
    const config = cfg({ pinScreens: 1.15 });
    const expected = Math.round(1.15 * 800);
    expect(pinDistance(config, 0)).toBe(expected);
    expect(pinDistance(config, -10)).toBe(expected);
    expect(pinDistance(config, Number.NaN)).toBe(expected);
  });
});

describe("cinema · 时间线数据", () => {
  test("首屏：推近 zoom 倍 + 按比例上飘 + 末段淡出，全程线性（手感来自滚动本身）", () => {
    const timeline = cinemaTimeline(cfg({ zoom: 1.34, lift: -0.16, fade: true }));

    expect(timeline.hero.scale).toBe(1.34);
    expect(timeline.hero.yPercent).toBeCloseTo(-16, 6);
    expect(timeline.hero.opacity).toBe(0);
    expect(timeline.hero.ease).toBe("none");
  });

  test("关掉 fade 时首屏保持不透明（交给第二屏盖上来）", () => {
    expect(cinemaTimeline(cfg({ fade: false })).hero.opacity).toBe(1);
  });

  test("第二屏「从远处进来」：起点更远 / 更小 / 更透明，终点就是原位", () => {
    const timeline = cinemaTimeline(cfg());

    expect(timeline.nextFrom.yPercent).toBeGreaterThan(timeline.nextTo.yPercent);
    expect(timeline.nextFrom.scale).toBeLessThan(timeline.nextTo.scale);
    expect(timeline.nextFrom.opacity).toBeLessThan(timeline.nextTo.opacity);
    expect(timeline.nextTo).toEqual({ yPercent: 0, scale: 1, opacity: 1, ease: "none" });
  });

  test("第二屏比首屏早收尾（nextRatio < 1）：镜头还没停，画面已经就位", () => {
    const timeline = cinemaTimeline(cfg());
    expect(timeline.nextRatio).toBeGreaterThan(0);
    expect(timeline.nextRatio).toBeLessThan(1);
  });

  test("大标题沿 Z 轴前移量等于 titleDepth；设为 0 = 关掉层差", () => {
    expect(cinemaTimeline(cfg({ titleDepth: 88 })).title).toEqual({ z: 88, ease: "none" });
    expect(cinemaTimeline(cfg({ titleDepth: 0 })).title.z).toBe(0);
  });

  test("scrub 是正数：0 会变成「完全同步」，滚动一格画面跳一格", () => {
    expect(cinemaTimeline(cfg()).scrub).toBeGreaterThan(0);
  });
});
