import React, { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import ThemeToggle from "./ThemeToggle";
import profile from "../portfolio.config";
import { cn } from "../lib/utils";

/**
 * 顶部导航栏（极简 Header）
 * ==================================================================
 * 结构：左侧品牌标识（字章 + 莎莎 / Batyr）· 右侧导航 + 日夜切换。
 *
 * 设计要点：
 * · 高度只有 64px、字号克制、全部 1px 细线，靠「留白 + 字重」建立层级；
 * · 未滚动时完全透明，滚动后变为毛玻璃（背景模糊 + 细线分隔），
 *   让内容从导航栏下穿过时有细腻的层次感；
 * · 当前路由用共享布局动画（layoutId）画一条 1px 下划线，
 *   切换路由时它会「滑」到新位置，而不是闪断；
 * · 文字 / 分隔线 / 玻璃底全部取自 CSS 变量（src/theme/tokens.css），
 *   于是日夜模式切换时导航栏自动跟随，不需要任何 JS 判断。
 */

/** 导航项：英文为主标识、中文为辅（小字），兼顾质感与可读性 */
const NAV_ITEMS = [
  { to: "/project", label: "Work", labelZh: "作品" },
  { to: "/about", label: "About", labelZh: "关于" },
  { to: "/resume", label: "Resume", labelZh: "经历" },
  { to: "/contact", label: "Contact", labelZh: "联系" },
];

/** 品牌标识（改文案只需改 src/portfolio.config.js） */
const BRAND = {
  primary: (profile.brand && profile.brand.primary) || profile.name,
  secondary: (profile.brand && profile.brand.secondary) || profile.nameEn,
  monogram: profile.monogram || "S",
};

/** 滚动超过这个距离就切到毛玻璃态（太小会「一滚就变」，太大又显得迟钝） */
const SCROLL_THRESHOLD = 12;

function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  /* 滚动监听：只切一个布尔值，passive 不影响滚动性能 */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* 菜单展开时监听 resize：切回桌面尺寸就收起，避免展开状态残留 */
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [menuOpen]);

  /** 下划线 / 面板的过渡：尊重「减少动态效果」 */
  const navTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 420, damping: 34 };

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
        <Link
          to="/"
          onClick={() => setMenuOpen(false)}
          aria-label={`${BRAND.primary} 首页`}
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
        </Link>

        {/* ---------- 桌面导航 ---------- */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="site-nav-link group relative flex flex-col items-center px-3 py-2 no-underline"
            >
              {({ isActive }) => (
                <>
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
                </>
              )}
            </NavLink>
          ))}

          {/* 日夜切换：与导航同一行，右侧收尾 */}
          <ThemeToggle className="ml-3" />
        </nav>

        {/* ---------- 移动端：切换按钮常驻，导航收进抽屉 ---------- */}
        <div className="flex items-center gap-3 md:hidden">
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
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduceMotion ? { duration: 0.12 } : { duration: 0.28, ease: "easeOut" }}
          >
            <ul className="mx-auto flex w-full max-w-[1200px] list-none flex-col px-5 py-2 sm:px-8">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-baseline gap-3 border-b border-hairline py-3 no-underline last:border-b-0"
                  >
                    {({ isActive }) => (
                      <>
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
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

export default Header;
