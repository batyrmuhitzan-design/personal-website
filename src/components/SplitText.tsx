import React, { useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import { cn } from "../lib/utils";
import { useMotionPlaying } from "../lib/useMotionPlayState";

/**
 * 逐字 / 逐词入场 + 黑白高亮扫过（SplitText）
 * ==========================================================================
 * 用法：
 *   <SplitText as="h1" className="heading" text="Hi There!" by="word" />
 *   <SplitText as="p" className="home-tagline" text={profile.slogan} by="word" />
 *
 * 两段动画叠在一起：
 *   ① 逐字（或逐词）入场 —— 每个单元从「下方 + 虚化 + 透明」收上来，
 *      stagger 让它们像被一阵风吹过，比整块淡入「贵」得多；
 *   ② 高亮扫过 —— 入场结束后，一道 `mix-blend-mode: difference` 的白色光带
 *      从左掠过。difference 混合会把经过的区域**反相**：白底黑字扫过变白、
 *      黑底白字扫过变黑，所以无论深浅主题都正好是「黑白一闪」，
 *      不需要为主题各写一套颜色。
 *
 * 三条约定（与 Reveal / Parallax 保持一致）：
 *   · 装饰性动效总开关 --motion-play-state 为 paused 时不挂任何 motion 动画，
 *     直接以纯文本渲染 —— 关动效 ≠ 丢内容，也没有一行字停在半透明状态；
 *   · 无障碍：可访问名用容器的 aria-label 给出（整句），逐字 span 一律 aria-hidden，
 *     否则屏幕阅读器会把一个词拆成一个个字念；
 *   · 逐字模式用 inline-block（transform 需要块级盒），空格换成 \u00A0 防止塌陷；
 *     长句（一句话签名那种）建议 by="word"，既省节点也更好读。
 */

/** 只放开这几个标签：够 hero 区用，也不会把任意组件塞进 motion() 带来的 ref 坑 */
const MOTION_TAGS = {
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  p: motion.p,
  div: motion.div,
  span: motion.span,
} as const;

export type SplitTextTag = keyof typeof MOTION_TAGS;

export type SplitTextProps = {
  /** 要拆分的纯文本（只支持字符串：拆完再拼回去的字必须和原文一模一样） */
  text: string;
  className?: string;
  /** 拆分粒度：char = 逐字（标题），word = 逐词（长句） */
  by?: "char" | "word";
  /** 整体延迟（秒） */
  delay?: number;
  /** 相邻单元的间隔（秒） */
  stagger?: number;
  /** 单个单元的时长（秒） */
  duration?: number;
  /** 初始下沉距离（px） */
  distance?: number;
  /** 命中这段子串的字额外挂 charClassName（Hero 里的名字高亮靠它） */
  highlight?: string;
  /** 高亮字附加的 class */
  charClassName?: string;
  /** 是否播放高亮扫过（默认 true） */
  sweep?: boolean;
  /** 扫过一次的时长（秒） */
  sweepDuration?: number;
  /** 包装标签（默认 h1） */
  as?: SplitTextTag;
  /** true = 进入视口才播（首屏之外的标题用），false = 挂载即播 */
  inView?: boolean;
};

/** expo-out：起步快、收尾轻 —— 与 Reveal 同一条曲线，整站手感一致 */
const EASE = [0.16, 1, 0.3, 1] as const;

type Unit = { key: string; value: string; highlighted: boolean; space: boolean };

/** 拆成「动画单元」：空格在逐词模式下不作为单元（交给普通文本节点撑开间距） */
function splitUnits(text: string, by: "char" | "word", highlight?: string): Unit[] {
  const start = highlight ? text.indexOf(highlight) : -1;
  const end = start >= 0 && highlight ? start + highlight.length : -1;

  if (by === "word") {
    let cursor = 0;
    return text
      .split(/(\s+)/)
      .filter((part) => part !== "")
      .map((part, index) => {
        const at = cursor;
        cursor += part.length;
        const isSpace = /^\s+$/.test(part);
        return {
          key: `${index}-${part}`,
          value: part,
          space: isSpace,
          highlighted: !isSpace && start >= 0 && at >= start && at < end,
        };
      });
  }

  return Array.from(text).map((char, index) => ({
    key: `${index}-${char}`,
    // 空格换成不断行空格：inline-block 会让普通空格塌陷，字距会跳
    value: char === " " ? "\u00A0" : char,
    space: char === " ",
    highlighted: start >= 0 && index >= start && index < end,
  }));
}

function SplitText({
  text,
  className,
  by = "char",
  delay = 0,
  stagger = 0.028,
  duration = 0.7,
  distance = 16,
  highlight,
  charClassName,
  sweep = true,
  sweepDuration = 1.1,
  as = "h1",
  inView = false,
}: SplitTextProps) {
  const playing = useMotionPlaying();
  const units = useMemo(() => splitUnits(text, by, highlight), [text, by, highlight]);

  const container: Variants = useMemo(
    () => ({
      hidden: {},
      visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
    }),
    [stagger, delay]
  );

  const unit: Variants = useMemo(
    () => ({
      hidden: { opacity: 0, y: distance, filter: "blur(6px)" },
      visible: {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        transition: { duration, ease: EASE },
      },
    }),
    [distance, duration]
  );

  /* 关动效：整句一次性渲染（不拆字），没有会卡住的中间态 */
  if (!playing) {
    return React.createElement(
      as,
      { className: cn("split-text", className), "data-split": "paused" },
      text
    );
  }

  const Component = MOTION_TAGS[as];
  const animated = { variants: unit };

  /* 扫过要等最后一个字进场之后才开始：延迟 = 整体延迟 + 全部单元的 stagger + 单个时长 */
  const sweepDelay = delay + (units.length - 1) * stagger + duration;

  return (
    <Component
      className={cn("split-text", className)}
      variants={container}
      initial="hidden"
      {...(inView
        ? { whileInView: "visible", viewport: { once: true, amount: 0.4 } }
        : { animate: "visible" })}
      aria-label={text}
      data-split={inView ? "in-view" : "on-mount"}
      style={
        sweep
          ? ({ "--split-sweep-delay": `${sweepDelay.toFixed(2)}s` } as React.CSSProperties)
          : undefined
      }
    >
      {units.map((item) =>
        item.space ? (
          <span key={item.key} aria-hidden="true">
            {item.value}
          </span>
        ) : (
          <motion.span
            key={item.key}
            aria-hidden="true"
            className={cn("split-text__unit", item.highlighted && charClassName)}
            {...animated}
          >
            {item.value}
          </motion.span>
        )
      )}
      {sweep ? <span className="split-text__sheen" aria-hidden="true" /> : null}
    </Component>
  );
}

export default SplitText;
