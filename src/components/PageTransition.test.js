import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { PageTransition, RouteCurtain } from "./PageTransition";

/**
 * 无缝切页测试（jsdom）
 * ------------------------------------------------------------------
 * 真实的转场由三个东西配合（见 App.js）：AnimatePresence 留住旧页播完 exit、
 * key={pathname} 换掉子树、RouteCurtain 在「盖住」的空档里换页。
 * AnimatePresence 与 exit 时长依赖渲染帧，这里覆盖确定性的部分：
 *   1) PageTransition 播放态是 motion.main + data-page-transition="playing"，
 *      并透传额外类名；
 *   2) RouteCurtain 首次进入不扫（首屏入场归 LoadingScreen），路由变化才扫一次，
 *      遮罩挂在 body 上（portal）、aria-hidden、不吃点击；
 *   3) 总开关为 paused 时：PageTransition 退化成普通 div、遮罩完全不出现。
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

/** 站内导航按钮（RouteCurtain 靠 pathname 变化决定要不要扫一次） */
function NavButton({ to }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>去 {to}</button>;
}

/** 路由层最小复刻：遮罩 + 跳转按钮 */
function renderRoutes(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <RouteCurtain />
      <NavButton to="/about" />
    </MemoryRouter>
  );
}

const curtainInBody = () =>
  document.body.querySelector("[data-route-curtain]");

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

describe("RouteCurtain", () => {
  test("首次进入不扫：首屏入场交给 LoadingScreen", async () => {
    renderRoutes("/");

    await act(async () => {
      await Promise.resolve();
    });

    expect(curtainInBody()).toBeNull();
  });

  test("路由变化时扫一次：遮罩挂在 body 上、aria-hidden、不吃点击", async () => {
    renderRoutes("/");

    fireEvent.click(screen.getByText("去 /about"));

    await waitFor(() => expect(curtainInBody()).not.toBeNull());

    const curtain = curtainInBody();
    expect(curtain.className).toContain("route-curtain");
    expect(curtain).toHaveAttribute("aria-hidden", "true");
    // createPortal 到 body：不会被页面里的 transform / filter 影响
    expect(curtain.parentElement).toBe(document.body);
  });

  test("总开关为 paused：不出现遮罩（关动效 = 直接切页，一帧都不耽搁）", async () => {
    const restore = mockMotionPlayState("paused");
    renderRoutes("/");

    await waitFor(() =>
      expect(screen.getByText("去 /about")).toBeInTheDocument()
    );

    await act(async () => {
      fireEvent.click(screen.getByText("去 /about"));
      await Promise.resolve();
    });

    expect(curtainInBody()).toBeNull();

    restore();
  });
});
