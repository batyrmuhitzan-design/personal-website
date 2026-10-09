import {
  HEADER_HEIGHT,
  SECTION_IDS,
  SECTION_OFFSET,
  currentSectionId,
  normalizeHash,
  offsetTop,
  scrollToSection,
} from "./navigation";

/**
 * 单页导航（锚点 + 平滑滚动）测试（jsdom）
 * ------------------------------------------------------------------
 * jsdom 没有真实布局（getBoundingClientRect 恒为 0）也没有滚动引擎，
 * 所以这里给区块「手工量出一个位置」，再断言三件事：
 *   1) hash ↔ 区块 id 的换算（不认识的 hash 必须为 null，否则会滚到莫名其妙的地方）；
 *   2) 平滑滚动通道：有 Lenis 用 Lenis、没有就用 window.scrollTo，且落点扣掉 Header 高度；
 *   3) 滚动高亮（scroll spy）：判定线以下最后一个区块才是「当前」。
 */

jest.mock("../components/SmoothScroll", () => ({
  getLenis: jest.fn(() => null),
  scrollToTop: jest.fn(),
}));

// eslint-disable-next-line import/first
import { getLenis } from "../components/SmoothScroll";

const created = [];

/** 建一个区块并给它一个「文档里的位置」（jsdom 里只能手工量） */
const makeSection = (id, top, height = 500) => {
  const element = document.createElement("div");
  element.id = id;
  element.getBoundingClientRect = () => ({
    top,
    bottom: top + height,
    left: 0,
    right: 320,
    width: 320,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
  document.body.appendChild(element);
  created.push(element);
  return element;
};

beforeEach(() => {
  window.scrollTo = jest.fn();
  getLenis.mockReturnValue(null);
});

afterEach(() => {
  while (created.length) created.pop().remove();
  jest.clearAllMocks();
});

describe("navigation · hash 与区块 id", () => {
  test("区块顺序就是导航顺序，home 也在名单里（深链 / 品牌标识用）", () => {
    expect(SECTION_IDS).toEqual(["home", "about", "work", "resume", "contact"]);
    expect(HEADER_HEIGHT).toBe(64);
  });

  test("normalizeHash 能吃掉 # / 大小写 / 空格，认不出来的一律 null", () => {
    expect(normalizeHash("#work")).toBe("work");
    expect(normalizeHash("work")).toBe("work");
    expect(normalizeHash("  #RESUME ")).toBe("resume");
    expect(normalizeHash("#关于")).toBeNull();
    expect(normalizeHash("#nope")).toBeNull();
    expect(normalizeHash("")).toBeNull();
    expect(normalizeHash(null)).toBeNull();
    expect(normalizeHash(undefined)).toBeNull();
  });
});

describe("navigation · 平滑滚动", () => {
  test("没有 Lenis 时回落到 window.scrollTo，落点扣掉 Header 高度", () => {
    makeSection("work", 2400);

    expect(scrollToSection("work")).toBe(true);
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 2400 - SECTION_OFFSET,
      behavior: "smooth",
    });
  });

  test("immediate = true 时不走平滑过渡（深链首屏跳转）", () => {
    makeSection("contact", 900);

    scrollToSection("contact", { immediate: true });
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 900 - SECTION_OFFSET,
      behavior: "auto",
    });
  });

  test("已经在页面上方的区块：落点钳到 0，不会算出负数把页面顶飞", () => {
    makeSection("about", 10);

    scrollToSection("about");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  test("Lenis 正在接管时优先交给它：像素落点 + duration（immediate 时直接到位）", () => {
    makeSection("resume", 3000);
    const lenis = { scrollTo: jest.fn() };
    getLenis.mockReturnValue(lenis);

    scrollToSection("resume");
    expect(lenis.scrollTo).toHaveBeenCalledWith(3000 - SECTION_OFFSET, {
      duration: expect.any(Number),
    });
    expect(window.scrollTo).not.toHaveBeenCalled();

    scrollToSection("resume", { immediate: true });
    expect(lenis.scrollTo).toHaveBeenLastCalledWith(3000 - SECTION_OFFSET, {
      immediate: true,
    });
  });

  test("区块不存在（还没渲染 / 拼错 id）：返回 false，交给浏览器原生锚点", () => {
    expect(scrollToSection("work")).toBe(false);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});

describe("navigation · 滚动高亮", () => {
  test("判定线以下最后一个区块才是当前项", () => {
    makeSection("home", 0, 900);
    makeSection("about", 900, 900);
    makeSection("work", 1800, 900);

    expect(currentSectionId(0)).toBe("home");
    expect(currentSectionId(950)).toBe("about");
    expect(currentSectionId(5000)).toBe("work");
  });

  test("一个区块都没渲染时返回 null（页面还在挂载中，不要乱高亮）", () => {
    expect(currentSectionId()).toBeNull();
  });

  test("offsetTop = 元素相对文档的位置（视口坐标 + 已滚动距离）", () => {
    const element = makeSection("home", 120);
    const original = window.scrollY;
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });

    expect(offsetTop(element)).toBe(420);

    Object.defineProperty(window, "scrollY", { value: original, configurable: true });
  });
});
