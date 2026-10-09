import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import SoundToggle from "./SoundToggle";
import { isSoundOn, setSoundOn } from "../lib/sound";

/**
 * 音效开关测试
 * ------------------------------------------------------------------
 * jsdom 里没有 Web Audio，所以这里给 window 装一个**最小替身**：
 * 既能让 sfxAvailable() 为真（否则整颗开关直接不渲染，什么都测不到），
 * 又能数出「点一下到底有没有真的去合成声音」。
 * 音色 / 时长 / 包络这些合成细节由 src/lib/sound.test.js 断言；
 * framer-motion 的弹簧动画依赖真实渲染帧，不在这里断言（与 ThemeToggle 一致）。
 */

const STORAGE_KEY = "shasha-sound";

/** 最小 AudioContext 替身：只记录振荡器，不产生任何声音 */
class FakeAudioContext {
  static oscillators = [];

  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.destination = { connect() {}, disconnect() {} };
  }

  createGain() {
    return {
      gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
    };
  }

  createOscillator() {
    const osc = {
      type: "",
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      detune: { setValueAtTime() {} },
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
      onended: null,
    };
    FakeAudioContext.oscillators.push(osc);
    return osc;
  }

  resume() {
    return Promise.resolve();
  }
}

const renderToggle = () => {
  render(<SoundToggle />);
  return screen.getByRole("switch");
};

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  window.AudioContext = FakeAudioContext;
  FakeAudioContext.oscillators.length = 0;
  setSoundOn(false); // 每个用例都从「关」出发，断言不依赖执行顺序
});

afterEach(() => {
  // 让 framer-motion 的弹簧在假定时器里跑完再卸载，
  // 否则动画帧会活到真实定时器阶段，Jest 会报「worker 无法优雅退出」
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  cleanup();
  window.localStorage.clear();
  delete window.AudioContext;
  jest.useRealTimers();
});

describe("SoundToggle · 语义与交互", () => {
  test("是语义化开关：role=switch，aria-checked 反映当前是否开启", () => {
    const toggle = renderToggle();

    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAttribute("aria-label", "开启音效");
    expect(toggle).toHaveAttribute("data-sound-toggle", "off");
    expect(toggle).toHaveAccessibleName("开启音效");
  });

  test("点一下：翻面 + 落盘 + 可访问名称跟着换（读屏能念对）", () => {
    const toggle = renderToggle();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAttribute("aria-label", "关闭音效");
    expect(toggle).toHaveAttribute("data-sound-toggle", "on");
    expect(isSoundOn()).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("on");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAttribute("aria-label", "开启音效");
    expect(isSoundOn()).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("off");
  });

  test("开关真的发声：开 = toggle 音（带副音 = 2 个振荡器），关 = 先响一声 close 再静音", () => {
    const toggle = renderToggle();

    fireEvent.click(toggle); // 开：toggle 音有副音，合成两个振荡器
    expect(FakeAudioContext.oscillators).toHaveLength(2);

    FakeAudioContext.oscillators.length = 0;
    fireEvent.click(toggle); // 关：先响 close（1 个），否则「关闭」这个动作是哑的
    expect(FakeAudioContext.oscillators).toHaveLength(1);

    FakeAudioContext.oscillators.length = 0;
    fireEvent.click(toggle); // 再开回来，确认「关」= 静音而不是坏了
    expect(FakeAudioContext.oscillators).toHaveLength(2);
  });

  test("外部改动也能同步到界面（状态由引擎统一管理，两边不会各记一份）", () => {
    const toggle = renderToggle();
    expect(toggle).toHaveAttribute("aria-checked", "false");

    act(() => setSoundOn(true));
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  test("环境不支持 Web Audio 时整颗开关不渲染（连入口都不给）", () => {
    delete window.AudioContext;
    const { container } = render(<SoundToggle />);
    expect(container.firstChild).toBeNull();
  });
});
