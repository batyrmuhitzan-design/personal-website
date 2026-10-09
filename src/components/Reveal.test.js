import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import Reveal from "./Reveal";

/**
 * 滚动入场（Reveal）测试（jsdom）
 * ------------------------------------------------------------------
 * whileInView 依赖真实渲染帧与视口尺寸（jsdom 的 IntersectionObserver 是
 * setupTests.js 里的空实现，不会触发回调），因此这里只覆盖确定性的部分：
 *   1) 包装标签 / 类名 / id / style 的透传 —— 列表里可以换成 li，
 *      避免多套一层 div 影响 Bootstrap 栅格；
 *   2) 播放态：wrapper 带 data-reveal="playing"，由 framer-motion 驱动
 *      hidden → visible；
 *   3) 总开关为 paused 时退化成普通 div：不带任何内联位移 / 透明度，
 *      内容仍然完整可见 —— 关动效 ≠ 丢内容。
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

describe("Reveal", () => {
  test("默认包一层 div：带 reveal 类，并透传 id / 额外类名 / style", () => {
    const { container } = render(
      <Reveal id="hero-line" className="mt-2" style={{ maxWidth: 320 }}>
        <span>你好，我是莎莎</span>
      </Reveal>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper).toHaveAttribute("data-reveal", "playing");
    expect(wrapper).toHaveAttribute("id", "hero-line");
    expect(wrapper.className).toContain("reveal");
    expect(wrapper.className).toContain("mt-2");
    expect(wrapper.style.maxWidth).toBe("320px");
    expect(screen.getByText("你好，我是莎莎")).toBeInTheDocument();
  });

  test("as 可以换成 li / section 等标签（列表与区块里不额外套 div）", () => {
    const { container } = render(
      <Reveal as="li">
        <span>项目条目</span>
      </Reveal>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper.tagName).toBe("LI");
    expect(wrapper).toHaveAttribute("data-reveal", "playing");
    expect(screen.getByText("项目条目")).toBeInTheDocument();
  });

  test("播放态：初始是「藏起来」的（透明度 + 位移），等进入视口才播到可见", () => {
    const { container } = render(
      <Reveal direction="up" distance={24}>
        <span>入场内容</span>
      </Reveal>
    );

    const wrapper = container.firstElementChild;
    // framer-motion 的初始变体（hidden）会落在内联样式中：内容还没「到位」
    expect(wrapper.style.opacity).toBe("0");
    expect(wrapper.style.transform).toContain("translateY(24px)");
  });

  test("总开关为 paused：退化成普通 div，不带内联位移 / 透明度，内容依然可见", async () => {
    const restore = mockMotionPlayState("paused");
    const { container } = render(
      <Reveal className="hero-line">
        <span>内容不会消失</span>
      </Reveal>
    );

    await waitFor(() =>
      expect(container.querySelector('[data-reveal="paused"]')).not.toBeNull()
    );

    const wrapper = container.querySelector('[data-reveal="paused"]');
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.className).toContain("reveal");
    expect(wrapper.className).toContain("hero-line");
    // 关掉动效时既不淡出也不位移 —— 一帧都不藏内容
    expect(wrapper.style.opacity).toBe("");
    expect(wrapper.style.transform).toBe("");
    expect(screen.getByText("内容不会消失")).toBeInTheDocument();

    restore();
  });
});
