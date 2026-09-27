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
