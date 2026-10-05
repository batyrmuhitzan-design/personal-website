import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "../lib/utils";

/**
 * 首屏加载遮罩（LoadingScreen）
 * ==================================================================
 * 时间轴（默认值）：
 *   t = 0ms      纯黑遮罩铺满全屏；超大标题「SHA SHA」逐字从遮罩下顶上浮出，
 *                副标语「CODE. CREATE. AUTOMATE.」随后整行遮罩浮现（错落有致）
 *   t = 2000ms   遮罩整体向上滑出（底边拖一条 1px 白线，像幕布被拉起），露出主页面
 *   t = 2800ms   离场结束 → onComplete()：由 App 解锁滚动并启动 Lenis
 *
 * 几个关键取舍：
 * · 上滑用「变体切换」（boot → leave）而不是 AnimatePresence：组件常驻 App、
 *   离场完成后自己 return null，App 不需要额外维护一套在场/不在场状态机；
 * · 离场用 setTimeout(exitMs) 计时，而不是 onAnimationComplete：离场时长与动画
 *   时长取自同一个 prop，行为确定、可单测，也不依赖 rAF 在 jsdom 里的表现；
 * · 遮罩在场期间锁住 <html> 的 overflow，结束时自动还原，防止入场动画被误滚动打断；
 * · 尊重 prefers-reduced-motion：此时不做位移与逐字错落，只做一次极短淡出。
 */

/** 超大标题：逐字遮罩浮现（每个字一个 overflow:hidden 舞台） */
const TITLE = "SHA SHA";
/** 副标语：整行遮罩浮现 */
const SUBTITLE = "CODE. CREATE. AUTOMATE.";
/** 右下角小字提示 */
const HINT = "Scroll carefully, it's smooth — 小心地滑";

export type LoadingScreenProps = {
  /** 文字停留时长（ms），到点后遮罩开始上滑 */
  holdMs?: number;
  /** 上滑离场时长（ms），与 leave 变体的 duration 保持一致 */
  exitMs?: number;
  /** 遮罩完全离场后回调（此时才该解锁滚动 / 启动 Lenis） */
  onComplete?: () => void;
  title?: string;
  subtitle?: string;
  hint?: string;
  /** 追加类名（默认已铺满全屏，一般不需要传） */
  className?: string;
};

/** 缓出：起手快、收尾稳（超大文字的浮现用它最有冲击力） */
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
/** 缓入缓出：整块黑幕上滑用它，加速与减速对称 */
const EASE_IN_OUT_QUINT: [number, number, number, number] = [0.76, 0, 0.24, 1];

/** 黑幕容器：fixed 铺满全屏 + 纯黑底 + 压住导航 / 播放器（光标仍在其上） */
const PANEL_CLASS = cn(
  "fixed inset-0 z-[999999] flex flex-col items-center justify-center",
  "overflow-hidden bg-black select-none"
);

type VariantSet = {
  /** 外层黑幕：boot 原位 → leave 整体上滑一屏 */
  panel: Variants;
  /** 内容层：离场时先淡出，不要整块跟着飞走 */
  content: Variants;
  /** 单个字：从舞台下沿顶出来 */
  char: Variants;
  /** 一行字的错落节奏（custom = 这一行何时开始，单位秒） */
  line: Variants;
  /** 黑幕底边那条 1px 白线：离场瞬间亮起 */
  seam: Variants;
  /** 右下角提示：等标题浮完再出现 */
  hint: Variants;
};

/**
 * 变体集中构建：减少动态效果时整体降级为「淡入淡出 + 零错落」。
 * 用 useMemo 缓存，保证对象引用稳定 —— 否则每次渲染都会让 framer-motion 重新解析变体。
 */
function buildVariants(reduce: boolean, leaveMs: number): VariantSet {
  const leaveSec = leaveMs / 1000;

  return {
    panel: {
      boot: { y: "0%", opacity: 1 },
      leave: reduce
        ? { opacity: 0, transition: { duration: leaveSec, ease: "easeOut" } }
        : { y: "-100%", transition: { duration: leaveSec, ease: EASE_IN_OUT_QUINT } },
    },

    content: {
      boot: { opacity: 1 },
      leave: {
        opacity: 0,
        y: reduce ? 0 : -28,
        transition: { duration: leaveSec * 0.45, ease: "easeIn" },
      },
    },

    char: reduce
      ? {
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { duration: 0.12 } },
        }
      : {
          hidden: { y: "115%" },
          visible: { y: "0%", transition: { duration: 0.9, ease: EASE_OUT_EXPO } },
        },

    line: {
      hidden: {},
      visible: (delay: number = 0) => ({
        transition: {
          staggerChildren: reduce ? 0 : 0.045,
          delayChildren: reduce ? Math.min(delay, 0.1) : delay,
        },
      }),
    },

    seam: {
      boot: { opacity: 0 },
      leave: { opacity: 1, transition: { duration: 0.12, ease: "easeOut" } },
    },

    hint: reduce
      ? {
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { duration: 0.2, delay: 0.1 } },
        }
      : {
          hidden: { opacity: 0, y: 12 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.7, ease: EASE_OUT_EXPO, delay: 1.05 },
          },
        },
  };
}

function LoadingScreen({
  holdMs = 2000,
  exitMs = 800,
  onComplete,
  title = TITLE,
  subtitle = SUBTITLE,
  hint = HINT,
  className,
}: LoadingScreenProps) {
  const reduce = useReducedMotion() ?? false;
  const [leaving, setLeaving] = useState(false); // 是否已进入上滑离场
  const [done, setDone] = useState(false); // 离场结束、可以移出 DOM

  /* 减少动态效果时：不做上滑，只做一次极短淡出 */
  const leaveMs = reduce ? 160 : exitMs;
  const variants = useMemo(() => buildVariants(reduce, leaveMs), [reduce, leaveMs]);

  /* onComplete 通常写成内联箭头函数，用 ref 存住它，避免把计时器放进依赖里反复重排 */
  const completeRef = useRef(onComplete);
  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  /* 1) 停留 holdMs：遮罩铺满、文字浮现完毕 → 开始离场 */
  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), Math.max(0, holdMs));
    return () => clearTimeout(timer);
  }, [holdMs]);

  /* 2) 离场 leaveMs：动画走完 → 移出 DOM + 回调一次（App 拿到回调才启动 Lenis） */
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => {
      setDone(true);
      completeRef.current?.();
    }, Math.max(0, leaveMs));
    return () => clearTimeout(timer);
  }, [leaving, leaveMs]);

  /* 3) 遮罩在场期间锁滚动：done 变 true 时 cleanup 自动还原，组件被卸载同理 */
  useEffect(() => {
    if (done) return undefined;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, [done]);

  // 离场结束：整个遮罩移出 DOM（组件本身留在树里，不产生任何节点）
  if (done) return null;

  // 逐字拆分：空格换成不换行空格，否则 inline-block 的舞台会把空格吃掉
  const titleChars = Array.from(title).map((char) => (char === " " ? "\u00A0" : char));

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label="页面加载中"
      className={cn(PANEL_CLASS, className)}
      variants={variants.panel}
      initial="boot"
      animate={leaving ? "leave" : "boot"}
    >
      {/* 内容层：随黑幕上滑前先自行淡出 */}
      <motion.div
        variants={variants.content}
        className="flex w-full flex-col items-center justify-center px-[6vw]"
      >
        {/* 超大标题：逐字遮罩浮现（每字一个 overflow:hidden 舞台） */}
        <h1
          className="m-0 flex flex-col items-center font-sans font-bold uppercase leading-[0.85] tracking-[-0.04em] text-white"
          style={{ fontSize: "clamp(3.2rem, 15vw, 12rem)" }}
        >
          <span className="sr-only">{title}</span>
          <motion.span
            aria-hidden="true"
            className="flex justify-center"
            variants={variants.line}
            custom={0.15}
            initial="hidden"
            animate="visible"
          >
            {titleChars.map((char, index) => (
              <span
                key={`${char}-${index}`}
                // 舞台：高度刚好包住一行字，多留一点底边避免窄体字符被切到
                className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em]"
              >
                <motion.span
                  variants={variants.char}
                  className="inline-block will-change-transform"
                >
                  {char}
                </motion.span>
              </span>
            ))}
          </motion.span>
        </h1>

        {/* 副标语：整行遮罩浮现，跟在标题后错开出现 */}
        <p
          className="m-0 mt-[clamp(1rem,2.6vw,1.9rem)] text-center font-sans font-medium uppercase text-white/60"
          style={{ fontSize: "clamp(0.6rem, 1.35vw, 0.95rem)", letterSpacing: "0.42em" }}
        >
          <span className="sr-only">{subtitle}</span>
          <span aria-hidden="true" className="block overflow-hidden">
            <motion.span
              className="block"
              variants={variants.line}
              custom={0.75}
              initial="hidden"
              animate="visible"
            >
              <motion.span variants={variants.char} className="inline-block">
                {subtitle}
              </motion.span>
            </motion.span>
          </span>
        </p>

        {/* 进度线：1px 细线在 holdMs 内匀速拉满，配合上滑当作唯一的「量」 */}
        <span
          aria-hidden="true"
          className="mt-[clamp(1.6rem,4vw,3rem)] block h-px w-[min(72vw,520px)] overflow-hidden bg-white/20"
        >
          <motion.span
            className="block h-full w-full origin-left bg-white"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={
              reduce
                ? { duration: 0.2 }
                : { duration: holdMs / 1000, ease: "linear" }
            }
          />
        </span>
      </motion.div>

      {/* 右下角提示 */}
      <motion.p
        className={cn(
          "pointer-events-none absolute m-0 text-right font-mono text-[10px] uppercase",
          "tracking-[0.22em] text-white/60 sm:text-[11px]",
          "bottom-[clamp(1rem,3vw,2rem)] right-[clamp(1rem,3vw,2.5rem)]"
        )}
        variants={variants.hint}
        initial="hidden"
        animate="visible"
      >
        {hint}
      </motion.p>

      {/* 黑幕底边：离场瞬间亮起，成为「被拉起的幕布」边缘 */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white"
        variants={variants.seam}
      />
    </motion.div>
  );
}

export default LoadingScreen;

