import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { PageTransition } from "./PageTransition";
import * as PageTransitionModule from "./PageTransition";

/**
 * 切页外壳（PageTransition）测试（jsdom）
 * ------------------------------------------------------------------
 * 真实转场依赖渲染帧与 AnimatePresence 的排期，这里只覆盖确定性的部分：
 *   1) 播放态是 motion.main + data-page-transition="playing"，并透传额外类名；
 *   2) 总开关（--motion-play-state）为 paused 时退化成普通 div —— 内容一帧都不少；
 *   3) RouteCurtain **已经被删除**：导航点击是同页平滑滚动，不再有全屏遮罩扫过，
 *      那块「盖着内容晃一下却什么也没推动」的幕布正是「点了没反应」的观感来源。
 */

/** 与 SkillSection.test.js 同款：包一层 getComputedStyle，只改写总开关的读数 */
const mockMotionPlayState = (value) => {
  const original = window.getComputedStyle;
  window.getComputedStyle = (element, pseudoElement) => {
    const real = original.call(window, element, pseudoElement);
    return new Proxy(real, {
      get(target, prop) {
        if (prop === "getPropertyValue") {
          return (name) =>
            name === "--motion-play-state"
              ? value
              : target.getPropertyValue(name);
        }
        const current = Reflect.get(target, prop, target);
        return typeof current === "function" ? current.bind(target) : current;
      },
    });
  };
  return () => {
    window.getComputedStyle = original;
  };
};

describe("PageTransition", () => {
  test("播放态：motion.main 外壳 + playing 标记，并透传额外类名", () => {
    const { container } = render(
      <PageTransition className="mx-auto">
        <span>页面内容</span>
      </PageTransition>
    );

    const shell = container.querySelector(".page-transition");
    expect(shell.tagName).toBe("MAIN");
    expect(shell).toHaveAttribute("data-page-transition", "playing");
    expect(shell.className).toContain("mx-auto");
    expect(screen.getByText("页面内容")).toBeInTheDocument();
  });

  test("总开关为 paused：退化成普通 div，内容依然可见", async () => {
    const restore = mockMotionPlayState("paused");
    const { container } = render(
      <PageTransition>
        <span>页面内容</span>
      </PageTransition>
    );

    await waitFor(() =>
      expect(container.querySelector(".page-transition").tagName).toBe("DIV")
    );

    const shell = container.querySelector(".page-transition");
    expect(shell).not.toHaveAttribute("data-page-transition");
    expect(shell.style.opacity).toBe("");
    expect(screen.getByText("页面内容")).toBeInTheDocument();

    restore();
  });
});

describe("RouteCurtain（已删除）", () => {
  test("模块里不再导出 RouteCurtain，页面里也不会出现遮罩节点", () => {
    expect(PageTransitionModule.RouteCurtain).toBeUndefined();
    expect(PageTransitionModule.default).toBe(PageTransition);

    render(
      <PageTransition>
        <span>页面内容</span>
      </PageTransition>
    );

    expect(document.querySelector("[data-route-curtain]")).toBeNull();
    expect(document.querySelector(".route-curtain")).toBeNull();
  });
});
