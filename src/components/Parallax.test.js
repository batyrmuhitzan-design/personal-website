import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import Parallax from "./Parallax";


/**
 * 视差层（Parallax）测试（jsdom）
 * ------------------------------------------------------------------
 * jsdom 没有滚动距离与布局尺寸，所以「滚动多少 → 位移多少」这条曲线交给浏览器验证；
 * 这里只钉确定性的契约：
 *   1) 包一层 parallax-layer，并透传额外类名与子内容；
 *   2) 位移只写在 transform 上（不碰 top / margin，滚动时才不会重排）；
 *   3) speed 决定幅度与方向 —— 这条链上再没有任何「动效总开关」能拦住它：
 *      视差是滚动驱动的，一旦被拦住，滚起来就只剩死板平铺。
 */

describe("Parallax", () => {
  test("包一层 parallax-layer，并透传额外类名与子内容", () => {
    const { container } = render(
      <Parallax speed={28} className="hero-avatar">
        <span>视差层内容</span>
      </Parallax>
    );

    const layer = container.firstElementChild;
    expect(layer.className).toContain("parallax-layer");
    expect(layer.className).toContain("hero-avatar");
    expect(screen.getByText("视差层内容")).toBeInTheDocument();
  });

  test("位移只写 transform：进度 0 时是 +speed，随滚动过渡到 -speed", async () => {
    const { container } = render(
      <Parallax speed={30}>
        <span>视差层内容</span>
      </Parallax>
    );

    const layer = container.firstElementChild;
    await waitFor(() =>
      expect(layer.style.transform).toContain("translateY(30px)")
    );
    // 不碰布局属性，滚动时才不会触发重排
    expect(layer.style.top).toBe("");
    expect(layer.style.marginTop).toBe("");
  });

  test("speed 给负值就是反向：这一层比滚动更快地沉下去", async () => {
    const { container } = render(
      <Parallax speed={-18}>
        <span>视差层内容</span>
      </Parallax>
    );

    await waitFor(() =>
      expect(container.firstElementChild.style.transform).toContain(
        "translateY(-18px)"
      )
    );
  });
});
