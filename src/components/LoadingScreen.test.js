import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import LoadingScreen from "./LoadingScreen";

/**
 * 首屏遮罩测试（jsdom）
 * ------------------------------------------------------------------
 * 遮罩的视觉部分（逐字浮现、整幕上滑）依赖真实渲染帧，这里只覆盖确定性的时间轴，
 * 避免测试随机失败：
 *   1) 初次加载：铺满纯黑遮罩、渲染两大标语与右下角提示，并锁住 <html> 滚动；
 *   2) 时间轴：holdMs 内不动，到点才开始离场，离场结束才回调 onComplete 且只回调一次；
 *   3) 生命周期：离场结束移出 DOM、组件卸载都会把滚动锁还原。
 */

/** 推进假定时器（外面套 act：setState 都是定时器触发的，别让它落在 act 之外） */
const advance = (ms) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

describe("LoadingScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    // 在假定时器里把进场动画（逐字浮现、进度线）跑完，再卸载。
    // 否则 framer-motion 的帧循环会带着「尚未结束的动画」活到真实定时器阶段，
    // 表现就是 Jest 报「worker process has failed to exit gracefully」。
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    cleanup();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test("初次加载：纯黑遮罩 + 超大标语 + 右下角提示，并锁住滚动", () => {
    render(<LoadingScreen />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    // 标题逐字拆分渲染，完整文案交给屏幕阅读器（sr-only）；字幕行同时存在 sr-only 与可见节点
    expect(screen.getByText("SHA SHA")).toBeInTheDocument();
    expect(screen.getAllByText("CODE. CREATE. AUTOMATE.").length).toBeGreaterThan(0);
    expect(screen.getByText(/小心地滑/)).toBeInTheDocument();

    // 遮罩在场期间不允许页面滚动
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  test("停留 holdMs 后开始上滑，离场 exitMs 结束才回调 onComplete", () => {
    const onComplete = jest.fn();
    const { container } = render(
      <LoadingScreen holdMs={2000} exitMs={800} onComplete={onComplete} />
    );

    advance(1999);
    expect(onComplete).not.toHaveBeenCalled();
    expect(container.firstChild).not.toBeNull();

    // 到点 → 进入离场：遮罩还在，只是开始上滑
    advance(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(container.firstChild).not.toBeNull();

    // 上滑走完 → 回调一次、移出 DOM、解锁滚动
    advance(800);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(container.firstChild).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
  });

  test("组件被卸载时同样还原滚动锁", () => {
    const { unmount } = render(<LoadingScreen />);
    expect(document.documentElement.style.overflow).toBe("hidden");

    unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });
});
