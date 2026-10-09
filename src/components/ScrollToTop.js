import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { scrollToTop } from "./SmoothScroll";
import { normalizeHash, scrollToSection } from "../lib/navigation";

/**
 * 路由变化后的落位（不产生 DOM）
 * ==========================================================================
 * 三种情况：
 *   1) URL 带区块 hash（例如 /#work，从别的页面点导航时由 Header 跳过来）：
 *      等新页挂载后**直接跳到那一块**（immediate，用户还没开始滚动，动画没意义）；
 *   2) 新页里没有那个区块：退回到「回到顶部」，行为与以前一致；
 *   3) 普通换页（深链 /about 等）：回到顶部。
 *
 * 为什么要轮询等一等：换页是「旧页退场 → 新页挂载」（AnimatePresence
 * exitBeforeEnter），本效果跑的时候新页可能还没进 DOM，那时候量不到区块。
 * 轮询上限约 0.9s，之后放弃并回顶部，不会一直转。
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const section = normalizeHash(hash);

    if (!section) {
      scrollToTop(true);
      return undefined;
    }

    let tries = 0;
    let timer = 0;

    const attempt = () => {
      if (scrollToSection(section, { immediate: true })) return;
      tries += 1;
      if (tries > 15) {
        scrollToTop(true);
        return;
      }
      timer = window.setTimeout(attempt, 60);
    };

    attempt();
    return () => window.clearTimeout(timer);
  }, [pathname, hash]);

  return null;
}

export default ScrollToTop;
