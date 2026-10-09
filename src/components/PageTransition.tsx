import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { cn } from "../lib/utils";
import { useMotionPlaying } from "../lib/useMotionPlayState";

/**
 * 无缝切页（PageTransition + RouteCurtain）
 * ==========================================================================
 * 两个组件配合，做出「不是刷新、而是一次连贯转场」的观感：
 *
 * ① PageTransition —— 包住每个路由页面的内容：
 *    · 旧页：exit 快速淡出 + 轻微上移（0.26s，短，避免等待感）
 *    · 新页：enter 淡入 + 轻微上浮（0.55s expo-out）
 *    配合 src/App.js 里的 <AnimatePresence exitBeforeEnter> 生效：
 *    AnimatePresence 会在旧页播完 exit 之后才挂载新页，所以两页不会同屏打架。
 *
 * ② RouteCurtain —— 一次「遮罩平移」：
 *    路由一变，一块 --overlay 底色的整屏遮罩从下往上扫过
 *    （100% → 0 停一下 → -100%），新页正好在「盖住」的那一小段时间里完成挂载，
 *    于是观感是「旧页退场 → 遮罩扫过 → 新页已就位」，全程没有白闪。
 *
 * 三条约定：
 *   · 遮罩 pointer-events: none —— 绝不吃点击（哪怕动画期间）；
 *   · 遮罩用 createPortal 挂到 body —— 不会被页面里的 transform/filter 影响；
 *   · 总开关 --motion-play-state 为 paused 时：PageTransition 退化成普通容器、
 *     遮罩完全不出现（关动效 = 直接切页，信息一帧都不少）。
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

/**
 * 全屏遮罩平移：路由变化时扫一次。
 * 首次进入不扫（首屏已经有 LoadingScreen 负责入场），同路由重复点击也不扫；
 * 站内动效开关为 paused 时也不出现（关动效 = 直接切页，一帧都不耽搁）。
 */
export function RouteCurtain() {
  const { pathname } = useLocation();
  const playing = useMotionPlaying();
  const seen = useRef(pathname);
  const [sweep, setSweep] = useState(0);

  useEffect(() => {
    if (seen.current === pathname) return;
    seen.current = pathname;
    if (!playing) return;
    setSweep((count) => count + 1);
  }, [pathname, playing]);

  if (!playing || sweep === 0) return null;

  return createPortal(
    <motion.div
      key={sweep}
      aria-hidden="true"
      data-route-curtain="true"
      className="route-curtain"
      initial={{ y: "100%" }}
      /* 三段式：扫上来（盖住）→ 停一小会儿（新页在这期间挂载）→ 扫出去 */
      animate={{ y: ["100%", "0%", "0%", "-100%"] }}
      transition={{
        duration: 1,
        times: [0, 0.42, 0.58, 1],
        ease: [0.76, 0, 0.24, 1],
      }}
    />,
    document.body
  );
}

export default PageTransition;
