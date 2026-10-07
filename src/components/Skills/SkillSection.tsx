import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { cn } from "../../lib/utils";

/* ==========================================================================
   技能展示区 · 重复文字拼贴（visual first）
   ==========================================================================
   灵感来自 jiejoe 的「巨型重复文字 + 大留白」版式，拆成两层：
     · 背景层（装饰）：三行巨型技能词，随页面滚动横向掠过。
       用 useScroll 量「这一块区域」的滚动进度，再用 useTransform 把进度
       映射成横向位移 —— 位移完全由滚动驱动，不额外跑 CSS 动画。
       轨道由词表复制 4 份拼成，位移上限 = 1 份（25%），
       于是任何时刻屏上都还剩 3 份，不会露出空白。
     · 前景层（信息）：01 / 02 / 03 三条「i'm a + 角色 + 中文补充」，
       每条用「overflow: hidden 遮罩 + 内部上移」浮现（whileInView，只播一次）。

   三条必须记住的约定：
     1) 装饰性动效的播放 / 暂停只认站内开关 --motion-play-state（默认 running），
        刻意不跟 prefers-reduced-motion：站长这台机器的系统「动画效果」是关闭的
        （Chrome 会一直上报 reduce），跟随系统 = 这一块永远静止。详见 src/index.css。
        开关为 paused 时：不再写横向位移，前景条目直接以最终状态出现（不隐藏内容）。
     2) 颜色全部走设计令牌（var(--text-primary) + opacity 得到灰度），
        深浅两套主题下都自动是「恰好的灰」，不写死任何色值。
     3) 背景文字是纯装饰：aria-hidden + pointer-events-none + select-none，
        读屏、鼠标、文本选中都不受影响。
   ========================================================================== */

/* --------------------------------------------------------------------------
   数据与常量（想换词 / 换条目只改这一段）
   -------------------------------------------------------------------------- */

/** 背景巨型文字的词表：顺序即视觉节奏，重复排列 */
const MARQUEE_WORDS = ["FRONTEND", "BACKEND", "AUTOMATION", "REACT", "PYTHON"];

/** 轨道复制份数：4 份 → 单份占轨道 25%，位移上限正好一份，屏上始终留 3 份 */
const MARQUEE_COPIES = 4;

/**
 * 三行背景的差异全在这里：字号、字重、实心 / 空心。
 * 拼贴感正来自这种「不统一」—— 三行横向速度与方向也各不相同。
 */
const MARQUEE_ROWS = [
  {
    id: "solid-lg",
    fontSize: "clamp(56px, 10.5vw, 168px)",
    weight: 700,
    outline: false,
    opacity: 0.07,
  },
  {
    id: "outline-md",
    fontSize: "clamp(42px, 7.6vw, 118px)",
    weight: 300,
    outline: true,
    opacity: 0.5,
  },
  {
    id: "solid-xl",
    fontSize: "clamp(64px, 12vw, 192px)",
    weight: 700,
    outline: false,
    opacity: 0.05,
  },
];

/** 轨道内容 = 词表 × 份数（模块级算一次，渲染时只做 map） */
const MARQUEE_TRACK = Array.from(
  { length: MARQUEE_COPIES },
  () => MARQUEE_WORDS
).flat();

/** 前景技能条目：编号 / 角色 / 中文补充 */
const SKILLS = [
  { no: "01", role: "Frontend Developer", note: "爱做一些奇奇怪怪的交互" },
  { no: "02", role: "Backend Developer", note: "爱写一些莫名其妙的自动化脚本" },
  { no: "03", role: "UX Designer", note: "爱做一些不拘一格的界面" },
];

/** 左右各淡出 10%：巨型文字「从边缘长出来 / 消失」，不出现硬切边 */
const EDGE_FADE =
  "linear-gradient(90deg, rgba(0,0,0,0) 0%, #000 10%, #000 90%, rgba(0,0,0,0) 100%)";

/** 遮罩浮现：外层 overflow: hidden，内层从下方 118% 升到 0（expo-out 收尾很轻） */
const LINE_VARIANTS: Variants = {
  hidden: { y: "118%" },
  visible: {
    y: "0%",
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
};

/** 一条技能内部两行（角色 / 中文补充）依次升起来 */
const ITEM_VARIANTS: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

/** 遮罩容器：底部留 0.06em 余量，避免斜体与降部（p / y）被切掉 */
const MASK_CLASS = "block overflow-hidden pb-[0.06em]";

/* --------------------------------------------------------------------------
   站内动效总开关
   -------------------------------------------------------------------------- */

/**
 * 读 --motion-play-state（定义在 src/index.css 的 :root，默认 running）。
 * 拿不到时（jsdom / 老浏览器）按默认值处理，与 CSS 初始值保持一致。
 * 注意：这里读的是「站内开关」而不是系统的 prefers-reduced-motion —— 原因见文件头。
 */
function useMotionPlayState(): "running" | "paused" {
  const [playState, setPlayState] = useState<"running" | "paused">("running");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.getComputedStyle !== "function"
    ) {
      return;
    }
    const raw = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--motion-play-state")
      .trim();
    if (raw === "paused") setPlayState("paused");
  }, []);

  return playState;
}

type SkillSectionProps = {
  /** 锚点 id：从别处可以直接 #skill 跳过来 */
  id?: string;
  /** 外部覆盖样式（约定统一用 cn 合并，后者胜） */
  className?: string;
};

/* --------------------------------------------------------------------------
   组件
   -------------------------------------------------------------------------- */

function SkillSection({ id = "skill", className }: SkillSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const playing = useMotionPlayState() === "running";

  /* 滚动进度：0 = 区块顶边刚碰到视口底边；1 = 区块底边离开视口顶边。
     target 交给 section 自身，因此进度只跟「这一块」有关，与页面长短无关。 */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  /* 再挂一条弹簧：滚轮是一格一格跳的，文字要滑出去。Lenis 已经平滑过一层，
     这里补的是「重量感」，同时保证快速滚动时不瞬移、不抖。 */
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.4,
  });

  /* 三行三种走法（端点都落在「一份宽度 = 25%」的整数倍上，位移完仍有 3 份在屏）：
       · 第一行：向左，基准速度
       · 第二行：向右（反向），形成交错
       · 第三行：向左，但从半份处起步 → 视觉上更慢、更靠后 */
  const rowA = useTransform(progress, [0, 1], ["0%", "-25%"]);
  const rowB = useTransform(progress, [0, 1], ["-25%", "0%"]);
  const rowC = useTransform(progress, [0, 1], ["-6.25%", "-31.25%"]);
  const rowX = [rowA, rowB, rowC];

  return (
    <section
      id={id}
      ref={sectionRef}
      data-motion={playing ? "playing" : "paused"}
      className={cn(
        "skill-section relative isolate w-full overflow-hidden",
        "py-[13vh] md:py-[16vh]",
        className
      )}
    >
      {/* ---------- 背景层：巨型重复文字（纯装饰，随滚动横向掠过） ---------- */}
      <div
        aria-hidden="true"
        data-skill-marquee="true"
        className="pointer-events-none absolute inset-0 z-0 flex select-none flex-col justify-center gap-[1.2vh]"
        style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
      >
        {MARQUEE_ROWS.map((row, index) => (
          <motion.div
            key={row.id}
            data-skill-marquee-row={row.id}
            className="flex w-max items-baseline whitespace-nowrap leading-[0.86] will-change-transform"
            style={{
              /* 行内权重写死在这里：字重、字号、灰度都是「拼贴」的一部分 */
              fontSize: row.fontSize,
              fontWeight: row.weight,
              opacity: row.opacity,
              /* 总开关为 paused 时不挂 x —— 装饰层停住、也不留下中间态的位移 */
              ...(playing ? { x: rowX[index] } : {}),
            }}
          >
            {MARQUEE_TRACK.map((word, wordIndex) => (
              <React.Fragment key={`${row.id}-${wordIndex}`}>
                <span
                  style={
                    row.outline
                      ? {
                          /* 空心描边字：这是三行里唯一「极细」的一行，轮廓来自描边而非字重 */
                          color: "transparent",
                          WebkitTextStrokeWidth: "1px",
                          WebkitTextStrokeColor: "var(--text-tertiary)",
                        }
                      : undefined
                  }
                >
                  {word}
                </span>
                <span
                  className="mx-[0.18em] text-[0.3em]"
                  style={{
                    color: row.outline
                      ? "var(--text-tertiary)"
                      : "var(--text-primary)",
                  }}
                >
                  ✦
                </span>
              </React.Fragment>
            ))}
          </motion.div>
        ))}
      </div>

      {/* ---------- 前景层：编号 + 遮罩浮现的技能条目 ---------- */}
      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <header className="mb-[5vh] flex items-end justify-between gap-6 border-b border-hairline pb-4">
          <h2 className="m-0 text-[12px] font-medium uppercase tracking-[0.34em] text-ink-2">
            技能 · SKILLS
          </h2>
          <p className="m-0 hidden text-[11px] tracking-[0.18em] text-ink-3 sm:block">
            向下滚动 · 背景会跟着走
          </p>
        </header>

        <ol className="m-0 list-none p-0">
          {SKILLS.map((skill) => (
            <motion.li
              key={skill.no}
              data-skill-item={skill.no}
              className="group border-t border-hairline last:border-b"
              variants={ITEM_VARIANTS}
              /* 只有播放态才从遮罩里升起来；暂停态用 initial={false} 直接呈现
                 最终状态 —— 关掉动效也绝不把内容藏在遮罩里（白屏 / 隐形事故的来源） */
              initial={playing ? "hidden" : false}
              whileInView="visible"
              viewport={{ once: true, amount: 0.35 }}
            >
              <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 py-[4.2vh] md:grid-cols-[64px_1fr] md:gap-x-8">
                {/* 编号 */}
                <span className="pt-[0.35em] font-mono text-[11px] tracking-[0.24em] text-ink-3 transition-colors duration-500 ease-out group-hover:text-ink">
                  {skill.no}
                </span>

                <div className="min-w-0">
                  {/* 第一行：「i'm a」+ 角色名 */}
                  <div className={MASK_CLASS} data-skill-line="role">
                    <motion.span
                      className="flex flex-wrap items-baseline gap-x-[0.32em] will-change-transform"
                      variants={LINE_VARIANTS}
                    >
                      <span className="text-[clamp(18px,2vw,28px)] font-light italic tracking-[-0.01em] text-ink-2">
                        i&apos;m a
                      </span>
                      <span className="text-[clamp(28px,4.6vw,62px)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink transition-transform duration-700 ease-out group-hover:translate-x-[0.05em]">
                        {skill.role}
                      </span>
                    </motion.span>
                  </div>

                  {/* 第二行：中文补充（同一套遮罩，靠 stagger 晚一步升起） */}
                  <span className={cn(MASK_CLASS, "mt-[0.5em]")} data-skill-line="note">
                    <motion.span
                      className="block text-[clamp(14px,1.4vw,18px)] leading-[1.75] text-ink-2 will-change-transform"
                      variants={LINE_VARIANTS}
                    >
                      {skill.note}
                    </motion.span>
                  </span>
                </div>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default SkillSection;

