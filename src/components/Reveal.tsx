import React, { useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import { cn } from "../lib/utils";
import { useMotionPlaying } from "../lib/useMotionPlayState";

/**
 * 滚动入场（Reveal）
 * ==========================================================================
 * 全站复用的「淡入 + 位移」入场包装：
 *   <Reveal direction="up" delay={0.1}>…</Reveal>
 * 触发方式是 framer-motion 的 whileInView（内部用 IntersectionObserver），
 * 元素进入视口就播一次，默认只播一次（once），不会来回闪。
 *
 * 三条约定：
 *   1) 装饰性动效的总开关是 --motion-play-state（见 src/lib/useMotionPlayState）：
 *      开关为 paused 时直接以「终止状态」渲染（initial={false}），
 *      内容永远可见 —— 关动效不等于丢内容。
 *   2) 位移量默认 24px、时长 0.7s、ease 用 expo-out（收尾极轻），
 *      这是「高级感」而不是「弹跳感」的来源；想更夸张再传 distance / duration。
 *   3) 包装元素默认是 div；在列表里可以传 as="li" / as="section"，
 *      避免多套一层影响 Bootstrap 栅格（Col 内部的百分比高度靠容器撑开）。
 */

export type RevealDirection = "up" | "down" | "left" | "right" | "fade" | "zoom";

/** expo-out：起步快、收尾轻，比 ease-out 更「贵」 */
const EASE = [0.16, 1, 0.3, 1] as const;

/** 只放开这几个标签，避免把任意组件塞进 motion() 带来类型与 ref 的坑 */
const MOTION_TAGS = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  span: motion.span,
  li: motion.li,
  ul: motion.ul,
  header: motion.header,
} as const;

export type RevealTag = keyof typeof MOTION_TAGS;

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** 入场方向；fade 只有透明度、zoom 只有轻微缩放 */
  direction?: RevealDirection;
  /** 位移距离（px），direction="fade" 时忽略 */
  distance?: number;
  /** 延迟（秒）：列表里按 index 递增即可做出「依次浮现」 */
  delay?: number;
  /** 时长（秒） */
  duration?: number;
  /** 只在第一次进入视口时播放（默认 true） */
  once?: boolean;
  /** 元素露出多少比例算「进入视口」（0~1，默认 0.2） */
  amount?: number;
  /** 包装标签，默认 div */
  as?: RevealTag;
  style?: React.CSSProperties;
  /** 便于 e2e / 浏览器探针定位 */
  id?: string;
};

/** 方向 → 初始位移 */
function hiddenState(direction: RevealDirection, distance: number) {
  switch (direction) {
    case "up":
      return { y: distance };
    case "down":
      return { y: -distance };
    case "left":
      return { x: distance };
    case "right":
      return { x: -distance };
    case "zoom":
      return { scale: 0.965 };
    default:
      return {};
  }
}

function Reveal({
  children,
  className,
  direction = "up",
  distance = 24,
  delay = 0,
  duration = 0.7,
  once = true,
  amount = 0.2,
  as = "div",
  style,
  id,
}: RevealProps) {
  const playing = useMotionPlaying();

  const Component = MOTION_TAGS[as];

  const variants: Variants = useMemo(
    () => ({
      hidden: { opacity: 0, ...hiddenState(direction, distance) },
      visible: {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        transition: { duration, delay, ease: EASE },
      },
    }),
    [direction, distance, delay, duration]
  );

  /* 播放态：从 hidden 起步、进入视口播到 visible；
     暂停态：initial={false} 直接呈现最终外观（不挂 variants，也就不会被藏住） */
  if (!playing) {
    return (
      <div
        id={id}
        style={style}
        data-reveal="paused"
        className={cn("reveal", className)}
      >
        {children}
      </div>
    );
  }

  return (
    <Component
      id={id}
      style={style}
      data-reveal="playing"
      className={cn("reveal", className)}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
    >
      {children}
    </Component>
  );
}

export default Reveal;
