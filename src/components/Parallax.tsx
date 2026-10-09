import React, { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { cn } from "../lib/utils";
import useMotionPlayState from "../lib/useMotionPlayState";

/**
 * 视差层（Parallax）
 * ==========================================================================
 * 给其中的内容加一点「跟滚动不同步」的纵向位移，制造空间层次：
 *   <Parallax speed={28}>…</Parallax>
 *
 * 实现要点：
 * · 用 useScroll 量「这块元素自己」的滚动进度（0 = 顶边刚进视口，
 *   1 = 底边离开视口），再用 useTransform 映射成垂直位移，与页面长短无关；
 * · 位移经过一条弹簧（useSpring）—— 滚轮是一格一格跳的，弹簧负责把
 *   「跳」变成「滑」；Lenis 已经平滑过一层，这里补的是重量感；
 * · 总开关 --motion-play-state 为 paused 时不挂 y（只剩静态元素）；
 * · 位移只改 transform（合成层），不会引起重排，滚动时是 60fps 的活儿。
 */

type ParallaxProps = {
  children: React.ReactNode;
  className?: string;
  /** 位移幅度（px）：正值 = 向上漂（看起来更慢）；负值 = 向下沉（看起来更快） */
  speed?: number;
  style?: React.CSSProperties;
};

function Parallax({ children, className, speed = 24, style }: ParallaxProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const playing = useMotionPlayState() === "running";

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 30,
    mass: 0.4,
  });
  const y = useTransform(progress, [0, 1], [speed, -speed]);

  return (
    <motion.div
      ref={ref}
      data-parallax={playing ? "playing" : "paused"}
      className={cn("parallax-layer", className)}
      style={playing ? { ...style, y } : style}
    >
      {children}
    </motion.div>
  );
}

export default Parallax;
