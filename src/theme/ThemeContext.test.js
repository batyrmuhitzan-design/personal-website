import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThemeProvider, {
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  THEME_SWITCHING_CLASS,
  THEME_SWITCH_WINDOW_MS,
  readStoredTheme,
  resolveInitialTheme,
  useTheme,
} from "./ThemeContext";

/**
 * 主题系统测试（jsdom）
 * ------------------------------------------------------------------
 * 覆盖四件事：
 *   1) 初始值来源优先级：<html data-theme>（内联脚本写过）→ localStorage → 系统偏好；
 *   2) 切换后的落盘与落地：localStorage、<html data-theme>、<meta theme-color>；
 *   3) 丝滑过渡窗口：切换瞬间挂 .theme-switching，600ms 后自动摘掉；
 *   4) 切换主题不重挂载子树 —— 这是「换肤不打断音乐播放」的关键前提。
 */

/** 探针组件：把上下文状态渲染出来；onMount 用于统计挂载次数 */
function Probe({ onMount }) {
  const { mode, isDark, isExplicit, toggle, setMode } = useTheme();

  React.useEffect(() => {
    if (onMount) onMount();
  }, [onMount]);

  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="is-dark">{String(isDark)}</span>
      <span data-testid="is-explicit">{String(isExplicit)}</span>
      <button type="button" data-testid="toggle-btn" onClick={toggle}>
        toggle
      </button>
      <button type="button" data-testid="light-btn" onClick={() => setMode("light")}>
        force-light
      </button>
    </div>
  );
}

const renderWithTheme = (props = {}) =>
  render(
    <ThemeProvider {...props}>
      <Probe />
    </ThemeProvider>
  );

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  document.documentElement.classList.remove(THEME_SWITCHING_CLASS);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  document.documentElement.classList.remove(THEME_SWITCHING_CLASS);
  jest.useRealTimers();
});

describe("ThemeContext · 初始状态", () => {
  it("优先使用 index.html 内联脚本已写在 <html> 上的主题（首屏不闪）", () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, "light");

    renderWithTheme();

    expect(screen.getByTestId("mode")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("light");
  });

  it("本地存过偏好时以本地偏好为准", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    expect(readStoredTheme()).toBe("light");
    expect(resolveInitialTheme()).toBe("light");

    renderWithTheme();
    expect(screen.getByTestId("mode")).toHaveTextContent("light");
    expect(screen.getByTestId("is-explicit")).toHaveTextContent("true");
  });

  it("既没标记也没存过偏好时跟随系统（jsdom 无 matchMedia → 默认深色）", () => {
    expect(readStoredTheme()).toBeNull();

    renderWithTheme();

    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
    // 还没有显式选择 → 之后系统偏好变化仍会跟随
    expect(screen.getByTestId("is-explicit")).toHaveTextContent("false");
  });

  it("非法 / 越界的存储值一律忽略，回落系统偏好", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");

    expect(readStoredTheme()).toBeNull();
    renderWithTheme();
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
  });
});

describe("ThemeContext · 切换", () => {
  it("切换后同步 localStorage 与 <html data-theme>，并开启丝滑过渡窗口", () => {
    jest.useFakeTimers();
    renderWithTheme();

    expect(document.documentElement.classList.contains(THEME_SWITCHING_CLASS)).toBe(false);

    fireEvent.click(screen.getByTestId("toggle-btn"));

    expect(screen.getByTestId("mode")).toHaveTextContent("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("light");
    expect(screen.getByTestId("is-explicit")).toHaveTextContent("true");
    // 过渡窗口：切换瞬间挂上，到点自动摘掉（平时不占用，避免吃掉组件自己的 hover 过渡）
    expect(document.documentElement.classList.contains(THEME_SWITCHING_CLASS)).toBe(true);

    act(() => {
      jest.advanceTimersByTime(THEME_SWITCH_WINDOW_MS);
    });
    expect(document.documentElement.classList.contains(THEME_SWITCHING_CLASS)).toBe(false);
  });

  it("把主题同步到 <meta name=theme-color>（移动端地址栏跟着换）", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);

    renderWithTheme({ initialMode: "dark" });
    expect(meta.getAttribute("content")).toBe("#0A0A0A");

    fireEvent.click(screen.getByTestId("light-btn"));
    expect(meta.getAttribute("content")).toBe("#FFFFFF");

    meta.remove();
  });

  it("切换主题不会重挂载子树（音乐播放器因此不会断播）", () => {
    const onMount = jest.fn();
    render(
      <ThemeProvider>
        <Probe onMount={onMount} />
      </ThemeProvider>
    );
    expect(onMount).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("toggle-btn"));
    fireEvent.click(screen.getByTestId("toggle-btn"));

    expect(onMount).toHaveBeenCalledTimes(1);
  });
});
