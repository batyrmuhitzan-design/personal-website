import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import CustomCursor from "./CustomCursor";

/**
 * 自定义光标测试（jsdom）
 * ------------------------------------------------------------------
 * 光标的两条核心路径里，弹簧动画（小人跟随、hover 放大）与 CSS 动画
 * （眨眼 / 呼吸 / 挥手）依赖真实渲染帧，这里只覆盖确定性的部分，
 * 避免测试随机失败：
 *   1) 非「精确指针」设备：什么都不渲染，也不改 <html>、不注入样式；
 *   2) 精确指针设备：两个光标元素（卡通小人 + 小箭头）挂在 body 下、
 *      <html> 打上标记类、注入隐藏原生光标与卡通动画的样式；
 *   3) 鼠标移动时小箭头（不吃弹簧）立即跟到坐标上；
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

  test("精确指针设备：挂载卡通小人与小箭头、注入样式，移动鼠标时箭头跟手", async () => {
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

    // 卡通小人在前、小箭头在后；箭头不经过弹簧，坐标应当直接命中
    const pointerStyle = cursors[1].getAttribute("style") || "";
    expect(pointerStyle).toContain("translateX(40px)");
    expect(pointerStyle).toContain("translateY(50px)");

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

/** 等还在跑的弹簧（缩放 / 旋转 / 透明度）结算完，别把定时器留给 Jest */
const settleSprings = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

describe("CustomCursor · 皮肤（pixel / cartoon / 自定义精灵）", () => {
  test("默认皮肤是内置像素小人：内联 SVG + crispEdges，颜色只走 CSS 变量", async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor />);
    await nextFrame();

    const svg = document.body.querySelector("svg.cur-pixel--builtin");
    expect(svg).not.toBeNull();
    // 像素块要是方的：不写抗锯齿
    expect(svg).toHaveAttribute("shape-rendering", "crispEdges");
    expect(Number(svg.getAttribute("data-pixel-rects"))).toBeGreaterThan(0);

    // 颜色全部走设计令牌 → 深浅主题自动反相（换肤不需要重算 SVG）
    const layers = Array.from(svg.querySelectorAll("g"));
    expect(layers.length).toBeGreaterThan(0);
    layers.forEach((group) => {
      expect(group.getAttribute("fill")).toMatch(/^var\(--/);
    });

    // 像素皮肤下不会渲染手绘卡通小人
    expect(document.body.querySelector("svg.cur-figure")).toBeNull();

    restore();
  });

  test('skin="cartoon"：渲染手绘卡通小人，不出现像素小人', async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor skin="cartoon" />);
    await nextFrame();

    expect(document.body.querySelector("svg.cur-figure")).not.toBeNull();
    expect(document.body.querySelector("svg.cur-pixel")).toBeNull();

    restore();
  });

  test("spriteUrl：用自己的 PNG / GIF / SVG 替换图案（pixelated、宽度按配置）", async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor spriteUrl="/cursor.png" spriteWidth={48} />);
    await nextFrame();

    const img = document.body.querySelector("img.cur-pixel--custom");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/cursor.png");
    expect(img).toHaveAttribute("width", "48");
    expect(img.style.imageRendering).toBe("pixelated");
    expect(img).toHaveAttribute("draggable", "false");

    // 外层包裹跟着配置走：高度按图案的 12:16 比例算（48 → 64）
    const figure = document.body.querySelector(".cur-figure-wrap");
    expect(figure.style.width).toBe("48px");
    expect(figure.style.height).toBe("64px");

    // 有自定义精灵就不再画内置像素小人
    expect(document.body.querySelector("svg.cur-pixel--builtin")).toBeNull();

    restore();
  });
});

describe("CustomCursor · 悬停状态", () => {
  test("悬停到可点击元素：小人加 cur--over，并显示 data-cursor-text 气泡", async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor />);
    await nextFrame();

    render(<button data-cursor-text="打开项目">点我</button>);

    fireEvent.mouseOver(screen.getByText("点我"));

    await waitFor(() =>
      expect(document.body.querySelector(".cur-figure-wrap")).toHaveClass(
        "cur--over"
      )
    );
    expect(document.body.querySelector(".cur-label")).toHaveTextContent(
      "打开项目"
    );

    await settleSprings();
    restore();
  });

  test("悬停在输入类控件上：交还系统光标（cur--native，两层淡出）", async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor />);
    await nextFrame();

    render(<input aria-label="搜索框" />);

    fireEvent.mouseOver(screen.getByLabelText("搜索框"));

    await waitFor(() =>
      expect(document.body.querySelector(".cur-figure-wrap")).toHaveClass(
        "cur--native"
      )
    );
    // 输入类控件不发气泡，也不再算「可点击悬停」
    expect(document.body.querySelector(".cur-label")).toBeNull();
    expect(document.body.querySelector(".cur-figure-wrap")).not.toHaveClass(
      "cur--over"
    );

    await settleSprings();
    restore();
  });
});
