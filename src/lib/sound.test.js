import profile from "../portfolio.config";
import {
  HOVER_SELECTOR,
  isInteractiveTarget,
  isSoundOn,
  playSfx,
  setSoundOn,
  sfxAvailable,
  sfxFrequency,
  sfxVolume,
  subscribeSound,
} from "./sound";

/**
 * 微音效引擎测试
 * ------------------------------------------------------------------
 * 覆盖四件事：
 *   1) 配置入口：基频 / 音量都来自 portfolio.config，写坏了也炸不了扬声器；
 *   2) 能力探测与事件委托判定：只有真正可交互的元素才响；
 *   3) 开关状态：内存 + localStorage 双写、只通知真正的变化、可退订；
 *   4) 播放路径：用替身 AudioContext 走完合成流程（滑音 + 指数包络 + 播完自清理），
 *      以及「关了 / 节点抛错」时一律静默 —— 调用方永远不需要 try/catch。
 */

const STORAGE_KEY = "shasha-sound";

/** 最小 AudioContext 替身：记录每个振荡器，好数「到底合成没合成」 */
class FakeAudioContext {
  static oscillators = [];
  static instances = [];
  static gains = [];

  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.destination = { connect() {}, disconnect() {} };
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    const gain = {
      gain: {
        value: 0,
        setValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn(),
      },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    FakeAudioContext.gains.push(gain);
    return gain;
  }

  createOscillator() {
    const osc = {
      type: "",
      frequency: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
      detune: { setValueAtTime: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      onended: null,
    };
    FakeAudioContext.oscillators.push(osc);
    return osc;
  }

  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

describe("sound · 音色与音量（配置是唯一来源）", () => {
  test("五个事件的基频都取自 portfolio.config 的 sound.hz", () => {
    Object.entries(profile.sound.hz).forEach(([name, hz]) => {
      expect(sfxFrequency(name)).toBe(hz);
    });
  });

  test("主音量落在 0~1（配置写坏也不会把扬声器炸掉）", () => {
    expect(sfxVolume()).toBeCloseTo(profile.sound.volume, 6);
    expect(sfxVolume()).toBeGreaterThan(0);
    expect(sfxVolume()).toBeLessThanOrEqual(1);
  });
});

describe("sound · 能力探测", () => {
  afterEach(() => {
    delete window.AudioContext;
  });

  test("有 AudioContext 才算支持；没有的环境（jsdom）直接判定不支持", () => {
    delete window.AudioContext;
    expect(sfxAvailable()).toBe(false);

    window.AudioContext = FakeAudioContext;
    expect(sfxAvailable()).toBe(true);
  });
});

describe("sound · 可交互目标判定（事件委托的入口）", () => {
  test("按钮 / 带 href 的链接 / role=button / 显式标记的容器都算可交互", () => {
    expect(isInteractiveTarget(document.createElement("button"))).toBe(true);

    const link = document.createElement("a");
    link.href = "#works";
    expect(isInteractiveTarget(link)).toBe(true);

    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");
    expect(isInteractiveTarget(roleButton)).toBe(true);

    const marked = document.createElement("div");
    marked.setAttribute("data-sfx-hover", "");
    expect(isInteractiveTarget(marked)).toBe(true);
  });

  test("子节点也算数（图标 / 文字都在按钮里，靠 closest 往上找）", () => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    label.textContent = "点我";
    button.appendChild(label);

    expect(isInteractiveTarget(label)).toBe(true);
  });

  test("空白处 / 空锚点 / 禁用按钮 / 标记了 aria-disabled 的都不响", () => {
    expect(isInteractiveTarget(document.createElement("div"))).toBe(false);
    expect(isInteractiveTarget(document.createElement("a"))).toBe(false); // 没有 href

    const disabled = document.createElement("button");
    disabled.disabled = true;
    expect(isInteractiveTarget(disabled)).toBe(false);

    const roleButton = document.createElement("div");
    roleButton.setAttribute("role", "button");
    roleButton.setAttribute("aria-disabled", "true");
    expect(isInteractiveTarget(roleButton)).toBe(false);
  });

  test("非元素目标（null / document / window / 普通对象）不会把监听器搞崩", () => {
    expect(isInteractiveTarget(null)).toBe(false);
    expect(isInteractiveTarget(document)).toBe(false);
    expect(isInteractiveTarget(window)).toBe(false);
    expect(isInteractiveTarget({})).toBe(false);
  });

  test("选择器把「链接 / 按钮 / 显式标记」写在一处，改它时一眼看得出覆盖范围", () => {
    expect(HOVER_SELECTOR).toContain("a[href]");
    expect(HOVER_SELECTOR).toContain("button:not([disabled])");
    expect(HOVER_SELECTOR).toContain('role="button"');
    expect(HOVER_SELECTOR).toContain("data-sfx-hover");
  });
});

describe("sound · 开关状态（内存 + localStorage + 订阅）", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setSoundOn(false);
  });

  afterAll(() => setSoundOn(false));

  test("开启 / 关闭都落盘、内存状态同步（访客的选择要跨刷新记住）", () => {
    setSoundOn(true);
    expect(isSoundOn()).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("on");

    setSoundOn(false);
    expect(isSoundOn()).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("off");
  });

  test("状态没变就不通知订阅者（省掉没必要的 setState）", () => {
    const seen = [];
    const unsubscribe = subscribeSound((on) => seen.push(on));

    setSoundOn(false); // 本来就是关 → 不该通知
    setSoundOn(true);
    setSoundOn(true); // 还是开 → 不该重复通知
    setSoundOn(false);

    unsubscribe();
    expect(seen).toEqual([true, false]);
  });

  test("退订之后收不到通知（组件卸载后还去 setState 就会警告）", () => {
    const seen = [];
    const unsubscribe = subscribeSound((on) => seen.push(on));
    unsubscribe();

    setSoundOn(true);
    setSoundOn(false);
    expect(seen).toEqual([]);
  });
});

describe("sound · 播放路径（替身 AudioContext 走完合成）", () => {
  beforeEach(() => {
    window.AudioContext = FakeAudioContext;
    setSoundOn(true); // 顺带 warmUp：建上下文 + 主音量节点
  });

  afterEach(() => {
    setSoundOn(false);
    delete window.AudioContext;
  });

  test("hover / click / close 各 1 个振荡器；open / toggle 有副音 = 2 个", () => {
    ["hover", "click", "close"].forEach((name) => {
      FakeAudioContext.oscillators.length = 0;
      playSfx(name);
      expect(FakeAudioContext.oscillators).toHaveLength(1);
    });

    ["open", "toggle"].forEach((name) => {
      FakeAudioContext.oscillators.length = 0;
      playSfx(name);
      expect(FakeAudioContext.oscillators).toHaveLength(2);
    });
  });

  test("一次「气泡音」= 从配置的基频起滑 + 指数包络 + 排好 start / stop", () => {
    FakeAudioContext.oscillators.length = 0;
    playSfx("click");

    const [osc] = FakeAudioContext.oscillators;
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(sfxFrequency("click"), expect.any(Number));
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number)
    );
    expect(osc.connect).toHaveBeenCalled();
    expect(osc.start).toHaveBeenCalledTimes(1);
    expect(osc.stop).toHaveBeenCalledTimes(1);
  });

  test("播完自己收拾节点（不断开的话长会话里会越堆越多）", () => {
    FakeAudioContext.oscillators.length = 0;
    playSfx("hover");

    const [osc] = FakeAudioContext.oscillators;
    expect(typeof osc.onended).toBe("function");
    osc.onended();
    expect(osc.disconnect).toHaveBeenCalledTimes(1);
  });

  test("关掉之后完全不动音频图（开关是真的静音，不只是不显示）", () => {
    setSoundOn(false);
    FakeAudioContext.oscillators.length = 0;

    playSfx("click");
    expect(FakeAudioContext.oscillators).toHaveLength(0);
  });

  test("音频设备异常（创建节点直接抛）也不冒泡到界面", () => {
    const context = FakeAudioContext.instances[FakeAudioContext.instances.length - 1];
    expect(context).toBeDefined();

    const original = context.createOscillator;
    context.createOscillator = () => {
      throw new Error("no audio device");
    };

    expect(() => playSfx("click")).not.toThrow();
    context.createOscillator = original;
  });
});
