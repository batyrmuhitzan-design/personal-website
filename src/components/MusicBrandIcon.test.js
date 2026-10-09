import { brandKeyOf } from "./MusicBrandIcon";
import profile from "../portfolio.config";

/**
 * 品牌图标判定测试（纯函数）
 * ------------------------------------------------------------------
 * 图标种类只靠 platform 上的几个字符串判定，规则写错就会「六个频道一个图标」，
 * 而这种错在界面上非常难发现（图标本身还是一枚能看的音符）。因此这里钉住：
 *   1) 配置里的每个频道 → 期望的图标；
 *   2) 抖音 / 汽水 / 纯音乐的 provider 也是 netease，必须靠 group / key 先认出来，
 *      不能退化成「网易云」那枚；
 *   3) 认不出来时用通用图标（绝不返回空 / undefined）。
 */
describe("MusicBrandIcon · 频道识别", () => {
  const expected = {
    spotify: "spotify",
    "netease-hot": "netease",
    "netease-rising": "netease",
    "netease-new": "netease",
    "tencent-hot": "tencent",
    "douyin-hot": "douyin",
    "douyin-viral": "douyin",
    instrumental: "instrumental",
    "soda-hot": "soda",
  };

  it("配置里的每个频道都映射到期望的图标", () => {
    const platforms = profile.musicPlayer.platforms;
    expect(platforms.length).toBeGreaterThan(0);

    platforms.forEach((platform) => {
      expect(brandKeyOf(platform)).toBe(expected[platform.key]);
    });
  });

  it("provider 是 netease 的内容频道（抖音 / 汽水 / 纯音乐）不会被并成网易云", () => {
    const contentChannels = profile.musicPlayer.platforms.filter(
      (item) => ["douyin-hot", "soda-hot", "instrumental"].includes(item.key)
    );
    expect(contentChannels).toHaveLength(3);
    contentChannels.forEach((item) => {
      expect(item.provider).toBe("netease");
      expect(brandKeyOf(item)).not.toBe("netease");
    });

    // 六种图标各至少被用上一次（否则等于白做了图标）
    const brands = new Set(profile.musicPlayer.platforms.map(brandKeyOf));
    expect(brands.size).toBeGreaterThanOrEqual(6);
  });

  it("兜底：空值 / 陌生平台返回通用图标，不会崩也不会空白", () => {
    expect(brandKeyOf(null)).toBe("generic");
    expect(brandKeyOf(undefined)).toBe("generic");
    expect(brandKeyOf({})).toBe("generic");
    expect(brandKeyOf({ key: "unknown", group: "神秘频道", provider: "xxx" })).toBe(
      "generic"
    );
  });
});
