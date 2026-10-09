import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ThemeToggle from "./ThemeToggle";
import SoundToggle from "./SoundToggle";
import profile from "../portfolio.config";
import { cn } from "../lib/utils";
import {
  currentSectionId,
  scrollToSection,
  type SectionId,
} from "../lib/navigation";

/**
 * 顶部导航栏（极简 Header）
 * ==================================================================
 * 结构：左侧品牌标识（字章 + 莎莎 / Batyr）· 右侧导航 + 日夜切换。
 *
 * 设计要点：
 * · 高度只有 64px、字号克制、全部 1px 细线，靠「留白 + 字重」建立层级；
 * · 未滚动时完全透明，滚动后变为毛玻璃（背景模糊 + 细线分隔），
 *   让内容从导航栏下穿过时有细腻的层次感；
 * · 当前区块用共享布局动画（layoutId）画一条 1px 下划线，
 *   滚动到下一块时它会「滑」过去，而不是闪断；
 * · 文字 / 分隔线 / 玻璃底全部取自 CSS 变量（src/theme/tokens.css），
 *   于是日夜模式切换时导航栏自动跟随，不需要任何 JS 判断。
 *
 * ⚠️ 导航点击 = 平滑滚动（本次修复的核心）
 * ------------------------------------------------------------------
 * 之前点导航只播了一道横线扫过的伪转场（RouteCurtain），页面却没动 ——
 * 因为改成「不换路由」之后，那套幕布既没滚动也没换页，等于什么都没发生。
 * 现在的契约很简单：
 *   · 当前页面就有这一块（首页、或深链落点）→ 只平滑滚动过去，不换路由。
 *     不换路由是关键：换路由会卸载整棵子树，滚动位置、入场动画、Canvas 状态
 *     全部重来，观感上就是「闪一下回到顶部」。
 *   · 当前页没有这一块（例如站在 /about 点「作品」）→ 才让路由去首页，
 *     并由 ScrollToTop 落到 #work。
 * · 平滑滚动本身统一走 src/lib/navigation.ts（Lenis → window.scrollTo →
 *   原生锚点三层降级），全站只有这一个来源。
 * · 动效不再读 useReducedMotion：这台机器系统「动画效果」是关的，
 *   跟随系统等于下划线永远闪断、抽屉永远瞬开。要跟随系统只改 index.css 的
 *   --motion-play-state 那一个变量（理由见 index.css 里的长注释）。
 */

/** 导航项：英文为主标识、中文为辅（小字），兼顾质感与可读性 */
const NAV_ITEMS = [
  { hash: "work", label: "Work", labelZh: "作品" },
  { hash: "about", label: "About", labelZh: "关于" },
  { hash: "resume", label: "Resume", labelZh: "经历" },
  { hash: "contact", label: "Contact", labelZh: "联系" },
] as const satisfies ReadonlyArray<{
  hash: SectionId;
  label: string;
  labelZh: string;
}>;

/**
 * 独立路由页（/about、/project、/resume）没有区块 id，
 * 用路径反推该高亮哪一项，免得这些页面「一个都点不亮」。
 */
const SECTION_BY_PATH: Record<string, SectionId> = {
  "/": "home",
  "/about": "about",
  "/project": "work",
  "/resume": "resume",
  "/contact": "contact",
};

/** 品牌标识（改文案只需改 src/portfolio.config.js） */
const BRAND = {
  primary: (profile.brand && profile.brand.primary) || profile.name,
  secondary: (profile.brand && profile.brand.secondary) || profile.nameEn,
  monogram: profile.monogram || "S",
};

/** 滚动超过这个距离就切到毛玻璃态（太小会「一滚就变」，太大又显得迟钝） */
const SCROLL_THRESHOLD = 12;

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inViewSection, setInViewSection] = useState<SectionId | null>(null);

  /* 滚动监听同时取两件事：是否切毛玻璃态 + 当前该点亮哪一项（scroll spy）。
     两者都是布尔 / 字符串，不会引起频繁重渲染；passive 保证不拖慢滚动。 */
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
      setInViewSection(currentSectionId());
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /* 路由 / hash 变化后重算一次高亮。延迟的那一次是留给 AnimatePresence 的：
     新页要等旧页退场之后才挂载，立刻量是量不到区块的。 */
  useEffect(() => {
    const update = () => setInViewSection(currentSectionId());
    update();
    const timer = window.setTimeout(update, 600);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.hash]);

  /* 菜单展开时监听 resize：切回桌面尺寸就收起，避免展开状态残留 */
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [menuOpen]);

  /* 当前高亮项：量得到区块就用区块，否则按路径兜底（/about 这类独立页用） */
  const activeSection =
    inViewSection || SECTION_BY_PATH[location.pathname] || null;

  /** 下划线 / 抽屉的过渡：一条弹簧，不读 useReducedMotion（理由见文件头注释） */
  const navTransition = {
    type: "spring",
    stiffness: 420,
    damping: 34,
  } as const;

  /**
   * 导航点击：能滚就滚（**不换路由**），滚不到才交给路由。
   * preventDefault 已经把 href 的原生锚点拦住了，而 href 依然写在那里 ——
   * 万一 JS 出问题，浏览器原生的锚点跳转还能兜住。
   */
  const goToSection = (
    hash: SectionId,
    event: React.MouseEvent<HTMLAnchorElement>
  ) => {
    setMenuOpen(false);
    event.preventDefault();
    if (scrollToSection(hash)) return;
    navigate(`/#${hash}`);
  };

  return (
    <header
      className={cn(
        "site-header fixed inset-x-0 top-0 z-[1000]",
        "transition-[background-color,border-color,backdrop-filter] duration-500 ease-out",
        scrolled
          ? "border-b border-hairline bg-[var(--surface-glass)] backdrop-blur-[var(--glass-blur)]"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-[64px] w-full max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
        {/* ---------- 品牌 ---------- */}
        {/* ---------- 品牌：回到首屏顶部（只在首页滚，别的页面回首页） ---------- */}
        <a
          href="#home"
          onClick={(event) => goToSection("home", event)}
          aria-label={`${BRAND.primary} 回到首屏`}
          className="group flex items-center gap-3 no-underline"
        >
          <span className="monogram">{BRAND.monogram}</span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              {BRAND.primary}
            </span>
            <span className="mt-[4px] text-[10px] uppercase tracking-[0.22em] text-ink-2">
              {BRAND.secondary}
            </span>
          </span>
        </a>

        {/* ---------- 桌面导航 ---------- */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.hash;
            return (
              <a
                key={item.hash}
                href={`#${item.hash}`}
                onClick={(event) => goToSection(item.hash, event)}
                aria-current={isActive ? "true" : undefined}
                className="site-nav-link group relative flex flex-col items-center px-3 py-2 no-underline"
              >
                <span
                  className={cn(
                    "text-[13px] font-medium tracking-[0.01em] transition-colors duration-300",
                    isActive ? "text-ink" : "text-ink-2 group-hover:text-ink"
                  )}
                >
                  {item.label}
                </span>
                <span
                  className={cn(
                    "mt-[3px] text-[10px] tracking-[0.16em] transition-colors duration-300",
                    isActive ? "text-ink-2" : "text-ink-3 group-hover:text-ink-2"
                  )}
                >
                  {item.labelZh}
                </span>
                {isActive ? (
                  <motion.span
                    layoutId="site-nav-underline"
                    aria-hidden="true"
                    className="absolute inset-x-2 -bottom-[1px] h-px bg-accent"
                    transition={navTransition}
                  />
                ) : null}
              </a>
            );
          })}

          {/* 音效开关 + 日夜切换：与导航同一行，右侧收尾 */}
          <SoundToggle className="ml-3" />
          <ThemeToggle className="ml-2" />
        </nav>

        {/* ---------- 移动端：切换按钮常驻，导航收进抽屉 ---------- */}
        <div className="flex items-center gap-3 md:hidden">
          <SoundToggle />
          <ThemeToggle />
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-mobile-nav"
            aria-label={menuOpen ? "收起导航菜单" : "打开导航菜单"}
            onClick={() => setMenuOpen((open) => !open)}
            className="focus-ring inline-flex h-[30px] w-[30px] flex-col items-center justify-center gap-[5px] rounded-full border border-hairline bg-elevated p-0 transition-colors duration-300 hover:border-hairline-strong"
          >
            <motion.span
              aria-hidden="true"
              className="block h-px w-[13px] bg-ink"
              animate={menuOpen ? { rotate: 45, y: 3 } : { rotate: 0, y: 0 }}
              transition={navTransition}
            />
            <motion.span
              aria-hidden="true"
              className="block h-px w-[13px] bg-ink"
              animate={menuOpen ? { rotate: -45, y: -3 } : { rotate: 0, y: 0 }}
              transition={navTransition}
            />
          </button>
        </div>
      </div>

      {/* ---------- 移动端下拉面板（只在展开时挂载，避免无谓的玻璃层开销） ---------- */}
      <AnimatePresence initial={false}>
        {menuOpen ? (
          <motion.nav
            id="site-mobile-nav"
            aria-label="移动端导航"
            className="border-b border-hairline bg-[var(--surface-glass-strong)] backdrop-blur-[var(--glass-blur)] md:hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <ul className="mx-auto flex w-full max-w-[1200px] list-none flex-col px-5 py-2 sm:px-8">
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.hash;
                return (
                  <li key={item.hash}>
                    <a
                      href={`#${item.hash}`}
                      onClick={(event) => goToSection(item.hash, event)}
                      aria-current={isActive ? "true" : undefined}
                      className="flex items-baseline gap-3 border-b border-hairline py-3 no-underline last:border-b-0"
                    >
                      <span
                        className={cn(
                          "text-[14px] font-medium",
                          isActive ? "text-ink" : "text-ink-2"
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="text-[11px] tracking-[0.16em] text-ink-3">
                        {item.labelZh}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

export default Header;
