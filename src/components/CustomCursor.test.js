import React from "react";
import { render } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import CustomCursor from "./CustomCursor";

/**
 * 自定义光标测试（jsdom）
 * ------------------------------------------------------------------
 * 光标的两条核心路径里，弹簧动画（外圈跟随、hover 放大）依赖真实渲染帧，
 * 这里只覆盖确定性的部分，避免测试随机失败：
 *   1) 非「精确指针」设备：什么都不渲染，也不改 <html>、不注入样式；
 *   2) 精确指针设备：两个光标元素挂在 body 下、<html> 打上标记类、注入隐藏原生光标的样式；
 *   3) 鼠标移动时内点（不吃弹簧）立即跟到坐标上；
 *   4) 卸载后标记类与注入的样式都被清理干净。
 */

const ACTIVE_CLASS = "has-custom-cursor";

/** 等 framer-motion 的渲染帧跑完（motion value → DOM 是排队到帧里的） */
const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  });

/** 把 matchMedia 换成可控替身，返回还原函数 */
const mockPointerDevice = (finePointer) => {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({
    matches: finePointer && /hover: hover/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  return () => {
    window.matchMedia = original;
  };
};

describe("CustomCursor", () => {
  test("非精确指针设备：不渲染任何光标元素，也不改 <html>", async () => {
    const restore = mockPointerDevice(false);
    const { container } = render(<CustomCursor />);
    await nextFrame();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(0);
    expect(document.documentElement.classList.contains(ACTIVE_CLASS)).toBe(false);
    expect(document.querySelector("style[data-custom-cursor]")).toBeNull();

    restore();
  });

  test("精确指针设备：挂载圆环与内点、注入样式，移动鼠标时内点跟手", async () => {
    const restore = mockPointerDevice(true);
    const { unmount } = render(<CustomCursor />);
    await nextFrame();

    const cursors = document.body.querySelectorAll('div[aria-hidden="true"]');
    expect(cursors.length).toBe(2);
    expect(document.documentElement.classList.contains(ACTIVE_CLASS)).toBe(true);
    expect(document.querySelector("style[data-custom-cursor]")).not.toBeNull();

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 40, clientY: 50, bubbles: true })
      );
    });
    await nextFrame();

    // 外圈在前、内点在后；内点不经过弹簧，坐标应当直接命中
    const dotStyle = cursors[1].getAttribute("style") || "";
    expect(dotStyle).toContain("translateX(40px)");
    expect(dotStyle).toContain("translateY(50px)");

    unmount();
    expect(document.documentElement.classList.contains(ACTIVE_CLASS)).toBe(false);
    expect(document.querySelector("style[data-custom-cursor]")).toBeNull();

    // 等还在跑的弹簧（跟随 / 透明度）结算完，别把定时器留给 Jest
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    restore();
  });
});
