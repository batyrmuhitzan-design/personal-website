import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import Parallax from "./Parallax";

/**
 * 视差层（Parallax）测试（jsdom）
 * ------------------------------------------------------------------
 * jsdom 没有真实滚动距离与布局尺寸，所以「滚动多少 → 位移多少」这条
 * 曲线交给浏览器验证；这里覆盖确定性的部分：
 *   1) 包一层 parallax-layer，并透传额外类名 / style；
 *   2) 播放态：滚动进度被接到垂直位移上（speed 决定幅度）；
 *   3) 总开关为 paused 时不再挂位移，内容仍然完整可见。
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

describe("Parallax", () => {
  test("包一层 parallax-layer，并透传额外类名与子内容", () => {
    const { container } = render(
      <Parallax speed={28} className="hero-avatar">
        <span>视差层内容</span>
      </Parallax>
    );

    const layer = container.firstElementChild;
    expect(layer).toHaveAttribute("data-parallax", "playing");
    expect(layer.className).toContain("parallax-layer");
    expect(layer.className).toContain("hero-avatar");
    expect(screen.getByText("视差层内容")).toBeInTheDocument();
  });

  test("播放态：滚动进度映射成垂直位移，幅度由 speed 决定（只改 transform）", async () => {
    const { container } = render(
      <Parallax speed={30}>
        <span>视差层内容</span>
      </Parallax>
    );

    const layer = container.firstElementChild;
    // 进度为 0（元素尚未进入视口）时位移 = +speed，随滚动逐渐过渡到 -speed
    await waitFor(() =>
      expect(layer.style.transform).toContain("translateY(30px)")
    );
  });

  test("总开关为 paused：不挂位移，内容依然可见", async () => {
    const restore = mockMotionPlayState("paused");
    const { container } = render(
      <Parallax className="hero-avatar">
        <span>视差层内容</span>
      </Parallax>
    );

    await waitFor(() =>
      expect(container.querySelector('[data-parallax="paused"]')).not.toBeNull()
    );

    const layer = container.querySelector('[data-parallax="paused"]');
    expect(layer.className).toContain("parallax-layer");
    expect(layer.className).toContain("hero-avatar");
    // 不再写 translateY：关动效时这一层就是普通静态容器
    expect(layer.style.transform).not.toMatch(/translate/i);
    expect(screen.getByText("视差层内容")).toBeInTheDocument();

    restore();
  });
});
