import React from "react";
import { motion, type Variants } from "framer-motion";
import { cn } from "../lib/utils";
import { useMotionPlaying } from "../lib/useMotionPlayState";

/**
 * 切页外壳（PageTransition）
 * ==========================================================================
 * 包住每个路由页面的内容：旧页 exit 快速淡出 + 轻微上移（0.26s，短，避免等待感），
 * 新页 enter 淡入 + 轻微上浮（0.55s expo-out）。配合 App.js 里的
 * <AnimatePresence exitBeforeEnter> 生效 —— AnimatePresence 会在旧页播完 exit
 * 之后才挂载新页，所以两页不会同屏打架。
 *
 * ⚠️ 这里**不再**有 RouteCurtain（全屏遮罩扫过）：
 *    顶部导航现在是同页平滑滚动、根本不换路由，遮罩扫过既没滚动也没换页，
 *    只会让人觉得「点了一下，闪了一条横线，然后什么都没发生」。
 *    切页的观感由本组件 + AnimatePresence 负责，够了。
 *
 * 两条约定：
 *   · 总开关 --motion-play-state 为 paused 时退化成普通 div —— 内容一帧都不少；
 *   · 首屏入场交给 LoadingScreen，路由层用 initial={false}，不重复播。
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const PAGE_VARIANTS: Variants = {
  initial: { opacity: 0, y: 18 },
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE, delay: 0.06 },
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: { duration: 0.26, ease: EASE },
  },
};

type PageTransitionProps = {
  children: React.ReactNode;
  className?: string;
};

/** 单个路由页面的转场外壳（必须放在 Routes 的 element 里） */
export function PageTransition({ children, className }: PageTransitionProps) {
  const playing = useMotionPlaying();

  if (!playing) {
    return <div className={cn("page-transition", className)}>{children}</div>;
  }

  return (
    <motion.main
      data-page-transition="playing"
      className={cn("page-transition", className)}
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.main>
  );
}

export default PageTransition;
