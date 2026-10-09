/**
 * 站内导航（单页锚点 + 平滑滚动）· 唯一来源
 * ==========================================================================
 * 本站是「一个长页面 + 顶部锚点导航」的结构：
 *   #home（首屏）→ #about（关于 / 技能）→ #work（作品）→ #resume（经历）→ #contact（联系）
 *
 * 顶部导航点击后**只做一件事**：把窗口平滑滚到对应区块。
 * 不做伪转场幕布、不换路由 —— 换路由会卸载整棵子树（滚动位置、入场动画、
 * Canvas 全部重来），那正是「点导航只有一道横线划过、页面其实没动」的根因。
 *
 * 三种滚动通道，按可用性依次降级：
 *   1) Lenis 正在接管：scrollTo(像素, { duration }) —— 与自己的惯性手感一致；
 *   2) 没有 Lenis（窄屏 / jsdom / 老浏览器）：window.scrollTo({ behavior: "smooth" })；
 *   3) 连滚动 API 都没有：返回 false，调用方交还给 <a href="#id"> 的原生锚点行为。
 *
 * 纯读 DOM + 纯计算，方便单测（见 src/lib/navigation.test.js）。
 */
import { getLenis } from "../components/SmoothScroll";

/** 页面里的区块顺序 = 导航可见顺序（home 只在深链 / 品牌标识里用得到） */
export const SECTION_IDS = ["home", "about", "work", "resume", "contact"] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** 固定 Header 的高度（px）：与 src/components/Header.tsx 里的 h-[64px] 保持一致 */
export const HEADER_HEIGHT = 64;

/** 落点再往下留一点余量，标题不会贴到导航栏上 */
export const SECTION_OFFSET = HEADER_HEIGHT + 12;

/** 点击导航的滚动时长（秒）：短了像瞬移，长了像卡住 */
export const SCROLL_DURATION = 1.05;

const SECTION_ID_SET: ReadonlySet<string> = new Set(SECTION_IDS);

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && SECTION_ID_SET.has(value);
}

/** "  #Work " / "work" / "#work" → "work"；不认识的一律 null */
export function normalizeHash(hash: string | null | undefined): SectionId | null {
  if (typeof hash !== "string") return null;
  // 先 trim 再抹掉 #：浏览器给的 location.hash 不会有空格，但手工传参 / 粘贴
  // 出来的链接常带「  #work 」这种前后空白，先剥 # 会漏掉它们
  const id = hash.trim().replace(/^#/, "").trim().toLowerCase();
  return isSectionId(id) ? id : null;
}

/**
 * 找区块元素；拿不到 document（SSR / 极端环境）时返回 null，而不是抛错。
 * 用 querySelector 而不是 getElementById：Document 与元素都能查，
 * 便于测试传一个局部容器进来。#id 里的 id 全部来自 SECTION_IDS，不含 CSS 特殊字符。
 */
export function findSection(
  id: SectionId,
  root?: ParentNode | null
): HTMLElement | null {
  const scope = root || (typeof document !== "undefined" ? document : null);
  if (!scope || typeof scope.querySelector !== "function") return null;
  return scope.querySelector<HTMLElement>(`#${id}`);
}

/** 元素在**文档**里的纵向位置（getBoundingClientRect 是相对视口的，要补上已滚动距离） */
export function offsetTop(element: Element): number {
  if (!element || typeof element.getBoundingClientRect !== "function") return 0;
  const scrolled =
    typeof window !== "undefined"
      ? window.scrollY || window.pageYOffset || 0
      : 0;
  return element.getBoundingClientRect().top + scrolled;
}

export type ScrollToSectionOptions = {
  /** 顶部让出的高度（px），默认 SECTION_OFFSET */
  offset?: number;
  /** true = 不做过渡直接到位（深链首屏跳转用，用户还没开始滚动，动画没有意义） */
  immediate?: boolean;
};

/**
 * 平滑滚动到某个区块。
 * 返回是否真的接管了这次滚动 —— false 时调用方应当让浏览器走原生锚点。
 */
export function scrollToSection(
  id: SectionId,
  options: ScrollToSectionOptions = {}
): boolean {
  const { offset = SECTION_OFFSET, immediate = false } = options;
  const element = findSection(id);
  if (!element) return false;

  const top = Math.max(0, offsetTop(element) - offset);

  const lenis = getLenis();
  if (lenis && typeof lenis.scrollTo === "function") {
    /* Lenis 的 scrollTo 收「像素」或「元素 / 选择器」，这里给像素：
       元素版本会自己再算一次位置，和上面的 offset 容易打架 */
    lenis.scrollTo(top, immediate ? { immediate: true } : { duration: SCROLL_DURATION });
    return true;
  }

  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    try {
      window.scrollTo({ top, behavior: immediate ? "auto" : "smooth" });
    } catch {
      /* 老浏览器只认 (x, y) 两个参数 */
      window.scrollTo(0, top);
    }
    return true;
  }

  return false;
}

/**
 * 当前该高亮哪一个导航项：取「顶边已经越过判定线」的最后一个区块。
 * 判定线 = 视口顶部往下 offset（默认 header 高度 + 一点余量）。
 * 一个区块都量不到时返回 null（比如页面还没渲染完），调用方保持原样即可。
 */
export function currentSectionId(offset: number = SECTION_OFFSET + 1): SectionId | null {
  if (typeof window === "undefined") return null;

  const line = (window.scrollY || window.pageYOffset || 0) + offset;
  let current: SectionId | null = null;
  let first: SectionId | null = null;

  SECTION_IDS.forEach((id) => {
    const element = findSection(id);
    if (!element) return;
    if (first === null) first = id;
    if (offsetTop(element) <= line) current = id;
  });

  return current || first;
}
