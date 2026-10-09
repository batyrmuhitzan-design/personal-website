import profile from "./portfolio.config";
import { PIXEL_CHARACTERS, findCharacter } from "./lib/pixelArt";

/**
 * 个人信息配置的冒烟测试：
 * 运行 `npm test` 可校验 profile 里的必填信息是否齐全、格式是否合法，
 * 避免改了配置之后页面出现空白或错误链接。
 */
describe("portfolio.config", () => {
  it("包含站点必需的身份信息", () => {
    expect(profile.name).toBe("莎莎");
    expect(profile.nameEn).toBe("Shasha");
    expect(profile.monogram).toBeTruthy();
    expect(profile.role).toBeTruthy();
    expect(profile.roleEn).toBeTruthy();
    expect(profile.slogan).toBeTruthy();
  });

  it("邮箱格式合法", () => {
    expect(profile.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("社交链接均为合法 URL", () => {
    [profile.github, profile.bilibili, profile.juejin].forEach((url) => {
      expect(() => new URL(url)).not.toThrow();
    });
  });

  it("打字机文案至少 3 条且都不为空", () => {
    expect(Array.isArray(profile.typewriter)).toBe(true);
    expect(profile.typewriter.length).toBeGreaterThanOrEqual(3);
    profile.typewriter.forEach((item) => {
      expect(typeof item).toBe("string");
      expect(item.trim().length).toBeGreaterThan(0);
    });
  });
});

describe("portfolio.config · 自定义光标", () => {
  const cursor = profile.cursor;

  it("配置齐全：开关 / 皮肤 / 精灵尺寸 / 悬停倾斜都在合理范围", () => {
    expect(typeof cursor.enabled).toBe("boolean");
    // 皮肤只认这两种 —— CustomCursor 里其余写法都会回落到 pixel
    expect(["pixel", "cartoon"]).toContain(cursor.skin);
    expect(typeof cursor.spriteUrl).toBe("string");
    if (cursor.spriteUrl) {
      // 非空时必须是可用 URL（public 路径 / 绝对地址 / data-URI 都行）
      expect(() =>
        new URL(cursor.spriteUrl, "https://i.1losion.me")
      ).not.toThrow();
    }
    expect(typeof cursor.spriteWidth).toBe("number");
    expect(cursor.spriteWidth).toBeGreaterThan(0);
    expect(cursor.spriteWidth).toBeLessThanOrEqual(128);
    expect(typeof cursor.tilt).toBe("number");
    expect(cursor.tilt).toBeGreaterThanOrEqual(0);
    expect(cursor.tilt).toBeLessThanOrEqual(45);
  });

  it("默认用内置像素小人：不填 spriteUrl 也能跑（无需额外资源）", () => {
    expect(cursor.enabled).toBe(true);
    expect(cursor.skin).toBe("pixel");
    expect(cursor.spriteUrl).toBe("");
  });

  it("随机皮肤：randomSkin 是布尔；填了 character 就必须是有效角色（写错要当场报出来）", () => {
    expect(typeof cursor.randomSkin).toBe("boolean");
    expect(["string", "number"]).toContain(typeof cursor.character);

    if (cursor.character !== "") {
      // 找不到角色 = 配置写错了：CustomCursor 会静默回落到随机 / 默认，
      // 那种「我明明写了却没生效」最难查，所以在这里直接钉死
      expect(findCharacter(cursor.character)).not.toBeNull();
    }
    // 角色库本身至少 10 位，随机皮肤才有意义
    expect(PIXEL_CHARACTERS.length).toBeGreaterThanOrEqual(10);
  });
});

describe("portfolio.config · 动效体系（Lenis）", () => {
  const lenis = profile.motion.lenis;

  it("平滑滚动参数在合理范围（太大=发飘，太小=没手感）", () => {
    expect(typeof lenis.duration).toBe("number");
    expect(lenis.duration).toBeGreaterThan(0);
    expect(lenis.duration).toBeLessThanOrEqual(3);

    expect(typeof lenis.easingExponent).toBe("number");
    expect(lenis.easingExponent).toBeGreaterThanOrEqual(1);
    expect(lenis.easingExponent).toBeLessThanOrEqual(10);
  });

  it("触屏 / 滚轮参数齐全，且 duration 与 lerp 不会同时生效（Lenis 内部二选一）", () => {
    expect(typeof lenis.wheelMultiplier).toBe("number");
    expect(lenis.wheelMultiplier).toBeGreaterThan(0);
    expect(typeof lenis.touchMultiplier).toBe("number");
    expect(lenis.touchMultiplier).toBeGreaterThan(0);
    expect(typeof lenis.syncTouch).toBe("boolean");

    if (lenis.syncTouch) {
      // 开着 syncTouch 才需要这两个：插值速度（0~1）与惯性衰减倍率
      expect(typeof lenis.syncTouchLerp).toBe("number");
      expect(lenis.syncTouchLerp).toBeGreaterThan(0);
      expect(lenis.syncTouchLerp).toBeLessThanOrEqual(1);
      expect(typeof lenis.touchInertiaMultiplier).toBe("number");
      expect(lenis.touchInertiaMultiplier).toBeGreaterThan(1);
    }

    expect(typeof lenis.lerp).toBe("number");
    // Lenis 源码里 `lerp = !duration && 0.1`：duration 与 lerp 只能活一个，
    // 两个都填会让人误以为「会更顺」，实际只有一个在起作用
    expect(Number(lenis.lerp) > 0 && Number(lenis.duration) > 0).toBe(false);
  });

  it("入场 / 视差 / 切页的开关不放在配置里，而是 CSS 变量 --motion-play-state", () => {
    // 这里只放 Lenis 参数：其余动效统一由 src/index.css 的变量裁决（改一处静音全站）
    expect(Object.keys(profile.motion)).toEqual(["lenis"]);
  });
});

describe("portfolio.config · 悬浮音乐播放器", () => {
  const music = profile.musicPlayer;

  it("开关、解析服务地址与默认参数齐全", () => {
    expect(typeof music.enabled).toBe("boolean");
    expect(music.apiBase).toMatch(/^(https?:\/\/|\/)/);
    expect(typeof music.limit).toBe("number");
    expect(music.limit).toBeGreaterThan(0);
    expect(music.volume).toBeGreaterThan(0);
    expect(music.volume).toBeLessThanOrEqual(1);
  });

  it("榜单覆盖 Spotify / 网易云 / QQ / 抖音 / 汽水，字段完整且 key 唯一", () => {
    expect(Array.isArray(music.platforms)).toBe(true);
    expect(music.platforms.length).toBeGreaterThanOrEqual(5);

    const keys = music.platforms.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);

    const groups = new Set(music.platforms.map((item) => item.group));
    ["Spotify", "网易云音乐", "QQ 音乐", "抖音", "汽水音乐"].forEach((group) => {
      expect(groups.has(group)).toBe(true);
    });

    music.platforms.forEach((item) => {
      expect(item.name).toBeTruthy();
      expect(item.provider).toBeTruthy();
      expect(item.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(["meting", "match"]).toContain(item.mode);
    });
  });

  it("默认平台在榜单列表内；Spotify 走跨源匹配，其余走聚合解析", () => {
    expect(music.platforms.map((item) => item.key)).toContain(music.defaultPlatform);
    music.platforms.forEach((item) => {
      if (item.provider === "spotify") {
        expect(item.mode).toBe("match");
      } else {
        expect(item.mode).toBe("meting");
      }
    });
  });
});
