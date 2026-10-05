import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle from "./ThemeToggle";
import ThemeProvider, { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "../theme/ThemeContext";

/**
 * 日夜切换按钮测试
 * ------------------------------------------------------------------
 * 只覆盖「确定性的行为」：语义化开关的可访问名称 / 状态、点击后的落盘与落地、
 * 以及可读的读屏名称。动画（滑块弹簧、日月旋转）依赖真实渲染帧，不在这里断言。
 */

const renderToggle = (mode) => {
  render(
    <ThemeProvider initialMode={mode}>
      <ThemeToggle />
    </ThemeProvider>
  );
  return screen.getByRole("switch");
};

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  // 让 framer-motion 的弹簧动画在假定时器里跑完再卸载，
  // 否则动画帧会活到真实定时器阶段，Jest 会报「worker 无法优雅退出」
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  jest.useRealTimers();
});

describe("ThemeToggle", () => {
  it("是语义化开关：role=switch，aria-checked 反映当前是否深色", () => {
    const light = renderToggle("light");
    expect(light).toHaveAttribute("aria-checked", "false");
    expect(light).toHaveAttribute("aria-label", "切换到深色模式");

    cleanup();

    const dark = renderToggle("dark");
    expect(dark).toHaveAttribute("aria-checked", "true");
    expect(dark).toHaveAttribute("aria-label", "切换到浅色模式");
  });

  it("点击后切换主题、落盘偏好，按钮状态同步", () => {
    const button = renderToggle("dark");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-checked", "false");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("light");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("带可访问名称（读屏能念出按钮用途）", () => {
    const button = renderToggle("light");
    expect(button).toHaveAccessibleName(/切换/);
  });
});
