import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

// 粒子背景依赖 canvas，jsdom 中没有实现，测试时用空组件替代
jest.mock("./components/Particle", () => () => null);

// 悬浮播放器会创建 APlayer 并请求解析服务，与首页渲染无关，这里同样用空组件替代
// （播放器自身的行为由 src/components/MusicPlayer.test.js 单独覆盖）
jest.mock("./components/MusicPlayer", () => () => null);

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
    // 注意限定选择器：技能展示区里也有三条「i'm a」，/I'M/i 全局匹配会命中多个元素
    expect(screen.getByText(/Hi There/)).toBeInTheDocument();
    expect(
      screen.getByText(/I'M/i, { selector: "h1.heading-name" })
    ).toHaveTextContent("SHASHA");

    // 顶部导航（极简 Header：英文主标识 + 中文副标识）
    expect(screen.getAllByText("作品").length).toBeGreaterThan(0);
    expect(screen.getAllByText("联系").length).toBeGreaterThan(0);

    // 品牌区（莎莎 / Batyr）
    expect(screen.getByText("Batyr")).toBeInTheDocument();

    // 日夜切换按钮常驻在 Header 里
    expect(screen.getAllByRole("switch").length).toBeGreaterThan(0);

    // 页脚署名
    expect(
      screen.getByText(/Designed & Developed by Shasha/)
    ).toBeInTheDocument();
  });
});

