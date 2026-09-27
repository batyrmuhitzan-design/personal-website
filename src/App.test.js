import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

// 粒子背景依赖 canvas，jsdom 中没有实现，测试时用空组件替代
jest.mock("./components/Particle", () => () => null);

beforeAll(() => {
  // ScrollToTop 组件会调用 window.scrollTo，jsdom 未实现，这里补一个空实现
  window.scrollTo = jest.fn();
});

beforeEach(() => {
  // 打字机与预加载动画使用定时器，测试中用假定时器避免 worker 无法退出
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe("App", () => {
  it("渲染首页 Hero、导航与页脚署名", () => {
    render(<App />);

    // Hero 区域
    expect(screen.getByText(/Hi There/)).toBeInTheDocument();
    expect(screen.getByText(/I'M/i)).toHaveTextContent("SHASHA");

    // 顶部导航（首页路由）
    expect(screen.getAllByText("首页").length).toBeGreaterThan(0);
    expect(screen.getAllByText("联系").length).toBeGreaterThan(0);

    // 页脚署名
    expect(
      screen.getByText(/Designed & Developed by Shasha/)
    ).toBeInTheDocument();
  });
});

