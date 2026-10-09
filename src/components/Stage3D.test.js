import React from "react";
import { render } from "@testing-library/react";
import Stage3D from "./Stage3D";
import ThemeProvider from "../theme/ThemeContext";

/**
 * 3D 背景层测试（jsdom 里能确定的那一侧：优雅降级）
 * ------------------------------------------------------------------
 * jsdom 没有 WebGL，也没有布局，所以这里能断言的只有「不该发生的事」：
 *   · 这一层必须一直在（它是层叠顺序的基准），且被 aria-hidden；
 *   · 绝不允许出现 <canvas>：它一旦出现就说明 three 被拉起来了，
 *     而层叠 / 定位稍有偏差就是「背景压住正文」的事故（见 style.css 的注释）；
 *   · 环境不支持时不加载、不抛错，卸载后不留残留。
 * 镜头 / 粒子 / 不透明度这些数值由 src/lib/stage3d.test.js 断言（纯函数，不需要 three）。
 */

const renderStage = (props) => {
  const result = render(
    <ThemeProvider>
      <Stage3D {...props} />
    </ThemeProvider>
  );
  return { ...result, layer: result.container.querySelector(".stage3d") };
};

describe("Stage3D · 背景层与优雅降级", () => {
  test("铺一层 .stage3d：对读屏隐藏，调试状态写在 data 属性上", () => {
    const { layer } = renderStage();

    expect(layer).not.toBeNull();
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer).toHaveAttribute("data-stage3d", "off"); // jsdom 没有 WebGL → 空层
  });

  test("没有 WebGL 就不加载 three：不插 canvas、不抛错", () => {
    const { container } = renderStage();

    expect(window.WebGLRenderingContext).toBeUndefined();
    expect(container.querySelector("canvas")).toBeNull();
  });

  test("DPR 上限来自配置并写在 DOM 上（排查掉帧时先看这一个数）", () => {
    const { layer } = renderStage();
    expect(layer).toHaveAttribute("data-stage3d-pixel-ratio", "1.5");
  });

  test("自身不产生任何可见内容（真正的 canvas 由 three 之后自己插进来）", () => {
    const { layer } = renderStage();
    expect(layer.className).toBe("stage3d");
    expect(layer.childElementCount).toBe(0);
  });

  test("遮罩还在（enabled=false）时只留空层；卸载后彻底消失", () => {
    const { layer, unmount } = renderStage({ enabled: false });
    expect(layer).toHaveAttribute("data-stage3d", "off");

    unmount();
    expect(document.querySelector(".stage3d")).toBeNull();
  });
});
