import profile from "./portfolio.config";

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
