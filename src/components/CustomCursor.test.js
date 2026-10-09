import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import CustomCursor from "./CustomCursor";
import { PIXEL_CHARACTERS } from "../lib/pixelArt";

/**
 * 自定义光标测试（jsdom）
 * ------------------------------------------------------------------
 * 光标的两条核心路径里，形变弹簧（hover 放大、透明度）与 CSS 动画
 * （眨眼 / 呼吸 / 天线闪烁）依赖真实渲染帧，这里只覆盖确定性的部分，
 * 避免测试随机失败：
 *   1) 非「精确指针」设备：什么都不渲染，也不改 <html>、不注入样式；
 *   2) 精确指针设备：两个光标元素（像素小人 + 像素箭头）挂在 body 下、
 *      <html> 打上标记类、注入隐藏原生光标与皮肤动画的样式；
 *   3) 鼠标移动时箭头与小人**同帧**跟到坐标上（位置零弹簧）；
 *   4) 悬停 / 文本区：cur--over / cur--text 状态类正确；
 *   5) 角色选择：默认随机、characterId 固定、randomSkin=false 回落默认；
 *   6) 卸载后标记类与注入的样式都被清理干净；
 *   7) 两层光标不吃点击（行内 none + 注入样式 !important 兜底）。
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

  test("悬停在输入类控件上：箭头换成像素竖线（cur--text），不再露出第二个光标", async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor />);
    await nextFrame();

    render(<input aria-label="搜索框" />);

    fireEvent.mouseOver(screen.getByLabelText("搜索框"));

    await waitFor(() =>
      expect(document.body.querySelector(".cur-arrow")).toHaveClass("cur--text")
    );
    // 输入类控件不发气泡，也不再算「可点击悬停」
    expect(document.body.querySelector(".cur-label")).toBeNull();
    expect(document.body.querySelector(".cur-figure-wrap")).not.toHaveClass(
      "cur--over"
    );
    // 两层都还在（全局 cursor: none 依然生效），只是箭头被竖线顶替
    expect(document.body.querySelectorAll('div[aria-hidden="true"]').length).toBe(2);

    await settleSprings();
    restore();
  });
});

/**
 * 第二轮（第二轮细节重构）新增：
 *   · 光标本体从「弹簧拖尾」改成 1:1 跟手（位置不再有延迟）；
 *   · 内置角色扩到 10 位，可随机皮肤 / 固定皮肤；
 *   · 箭头换成像素图案（11×15 格，尖端在左上角）。
 */
describe("CustomCursor · 像素箭头与小人的跟手", () => {
  test("箭头是像素 SVG：crispEdges、有像素矩形，且不再用旧的手绘 path", async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor />);
    await nextFrame();

    const arrow = document.body.querySelector("svg.cur-arrow-px");
    expect(arrow).not.toBeNull();
    expect(arrow).toHaveAttribute("shape-rendering", "crispEdges");
    expect(Number(arrow.getAttribute("data-pixel-rects"))).toBeGreaterThan(0);
    // 旧实现是一条 <path>，新实现全部是合并后的 <rect>
    expect(arrow.querySelector("path")).toBeNull();
    expect(arrow.querySelectorAll("rect").length).toBeGreaterThan(0);

    restore();
  });

  test("鼠标移动时箭头与小人同帧跟到坐标上（小人不再有弹簧拖尾）", async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor />);
    await nextFrame();

    act(() => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 123, clientY: 45, bubbles: true })
      );
    });
    await nextFrame();

    const [figure, arrow] = document.body.querySelectorAll(
      'div[aria-hidden="true"]'
    );
    const figureStyle = figure.getAttribute("style") || "";
    const arrowStyle = arrow.getAttribute("style") || "";

    expect(figureStyle).toContain("translateX(123px)");
    expect(figureStyle).toContain("translateY(45px)");
    expect(arrowStyle).toContain("translateX(123px)");
    expect(arrowStyle).toContain("translateY(45px)");

    await settleSprings();
    restore();
  });

  test("光标进入文本区时，箭头层挂上 cur--text（像素竖线接管插入点提示）", async () => {
    const restore = mockPointerDevice(true);
    const { container } = render(<CustomCursor />);
    await nextFrame();

    render(<textarea aria-label="简介" />);
    fireEvent.mouseOver(screen.getByLabelText("简介"));
    await waitFor(() =>
      expect(document.body.querySelector(".cur-arrow")).toHaveClass("cur--text")
    );

    // 移出文本区（回到普通区域）后恢复箭头
    fireEvent.mouseOver(container.ownerDocument.body);
    await waitFor(() =>
      expect(document.body.querySelector(".cur-arrow")).not.toHaveClass(
        "cur--text"
      )
    );

    await settleSprings();
    restore();
  });

  test("characterId：固定某一位角色（可复现）；randomSkin=false 时回落到第一位", async () => {
    const restore = mockPointerDevice(true);
    const { unmount } = render(<CustomCursor characterId="robot" />);
    await nextFrame();

    expect(
      document.body.querySelector(".cur-figure-wrap").getAttribute(
        "data-cursor-character"
      )
    ).toBe("robot");
    expect(document.body.querySelector("svg.cur-pixel--builtin")).toHaveAttribute(
      "data-character",
      "robot"
    );

    unmount();
    render(<CustomCursor randomSkin={false} />);
    await nextFrame();

    expect(
      document.body.querySelector(".cur-figure-wrap").getAttribute(
        "data-cursor-character"
      )
    ).toBe("cyber");

    restore();
  });

  test("随机皮肤：不需要参数，抽到的角色一定来自内置角色表", async () => {
    const restore = mockPointerDevice(true);
    const { unmount } = render(<CustomCursor />);
    await nextFrame();

    const id = document.body
      .querySelector(".cur-figure-wrap")
      .getAttribute("data-cursor-character");
    expect(PIXEL_CHARACTERS.map((item) => item.id)).toContain(id);

    unmount();
    restore();
  });
});

/**
 * 「光标不许吃点击」—— 最贵的一条坑：
 * 两层光标是页面里 z-index 最高的元素，而且永远贴在鼠标底下。
 * 一旦它们参与命中测试，鼠标所指之处就全是「透明玻璃」：
 * 导航、按钮、页脚社交图标统统点不动（观感上就是「点了没反应」）。
 * 这里钉死三件事：
 *   1) 两个 portal 容器的**行内**样式是 pointer-events: none；
 *   2) 注入的样式里再用 !important 钉一遍 —— 防止后来居上的样式盖掉行内值；
 *   3) 光标在场时，它底下的按钮照样能点。
 */
describe("CustomCursor · 不许吃点击", () => {
  test("两层容器都不参与命中测试：行内 none + 注入样式 !important 兜底", async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor />);
    await nextFrame();

    const layers = Array.from(
      document.body.querySelectorAll('div[aria-hidden="true"]')
    );
    expect(layers).toHaveLength(2);

    layers.forEach((layer) => {
      expect(layer.style.pointerEvents).toBe("none");
      // 必须压在内容之上（否则会被页面遮住），所以「不吃点击」只能靠 pointer-events
      expect(layer.style.zIndex).toBe("2147483647");
    });

    const css = document.querySelector("style[data-custom-cursor]").textContent;
    expect(css).toMatch(
      /\.cur-figure-wrap,\s*\.cur-arrow\s*\{\s*pointer-events:\s*none\s*!important;/
    );

    restore();
  });

  test("光标在场时，鼠标底下的按钮 / 社交链接照样能点", async () => {
    const restore = mockPointerDevice(true);
    render(<CustomCursor />);
    await nextFrame();

    const onClick = jest.fn();
    render(
      <a href="https://github.com" onClick={onClick}>
        页脚社交图标
      </a>
    );

    fireEvent.click(screen.getByText("页脚社交图标"));
    expect(onClick).toHaveBeenCalledTimes(1);

    restore();
  });
});
