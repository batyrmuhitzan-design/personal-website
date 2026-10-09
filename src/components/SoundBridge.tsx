import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { HOVER_SELECTOR, isInteractiveTarget, playSfx } from "../lib/sound";

/**
 * 音效桥（SoundBridge）· 不产生任何 DOM
 * ==================================================================
 * 全站微音效用**事件委托**接，而不是给几十个按钮逐个挂 onMouseEnter：
 *   · pointerover / pointerout（捕获阶段）：鼠标划进「链接 / 按钮 / [data-sfx-hover]」
 *     时响一声 hover。用 lastHover 记住当前元素 —— 在同一个按钮内部移动
 *     （图标 ↔ 文字）不会再响，否则会「滋啦滋啦」连成一片；
 *   · pointerdown：落在可交互元素上才响 click（点空白处不该有声音）；
 *   · 路由切换：pathname 变了响一声 open（首帧不响：刚进站那次不是用户操作）。
 *
 * 为什么用 pointer* 而不是 mouse*：触屏 / 手写笔上 pointerover 一样会来，
 * 而 mouseover 在触屏上是模拟事件，容易在「点一下」时同时触发 hover + click 两声。
 *
 * 挂载位置：App.js 的 <Router> 内部（要用 useLocation），和 ScrollToTop 并排。
 */
function SoundBridge() {
  const { pathname } = useLocation();
  const firstRoute = useRef(true);

  useEffect(() => {
    let lastHover: Element | null = null;

    const onOver = (event: Event) => {
      const target = event.target;
      if (!isInteractiveTarget(target)) return;
      const hit = (target as Element).closest(HOVER_SELECTOR);
      if (!hit || hit === lastHover) return;
      lastHover = hit;
      playSfx("hover");
    };

    const onOut = (event: Event) => {
      if (event.target === lastHover) lastHover = null;
    };

    const onDown = (event: Event) => {
      if (!isInteractiveTarget(event.target)) return;
      lastHover = null;
      playSfx("click");
    };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, []);

  /* 路由切换：遮罩扫过的那一下配一声「开」，切页有「进入下一个场景」的实感。
     首帧跳过 —— 用户还没动过任何东西，先响一声会像「站点自己在叫」。 */
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    playSfx("open");
  }, [pathname]);

  return null;
}

export default SoundBridge;
