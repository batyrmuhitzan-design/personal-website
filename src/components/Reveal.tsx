import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { cn } from "../lib/utils";

/**
 * 滚动入场（Reveal）
 * ==========================================================================
 * 全站复用的「淡入 + 位移」入场包装：
 *   <Reveal direction="up" delay={0.1}>…</Reveal>
 * 元素进入视口就播一次（默认只播一次，不会来回闪）。
 *
 * 为什么不用 framer-motion 现成的 whileInView：
 *   whileInView 把入场判定的成败完全押在 IntersectionObserver 上 ——
 *   一旦环境里拿不到尺寸（测试用的 jsdom、挂载瞬间还是 0 高度的容器），
 *   回调永远不会来，元素就永久停在 opacity: 0 上，看着像「页面坏了」。
 *   这里自己包一层（useRevealInView）：优先用 IntersectionObserver（真浏览器），
 *   量不到布局就直接显示 —— 宁可不动效，也绝不把内容藏起来。
 *
 * 四条约定：
 *   1) 这里**刻意不读任何开关**：既不跟系统的 prefers-reduced-motion，也不读
 *      index.css 的 --motion-play-state。这台机器的系统「动画效果」是关的
 *      （Chrome 一直上报 reduce），跟随系统等于入场永不生效、元素停在 opacity: 0 ——
 *      看起来就是「网页坏了」。要全站静音请改 index.css 里那一个变量。
 *   2) 位移量默认 40px、时长 0.7s、ease 用 expo-out（收尾极轻）：
 *      40px 是「明显能看见在动、又不至于飞出去」的区间；想更夸张再传 distance / duration。
 *   3) start=false 时先按住不动（首屏要等加载遮罩退场再入场），
 *      翻成 true 才放开 —— 遮罩还没散就开始播动画是最常见的「入场白播」。
 *   4) 包装元素默认是 div；在列表里可以传 as="li" / as="section"，
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
  /** 位移距离（px），direction="fade" 时忽略；默认 40 */
  distance?: number;
  /** 延迟（秒）：列表里按 index 递增即可做出「依次浮现」 */
  delay?: number;
  /** 时长（秒） */
  duration?: number;
  /** 只在第一次进入视口时播放（默认 true） */
  once?: boolean;
  /**
   * 元素「顶边越过视口高度 × (1 - amount) 这条线」才算进入（0~1，默认 0.18）。
   * 数值越小越早触发（0 = 刚冒头就播）。
   */
  amount?: number;
  /**
   * 是否允许入场（默认 true）。false = 先按住不动，
   * 首屏用它等加载遮罩退场：<Reveal start={!loading}>
   */
  start?: boolean;
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
  distance = 40,
  delay = 0,
  duration = 0.7,
  once = true,
  amount = 0.18,
  start = true,
  as = "div",
  style,
  id,
}: RevealProps) {
  /* 标签是白名单里的动态值，类型上统一成 motion.div（ref 类型随之确定），
     运行时 framer-motion 并不关心宿主标签是什么 */
  const Component = MOTION_TAGS[as] as typeof motion.div;
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useRevealInView(ref, { once, amount, start });

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

  return (
    <Component
      id={id}
      ref={ref}
      style={style}
      data-reveal={inView ? "visible" : "waiting"}
      className={cn("reveal", className)}
      variants={variants}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
    >
      {children}
    </Component>
  );
}

export type UseRevealInViewOptions = {
  /** 只触发一次（true）还是进出视口来回触发（false），默认 true */
  once?: boolean;
  /** 触发线：顶边越过「视口高度 × (1 - amount)」，默认 0.18 */
  amount?: number;
  /** false = 先不参与判定（首屏等遮罩退场），默认 true */
  start?: boolean;
};

/**
 * 元素是否已经进入视口。
 * 判定顺序（从最可靠到最兜底）：
 *   1) IntersectionObserver 存在且元素量得出尺寸 → 交给它（含「挂载时已在视口内」
 *      的首次回调，所以真浏览器里首屏元素也会正常播入场）；
 *   2) 量不出尺寸（jsdom、还没布局的空盒）或没有 IO → 直接算「已进入」，
 *      宁可不动效也不把内容永久藏在 opacity: 0。
 */
export function useRevealInView(
  ref: React.RefObject<HTMLElement | null>,
  { once = true, amount = 0.18, start = true }: UseRevealInViewOptions = {}
) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!start) {
      setInView(false);
      return undefined;
    }

    const node = ref.current;
    if (!node) return undefined;

    const rect =
      typeof node.getBoundingClientRect === "function"
        ? node.getBoundingClientRect()
        : null;
    const measurable = Boolean(rect && (rect.width > 0 || rect.height > 0));

    if (!measurable || typeof IntersectionObserver !== "function") {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setInView(true);
          else if (!once) setInView(false);
        });
      },
      { threshold: 0, rootMargin: `0px 0px -${Math.round(amount * 100)}% 0px` }
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [amount, once, ref, start]);

  return inView;
}

export default Reveal;
