import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  /* 先卸载再推进定时器：CinemaScroll 建立的等待链（祖先还在转场时要等 setTimeout 700）
     会在定时器被推进时继续执行；那一刻组件若还挂着就会 setState —— 这个 setState 不在
     act 里，React 会打印「not wrapped in act」警告。先 cleanup 把它标成 disposed 就断了这条路。 */
  cleanup();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe("App", () => {
  it("渲染首页 Hero、导航与页脚署名", async () => {
    render(<App />);

    // Hero 区域
    // 注意：Hero 标题现在由 SplitText 逐字 / 逐词拆分（h1 的直接子节点全是 span），
    // getByText 只看「直接文本子节点」，所以这里改用选择器 + toHaveTextContent。
    const helloHeading = document.querySelector("h1.heading");
    expect(helloHeading).not.toBeNull();
    expect(helloHeading).toHaveTextContent("Hi There!");

    const nameHeading = document.querySelector("h1.heading-name");
    expect(nameHeading).toHaveTextContent("SHASHA");
    // 可访问名是整句（逐字 span 都 aria-hidden），读屏不会一个字一个字念。
    // 注意 SplitText 会把 split-text 类挂在根元素上，所以这里直接断言 h1 自己。
    expect(nameHeading).toHaveAttribute("aria-label", "I'M 莎莎 SHASHA");

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

    /* 滚动镜头（CinemaScroll）要等动态 import 之后才知道「接管 / 降级」，
       这条异步链必须在测试结束前收敛：否则它会等到测试结束后才 setState，
       React 会打印「not wrapped in act」警告，还可能让 Jest 报「未优雅退出」。
       jsdom 里 gsap/ScrollTrigger 的 ESM 产物无法被 Jest 解析（Cannot use import
       statement outside a module），所以这里必然走「降级为普通滚动」的分支 ——
       断言「不再是初始的 off」正好覆盖了这条降级路径。 */
    await waitFor(() => {
      expect(document.querySelector("[data-cinema]")).not.toHaveAttribute("data-cinema", "off");
    });
  });
});

