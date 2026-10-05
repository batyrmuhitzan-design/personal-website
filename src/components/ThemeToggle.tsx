import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FiMoon, FiSun } from "react-icons/fi";
import { cn } from "../lib/utils";
import { useTheme } from "../theme/ThemeContext";

/**
 * 日夜模式切换按钮（胶囊滑块 + 日月图标）
 * ==================================================================
 * · 交互：整块是 <button role="switch">（可点、可 Tab、可空格/回车触发），
 *   aria-checked 反映「是否深色」，读屏能直接念出当前状态。
 * · 微交互（全部交给 framer-motion，走内联 style 逐帧更新，不受 CSS transition 覆盖）：
 *     1) 滑块：位置用 spring 平移，不是「咔」一下跳过去；
 *     2) 图标：太阳 / 月亮做「旋转 + 缩放 + 淡入淡出」的交叉切换，
 *        旋转方向左右对称（进入转 0°、退出转 ±90°），像两个齿轮接力；
 *     3) 未激活的一侧只留一个低对比度的静态图标，克制、不抢视线。
 * · 尊重 prefers-reduced-motion：此时全部改成瞬时切换（不做位移与旋转）。
 */

/** 弹簧参数：略硬一点，点下去「跟手」，停下时不回弹过头 */
const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.6 } as const;

/** 滑块几何：轨道 56 × 30，滑块 22，左右各留 3px 内边距 → 位移 28px */
const TRACK_PADDING = 3;
const KNOB_TRAVEL = 56 - 22 - TRACK_PADDING * 2;
/** 图标退出时旋转的角度（左偏 / 右偏，形成方向感） */
const ICON_EXIT_ANGLE = 90;

export type ThemeToggleProps = {
  /** 追加类名（在 Header 里用来微调间距） */
  className?: string;
};

function ThemeToggle({ className }: ThemeToggleProps) {
  const { isDark, toggle } = useTheme();
  const reduceMotion = useReducedMotion();
  /** 减少动态效果时：位移 / 旋转全部归零，只保留极短的淡入淡出 */
  const transition = reduceMotion ? { duration: 0 } : SPRING;
  const iconTransition = reduceMotion ? { duration: 0.12 } : { duration: 0.32, ease: "easeOut" };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      title={isDark ? "浅色模式" : "深色模式"}
      onClick={toggle}
      className={cn(
        "theme-switch focus-ring group relative inline-flex h-[30px] w-[56px] shrink-0 items-center rounded-full",
        "border border-hairline bg-elevated p-0",
        "transition-colors duration-300 hover:border-hairline-strong",
        className
      )}
    >
      {/* 底衬图标：两端各一枚，未激活的一侧保持低对比 */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-between px-[9px] text-[13px] text-ink-3"
      >
        <FiSun />
        <FiMoon />
      </span>

      {/* 滑块：实心圆 + 当前模式图标（交叉旋转切换） */}
      <motion.span
        aria-hidden="true"
        className="relative z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent text-accent-contrast"
        style={{ marginLeft: TRACK_PADDING }}
        initial={false}
        animate={{ x: isDark ? KNOB_TRAVEL : 0 }}
        transition={transition}
      >
        <motion.span
          className="absolute inline-flex"
          initial={false}
          animate={{
            rotate: isDark ? -ICON_EXIT_ANGLE : 0,
            scale: isDark ? 0.4 : 1,
            opacity: isDark ? 0 : 1,
          }}
          transition={iconTransition}
        >
          <FiSun />
        </motion.span>
        <motion.span
          className="absolute inline-flex"
          initial={false}
          animate={{
            rotate: isDark ? 0 : ICON_EXIT_ANGLE,
            scale: isDark ? 1 : 0.4,
            opacity: isDark ? 1 : 0,
          }}
          transition={iconTransition}
        >
          <FiMoon />
        </motion.span>
      </motion.span>
    </button>
  );
}

export default ThemeToggle;
