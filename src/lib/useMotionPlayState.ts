import { useEffect, useState } from "react";

/**
 * 站内「装饰性动效」总开关
 * ==================================================================
 * 读 CSS 变量 --motion-play-state（定义在 src/index.css 的 :root，默认 running）。
 * 拿不到时（jsdom / 老浏览器）按默认值 running 处理，与 CSS 初始值保持一致。
 *
 * ⚠️ 这里刻意读「站内开关」而不是系统的 prefers-reduced-motion：
 * 站长这台机器的系统「动画效果」是关闭的（SPI_GETCLIENTAREAANIMATION = False），
 * Chrome 会一直上报 reduce —— 跟随系统就等于全站动效永久静止。
 * 想改成跟随系统，只需要在 src/index.css 里把那段 @media 的注释打开，
 * 一行搞定，不需要改任何组件。详见 index.css 里 --motion-play-state 的说明。
 *
 * 使用约定（很重要）：
 *   动效关闭时「不能丢信息」—— 入场动画要直接用终止状态呈现（initial={false}），
 *   绝不把内容留在 opacity: 0 / 位移里。Reveal / Parallax / PageTransition 都遵守这条。
 */

export type MotionPlayState = "running" | "paused";

/** 变量名集中在这里，避免各组件各写一遍字符串 */
export const MOTION_PLAY_STATE_VAR = "--motion-play-state";

export default function useMotionPlayState(): MotionPlayState {
  const [playState, setPlayState] = useState<MotionPlayState>("running");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.getComputedStyle !== "function"
    ) {
      return;
    }
    const raw = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue(MOTION_PLAY_STATE_VAR)
      .trim();
    if (raw === "paused") setPlayState("paused");
  }, []);

  return playState;
}

/** 便捷布尔：true = 允许播放装饰性动效 */
export function useMotionPlaying(): boolean {
  return useMotionPlayState() === "running";
}
