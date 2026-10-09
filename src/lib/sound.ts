/**
 * 微音效引擎（Web Audio API · 全部现场合成，仓库里没有任何音频文件）
 * ==========================================================================
 * 为什么不用 Howler.js / 音频文件：
 *   1) 这几个音都是 **10~180ms 的「一口」**（悬停轻响 / 点击确认 / 菜单开合），
 *      用振荡器 + 指数衰减包络几行就能合成，不需要解码、不需要网络请求，
 *      也不会有「音频还没加载完所以没响」的空窗；
 *   2) 0 版权风险：没有一个字节是别人的素材；
 *   3) 体积 = 0：不进任何 chunk（本文件只有 ~4KB 逻辑）。
 *
 * 三条硬约束（都是浏览器强加的，绕不过）：
 *   · AudioContext 必须在**用户手势**里创建 / resume，否则一直是 suspended；
 *     所以这里做成「懒创建」—— 第一次真正要出声（悬停 / 点击）时才 new，
 *     并顺手 resume()。这也意味着「一进站就自动播」在浏览器里根本做不到；
 *   · 默认**关**（portfolio.config 的 sound.defaultOn）—— 一声招呼都不打就
 *     出声对访客不礼貌，开关在右上角（src/components/SoundToggle.tsx）；
 *   · 状态存在 localStorage：访客的选择要跨页面 / 跨刷新记住。
 *
 * 事件与音色（都可在 portfolio.config 的 sound.hz 里改基频）：
 *   hover  1180Hz 三角波 → 上滑   60ms  极小音量，像鼠标划过金属
 *   click   660Hz 方波   → 下滑   90ms  像素感的「嗒」
 *   open    880Hz 正弦   → 上滑  150ms  菜单展开（带一个 +7 音分的副音）
 *   close   520Hz 正弦   → 下滑  130ms  菜单收起 / 折叠
 *   toggle 1320Hz 正弦   → 上滑  180ms  开关类（音效 / 日夜）翻面
 *
 * 测试友好：没有 AudioContext 的环境（jsdom）里 sfxAvailable() 为 false，
 * playSfx() 直接空转 —— 测试不需要任何 stub 也不会报错。
 */

import profile from "../portfolio.config";

/** 可播放的音效名 */
export type SfxName = "hover" | "click" | "open" | "close" | "toggle";

/** 一条音色的参数（时长 / 滑音比例 / 波形 / 相对峰值） */
type Voice = {
  type: OscillatorType;
  ms: number;
  glide: number;
  peak: number;
  /** 副音（同频 +N 音分）：让「开 / 关」这类音有厚度，不是干巴巴一声 */
  detune?: number;
};

/** 各事件的默认音色；基频从配置读，缺项就退回表里的默认值 */
const VOICES: Record<SfxName, Voice & { hz: number }> = {
  hover: { type: "triangle", ms: 60, glide: 1.06, peak: 0.5, hz: 1180 },
  click: { type: "square", ms: 90, glide: 0.72, peak: 0.42, hz: 660 },
  open: { type: "sine", ms: 150, glide: 1.5, peak: 0.55, hz: 880, detune: 7 },
  close: { type: "sine", ms: 130, glide: 0.62, peak: 0.5, hz: 520 },
  toggle: { type: "sine", ms: 180, glide: 1.9, peak: 0.5, hz: 1320, detune: 12 },
};

/** 配置形状显式声明：portfolio.config.js 是 JS，靠推断容易在联合类型上出「属性不存在」的噪音 */
type SoundConfig = {
  enabled?: boolean;
  defaultOn?: boolean;
  volume?: number;
  hover?: boolean;
  click?: boolean;
  hz?: Partial<Record<SfxName, number>>;
};

/**
 * 数值收敛：非有限值退回 fallback，再夹到 [min, max]。
 * portfolio.config.js 是 JS，volume 可能被写成 "0.2" / 空 / 越界，这里统一收口。
 */
function clampNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const CONFIG: SoundConfig = (profile && profile.sound) || {};
/** 站点是否具备发声能力（false 时连开关都不显示） */
const SOUND_ENABLED = CONFIG.enabled !== false;
const DEFAULT_ON = CONFIG.defaultOn === true;
const VOLUME = clampNumber(Number(CONFIG.volume), 0.16, 0, 1);
const STORAGE_KEY = "shasha-sound";

/** 基频覆盖表：只认配置里给了正数的项 */
const HZ: Record<SfxName, number> = (() => {
  const custom = (CONFIG.hz || {}) as Partial<Record<SfxName, unknown>>;
  const out = {} as Record<SfxName, number>;
  (Object.keys(VOICES) as SfxName[]).forEach((name) => {
    const value = Number(custom[name]);
    out[name] = Number.isFinite(value) && value > 0 ? value : VOICES[name].hz;
  });
  return out;
})();

/**
 * 取某个音效的基频。
 * 单独抽出来是为了「音高」这件事只有一个出口：测试可以断言配置覆盖生效，
 * 而播放路径（playSfx）不必关心配置长什么样。
 */
export function sfxFrequency(name: SfxName): number {
  const value = HZ[name];
  return Number.isFinite(value) && value > 0 ? value : VOICES[name].hz;
}

/* --------------------------------------------------------------------------
   开关状态：内存 + localStorage 双写，并给 React 提供订阅
   -------------------------------------------------------------------------- */

/** 读取本地留存（用户上次的选择）；读不到就用配置里的默认值 */
function readStored(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return DEFAULT_ON;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "on") return true;
    if (raw === "off") return false;
  } catch (error) {
    /* 隐私模式 / 存储被禁用：静默降级成「按默认值」，不影响站点 */
  }
  return DEFAULT_ON;
}

let soundOn = readStored();
const listeners = new Set<(on: boolean) => void>();

/** 站点是否具备发声能力（浏览器支持 Web Audio + 配置没关） */
export function sfxAvailable(): boolean {
  if (!SOUND_ENABLED) return false;
  if (typeof window === "undefined") return false;
  const scope = window as Window & { webkitAudioContext?: unknown };
  return (
    typeof (window as unknown as { AudioContext?: unknown }).AudioContext === "function" ||
    typeof scope.webkitAudioContext === "function"
  );
}

/** 当前是否开启音效（开关按钮读它） */
export function isSoundOn(): boolean {
  return soundOn && SOUND_ENABLED;
}

/** 订阅开关变化：返回取消订阅函数（给 useSyncExternalStore / useEffect 用） */
export function subscribeSound(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 写入开关（同时落盘 + 通知订阅者）；开启时会顺手「预热」音频上下文 */
export function setSoundOn(on: boolean): void {
  const next = Boolean(on) && SOUND_ENABLED;
  if (next) warmUp();
  if (next === soundOn) return;
  soundOn = next;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch (error) {
      /* 同上：存储不可用只影响「记住选择」，不影响本次会话 */
    }
  }
  listeners.forEach((listener) => listener(next));
}

/* --------------------------------------------------------------------------
   音频图：懒创建的 AudioContext + 一个主音量节点
   -------------------------------------------------------------------------- */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

type AudioContextCtor = new () => AudioContext;

/** 拿到（必要时创建）音频上下文；环境不支持就返回 null */
function ensureContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  if (!sfxAvailable()) return null;
  const scope = window as Window & { webkitAudioContext?: AudioContextCtor };
  const Ctor =
    (window as unknown as { AudioContext?: AudioContextCtor }).AudioContext || scope.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  try {
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = VOLUME;
    masterGain.connect(audioCtx.destination);
  } catch (error) {
    /* 某些环境（无音频设备）会直接抛：退化成无声站点，绝不冒泡到界面 */
    audioCtx = null;
    masterGain = null;
  }
  return audioCtx;
}

/**
 * 预热：在用户手势里创建 / 恢复音频上下文。
 * 开关按钮点下去时调一次，之后所有音都能立刻出声（否则第一次会有几十 ms 延迟）。
 */
export function warmUp(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === "suspended" && typeof ctx.resume === "function") {
    void ctx.resume();
  }
}

/** 主音量（测试与调试用；运行时改音量请改配置） */
export function sfxVolume(): number {
  return VOLUME;
}

/* --------------------------------------------------------------------------
   播放：一次「一口气泡音」= 振荡器（滑音）+ 指数包络
   -------------------------------------------------------------------------- */

/** 包络：起始 6ms 冲到峰值（不做慢起音，微音效要「立刻」），随后指数衰减到听不见 */
const ATTACK_S = 0.006;
/** 指数衰减不能落在 0 上（exponentialRamp 要求 > 0），用一个极小的尾巴 */
const SILENCE = 0.0001;

/** 事件是否被配置允许发声（hover / click 可以分别关掉） */
function voiceAllowed(name: SfxName): boolean {
  if (name === "hover") return CONFIG.hover !== false;
  if (name === "click") return CONFIG.click !== false;
  return true;
}

/**
 * 播放一个音效。
 * 关闭状态 / 环境不支持 / 配置禁用了这类声音 / 音频设备异常 —— 一律静默返回，
 * 调用方（事件监听）永远不需要 try/catch。
 */
export function playSfx(name: SfxName): void {
  if (!voiceAllowed(name) || !isSoundOn()) return;
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  // 首次出声通常就在用户手势里（hover / click），顺手把被浏览器挂起的上下文唤醒
  if (ctx.state === "suspended" && typeof ctx.resume === "function") {
    void ctx.resume();
  }

  const voice = VOICES[name];
  const hz = sfxFrequency(name);
  const durationS = voice.ms / 1000;
  const now = ctx.currentTime;
  const end = now + durationS;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = voice.type;
    osc.frequency.setValueAtTime(hz, now);
    // 滑音：指数变化 = 音高「匀」地滑，听感比线性自然
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, hz * voice.glide), end);
    gain.gain.setValueAtTime(SILENCE, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, voice.peak), now + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(SILENCE, end);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(end + 0.02);
    // 收拾节点，避免长会话里越堆越多（onended 在支持的环境里一定触发）
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch (error) {
        /* 已经断开就无所谓 */
      }
    };

    /* 副音：同频 +N 音分（detune 只认音分，100 音分 = 半音），
       只给「开 / 关 / 开关」这类需要一点厚度的音用 */
    if (voice.detune) {
      const second = ctx.createOscillator();
      const secondGain = ctx.createGain();
      second.type = voice.type;
      second.frequency.setValueAtTime(hz, now);
      second.frequency.exponentialRampToValueAtTime(Math.max(40, hz * voice.glide), end);
      second.detune.setValueAtTime(voice.detune, now);
      secondGain.gain.setValueAtTime(SILENCE, now);
      secondGain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, voice.peak * 0.6), now + ATTACK_S);
      secondGain.gain.exponentialRampToValueAtTime(SILENCE, end);
      second.connect(secondGain);
      secondGain.connect(masterGain);
      second.start(now);
      second.stop(end + 0.02);
      second.onended = () => {
        try {
          second.disconnect();
          secondGain.disconnect();
        } catch (error) {
          /* 同上 */
        }
      };
    }
  } catch (error) {
    /* 参数不合法 / 上下文已关闭：静默，界面照常工作 */
  }
}

/* --------------------------------------------------------------------------
   全站事件委托：不用给每个按钮挂 onMouseEnter
   -------------------------------------------------------------------------- */

/** 会触发「悬停轻响」的元素（链接 / 按钮 / 显式标记的容器） */
export const HOVER_SELECTOR =
  'a[href], button:not([disabled]), [role="button"]:not([aria-disabled="true"]), [data-sfx-hover]';

/** 判断某个事件目标是否落在「可交互」元素上（事件委托用；也给测试直接调） */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return Boolean((target as Element).closest(HOVER_SELECTOR));
}


