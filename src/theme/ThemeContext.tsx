import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * 主题系统（Light / Dark）
 * ==================================================================
 * · 只有两态：light（纯净高定白）与 dark（深邃高质黑）—— 不引入第三态，
 *   避免「跟随系统 / 手动」双状态机带来的 UI 复杂度；首次访问跟随系统，
 *   用户一旦手动切换，选择就写进 localStorage 并长期生效。
 * · 主题的「落地」只做三件事：
 *     1) <html data-theme="light|dark">   —— CSS 变量按它换值（src/theme/tokens.css）
 *     2) <html style="color-scheme">      —— 让浏览器原生控件（滚动条 / 表单）跟上
 *     3) <meta name="theme-color">        —— 移动端地址栏配色跟上
 * · 首屏防闪：public/index.html 里有一段同逻辑的内联脚本，在首帧之前就把
 *   data-theme 写好；这里的初始值优先读 DOM 上已有的标记，保证两侧一致，
 *   不会出现「先白后黑再白」的闪烁。
 * · 丝滑换肤：切换后的 600ms 内给 <html> 挂 theme-switching 类，
 *   index.css 利用这个窗口给整棵树补一层「只过渡颜色」的规则；
 *   窗口结束即移除，因此不会破坏各组件自己的 hover / transform 过渡。
 * · 尊重 prefers-reduced-motion：用户要求减少动态效果时不做换肤过渡。
 */

/** 主题模式（全站只有这两种） */
export type ThemeMode = "light" | "dark";

/** localStorage 键名（必须与 public/index.html 的内联脚本保持一致） */
export const THEME_STORAGE_KEY = "shasha-theme";
/** 挂在 <html> 上的主题标记属性 */
export const THEME_ATTRIBUTE = "data-theme";
/** 切换瞬间挂在 <html> 上的过渡窗口类名（见 src/index.css） */
export const THEME_SWITCHING_CLASS = "theme-switching";
/** 过渡窗口时长（ms）：略大于 --theme-duration，保证最后一帧也走完过渡 */
export const THEME_SWITCH_WINDOW_MS = 600;

export type ThemeContextValue = {
  /** 当前生效的模式 */
  mode: ThemeMode;
  isDark: boolean;
  isLight: boolean;
  /** 用户是否已做出显式选择（false = 仍在跟随系统） */
  isExplicit: boolean;
  /** 指定模式（同时记为显式选择并落盘） */
  setMode: (mode: ThemeMode) => void;
  /** 在 light / dark 之间来回切 */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** 类型守卫：只认 "light" / "dark" */
export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

/** 读取本地偏好；localStorage 不可用（隐私模式 / SSR）时返回 null，绝不抛错 */
export function readStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : null;
  } catch (err) {
    return null;
  }
}

/** 写回本地偏好；失败就静默忽略（不影响换肤本身） */
function writeStoredTheme(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch (err) {
    /* 忽略：隐私模式下 localStorage 可能直接抛错 */
  }
}

/** 系统偏好；拿不到 matchMedia（老浏览器 / jsdom）时按深色处理（站点原本就是深色底） */
export function systemTheme(): ThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * 首屏初始值：DOM 上已有的标记（index.html 内联脚本写过）优先，
 * 其次本地偏好，最后才问系统 —— 保证组件挂载不会「改判」首帧已经定好的主题。
 */
export function resolveInitialTheme(): ThemeMode {
  if (typeof document !== "undefined") {
    const preset = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    if (isThemeMode(preset)) return preset;
  }
  return readStoredTheme() ?? systemTheme();
}

/** 是否要求减少动态效果 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 把主题真正写到文档上（属性 + color-scheme + theme-color） */
function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute(THEME_ATTRIBUTE, mode);
  // jsdom 等环境可能不支持 color-scheme 属性，包一层 try 更稳
  try {
    root.style.colorScheme = mode;
  } catch (err) {
    /* 忽略：拿不到 style 也不影响主题切换 */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "dark" ? "#0A0A0A" : "#FFFFFF");
}

export type ThemeProviderProps = {
  children?: React.ReactNode;
  /** 强制初始模式（测试 / 特殊场景用；传了就视为显式选择） */
  initialMode?: ThemeMode;
  /** 是否把偏好写回 localStorage，默认 true */
  persist?: boolean;
};

export function ThemeProvider({ children, initialMode, persist = true }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => initialMode ?? resolveInitialTheme());
  const [isExplicit, setIsExplicit] = useState(
    () => initialMode !== undefined || readStoredTheme() !== null
  );
  /** 首次挂载不做过场动画（只有用户主动切换才需要「丝滑」） */
  const mountedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  /* 1) 主题落地 + 换肤过渡窗口 */
  useEffect(() => {
    applyTheme(mode);

    if (!mountedRef.current) {
      mountedRef.current = true;
      return undefined;
    }
    if (typeof document === "undefined" || prefersReducedMotion()) return undefined;

    const root = document.documentElement;
    root.classList.add(THEME_SWITCHING_CLASS);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      root.classList.remove(THEME_SWITCHING_CLASS);
      timerRef.current = null;
    }, THEME_SWITCH_WINDOW_MS);
    return undefined;
  }, [mode]);

  /* 卸载时收尾：别把过渡窗口类名留在 <html> 上 */
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove(THEME_SWITCHING_CLASS);
      }
    },
    []
  );

  /* 2) 还没显式选择时跟随系统（用户一旦切过就不再自动跟随） */
  useEffect(() => {
    if (isExplicit) return undefined;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setModeState(query.matches ? "light" : "dark");
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [isExplicit]);

  /* 3) 多标签页同步：另一个标签页切换后，这边跟着换 */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isThemeMode(event.newValue)) return;
      setIsExplicit(true);
      setModeState(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setIsExplicit(true);
      setModeState(next);
      if (persist) writeStoredTheme(next);
    },
    [persist]
  );

  const toggle = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      isDark: mode === "dark",
      isLight: mode === "light",
      isExplicit,
      setMode,
      toggle,
    }),
    [mode, isExplicit, setMode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * 读取主题上下文。
 * 注意：刻意在 Provider 之外抛错（而不是静默返回默认值）——
 * 主题是全局状态，静默降级会让「按钮点了没反应」这类问题非常难查。
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme 必须在 <ThemeProvider> 内部使用");
  }
  return context;
}

export default ThemeProvider;
