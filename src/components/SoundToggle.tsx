import React, { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FiVolume2, FiVolumeX } from "react-icons/fi";
import { cn } from "../lib/utils";
import { isSoundOn, playSfx, setSoundOn, sfxAvailable, subscribeSound } from "../lib/sound";

/**
 * 全局音效开关（右上角，与日夜切换同一套视觉语言）
 * ==================================================================
 * · 结构 / 几何 / 弹簧参数与 ThemeToggle 完全一致（56 × 30 胶囊 + 22 滑块），
 *   两个开关并排时是同一件东西的两种状态，不会一个「跳」一个「滑」；
 * · role="switch" + aria-checked：读屏能念出「音效 开 / 关」；
 * · 关闭时先响一声「close」再真的静音（否则关掉的那一下会哑掉，反馈缺失）；
 * · 状态由 src/lib/sound.ts 统一管理（含 localStorage 落盘），
 *   这里只订阅它 —— 别的地方也能改音效状态而 UI 不会跑偏；
 * · 配置里 sound.enabled = false 时整颗开关不渲染（连入口都不给）。
 */

/** 弹簧参数：与 ThemeToggle 相同，点下去「跟手」、停下不抖 */
const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.6 } as const;

/** 滑块几何：轨道 56 × 30，滑块 22，左右各 3px 内边距 */
const TRACK_PADDING = 3;
const KNOB_TRAVEL = 56 - 22 - TRACK_PADDING * 2;
/** 图标退出角度（与 ThemeToggle 的 ±90° 对齐） */
const ICON_EXIT_ANGLE = 90;

export type SoundToggleProps = {
  /** 追加类名（Header 里用来调间距） */
  className?: string;
};

function SoundToggle({ className }: SoundToggleProps) {
  const reduceMotion = useReducedMotion();
  /** 环境是否支持发声（Web Audio + 配置允许）—— 不支持就整颗按钮不存在 */
  const available = sfxAvailable();
  const [on, setOn] = useState<boolean>(isSoundOn);

  /* 订阅引擎里的状态：任何来源的改动（含其它组件）都会同步到这里 */
  useEffect(() => {
    if (!available) return undefined;
    const unsubscribe = subscribeSound(setOn);
    setOn(isSoundOn());
    return unsubscribe;
  }, [available]);

  const toggle = useCallback(() => {
    const next = !on;
    // 关之前先响：否则「关闭」这个动作本身没有声音反馈
    if (!next) playSfx("close");
    setSoundOn(next);
    if (next) playSfx("toggle");
  }, [on]);

  if (!available) return null;

  const transition = reduceMotion ? { duration: 0 } : SPRING;
  const iconTransition = reduceMotion ? { duration: 0.12 } : { duration: 0.32, ease: "easeOut" };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "关闭音效" : "开启音效"}
      title={on ? "音效：开（点击静音）" : "音效：关（点击开启）"}
      onClick={toggle}
      data-sound-toggle={on ? "on" : "off"}
      className={cn(
        "sound-switch focus-ring group relative inline-flex h-[30px] w-[56px] shrink-0 items-center rounded-full",
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
        <FiVolumeX />
        <FiVolume2 />
      </span>

      {/* 滑块：实心圆 + 当前状态图标（交叉旋转切换，和日夜开关同一手法） */}
      <motion.span
        aria-hidden="true"
        className="relative z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent text-accent-contrast"
        style={{ marginLeft: TRACK_PADDING }}
        initial={false}
        animate={{ x: on ? KNOB_TRAVEL : 0 }}
        transition={transition}
      >
        <motion.span
          className="absolute inline-flex"
          initial={false}
          animate={{
            rotate: on ? -ICON_EXIT_ANGLE : 0,
            scale: on ? 0.4 : 1,
            opacity: on ? 0 : 1,
          }}
          transition={iconTransition}
        >
          <FiVolumeX />
        </motion.span>
        <motion.span
          className="absolute inline-flex"
          initial={false}
          animate={{
            rotate: on ? 0 : ICON_EXIT_ANGLE,
            scale: on ? 1 : 0.4,
            opacity: on ? 1 : 0,
          }}
          transition={iconTransition}
        >
          <FiVolume2 />
        </motion.span>
      </motion.span>
    </button>
  );
}

export default SoundToggle;
