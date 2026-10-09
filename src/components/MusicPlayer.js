import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import APlayer from "aplayer";
import "aplayer/dist/APlayer.min.css";
import {
  Check,
  ListMusic,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import {
  AiOutlineClose,
  AiOutlineCustomerService,
  AiOutlineDown,
  AiOutlineExclamationCircle,
  AiOutlineLoading3Quarters,
  AiOutlineReload,
  AiOutlineUp,
} from "react-icons/ai";
import { AnimatePresence, motion } from "framer-motion";
import MusicBrandIcon from "./MusicBrandIcon";
import { playSfx } from "../lib/sound";
import profile from "../portfolio.config";

/**
 * ==========================================================================
 *  悬浮音乐播放器（复古拟物 · 黑胶唱机风格 · 固定在页面左下角）
 * ==========================================================================
 *  视觉：APlayer 的封面容器被改造成「黑胶唱片」（外圈黑胶纹理 + 中心专辑标签），
 *  播放时恒速旋转（暂停用 animation-play-state 冻结在当前角度，不会弹回 0°）；
 *  面板里另有一根拟物唱针，播放时压下、暂停时抬起。
 *  两者都是纯 CSS 动画，状态来自 APlayer 转发的 audio 事件（play / pause）。
 *
 *  数据链路：
 *    默认走自建解析服务（music-api/，同源 /music/api）——
 *      网易云 / QQ / 抖音 / 汽水：公共 Meting 实例聚合解析；
 *      Spotify：服务端解析公开歌单后匹配国内可播放音源，所以无梯子也能听。
 *    解析服务不可用时，自动退回「公共 Meting 实例直连」模式（不需要后端）。
 *
 *  控制条：APlayer 自带的控制条整条隐藏（style.css「自绘控制条」一段里 display:none），
 *  换成面板里自绘的 .mp-controls——lucide-react 图标 + flex 居中，
 *  一个实心主按钮（播放 / 暂停）居中，两侧各两个极简副按钮
 *  （循环模式 / 上一曲 / 下一曲 / 播放列表），左右严格对称。
 *  进度与音量同样是自绘的 <input type="range">：拖动时直接调 APlayer 的
 *  seek() / volume()，只把 audio 元素当数据源，不依赖 APlayer 的 DOM 结构与主题样式。
 *
 *  平台选择：原生 <select> 换成自绘 listbox（.mp-select-trigger + .mp-menu）。
 *  原生弹层由浏览器画在顶层（top layer，z-index 管不到），圆角 / 图标 / 深色
 *  皮肤一律没法统一，所以这里自绘：
 *    ‣ 用 createPortal 挂到 document.body + position: fixed —— 面板本身有
 *      backdrop-filter 与 overflow: hidden，任何「面板内绝对定位」的弹层都会被
 *      裁掉（filter / backdrop-filter 还会把 fixed 后代的包含块拽回面板内部），
 *      只有挂到 body 才真的盖在唱机与控制条之上；
 *    ‣ 打开时按触发按钮的矩形定位，下方空间不够就自动向上翻；
 *    ‣ 每个频道带自绘品牌图标（见 MusicBrandIcon.tsx），分组标题保留；
 *    ‣ 键盘可达：↑ / ↓ 移动、Enter 选中、Esc 关闭并把焦点还给按钮，
 *      点击页面其他位置同样关闭。
 *
 *  组件生命周期：挂在 App.js 的 Routes 之外，路由切换不会卸载，
 *  因此 APlayer 实例与播放进度都能保持连续。
 *  关闭（✕）只做「收起成挂件 + 视觉隐藏」，绝不卸载面板：一旦卸载，APlayer 的
 *  DOM 会随之消失，而实例无法重新挂载，重新展开就会变成空面板（历史 bug）。
 *  隐藏用 visibility 而不是 display，保证盒子尺寸不变、进度条测量准确。
 * ==========================================================================
 */

const CONFIG = profile.musicPlayer || {};
const PLATFORMS = Array.isArray(CONFIG.platforms) ? CONFIG.platforms : [];
const API_BASE = (process.env.REACT_APP_MUSIC_API || CONFIG.apiBase || "/music/api").replace(/\/+$/, "");
const STORAGE_KEY = "shasha-music-player";
/**
 * APlayer 主题色：跟随站点「黑白灰」令牌（--accent），不再写死紫色。
 * APlayer 会把 theme 写成部分控件的行内样式（进度条 / 缩略点 / 按钮），
 * 所以这里取当前主题下「与背景对立的那一极」：
 *   浅色主题 → 纯黑 #111111；深色主题 → 纯白 #ffffff。
 */
function readThemeColor() {
  if (typeof window === "undefined" || !window.getComputedStyle) return "#111111";
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  return value || "#111111";
}
/** 同一首歌最多尝试几次（代理 → 重新解析），超过就交给 APlayer 自动跳过 */
const MAX_ATTEMPTS = 2;

/** 自绘下拉：弹层与触发按钮之间的间距、弹层最大高度、视口安全边距 */
const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 260;
const MENU_MIN_HEIGHT = 120;
const VIEWPORT_PAD = 8;
/** 弹层的 id：触发按钮的 aria-controls 指过来，测试也认它 */
const MENU_ID = "mp-platform-menu";

/**
 * 播放顺序：APlayer 的 `options.loop`（它的 `ended` 回调里真的会读这个值）。
 * 自绘的循环按钮按这个顺序轮转，语义与 APlayer 内置按钮一致：
 *   all = 列表循环（默认） / one = 单曲循环 / none = 播完停
 */
const LOOP_MODES = ["all", "one", "none"];
const LOOP_LABEL = { all: "列表循环", one: "单曲循环", none: "不循环" };

/** 秒 → m:ss；时长未知（NaN / Infinity / 负数）时给占位符，避免界面出现 NaN */
function formatTime(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function readPrefs() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writePrefs(patch) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch (err) {
    /* 隐私模式下 localStorage 不可用，忽略即可，不影响播放 */
  }
}

function pickInitialPlatform(prefs) {
  const saved = PLATFORMS.find((item) => item.key === prefs.platform);
  if (saved) return saved.key;
  const fallback = PLATFORMS.find((item) => item.key === CONFIG.defaultPlatform);
  return (fallback || PLATFORMS[0] || {}).key || "";
}

/** 按 group 分组，渲染成 select 的 optgroup */
function groupPlatforms(list) {
  const groups = [];
  list.forEach((item) => {
    const title = item.group || "其他";
    let group = groups.find((entry) => entry.title === title);
    if (!group) {
      group = { title, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups;
}

/**
 * 兜底：直接用公共 Meting 实例取榜单（浏览器直连，实例已开放 CORS）。
 * 只在自建解析服务不可用时使用，Spotify 频道不支持该模式。
 */
async function fetchViaPublicMeting(platform, limit) {
  const base = CONFIG.fallbackMeting;
  if (!base) throw new Error("未配置兜底解析实例");
  if (platform.mode !== "meting") throw new Error("该频道需要解析服务在线");
  const url = `${base}?server=${platform.provider}&type=playlist&id=${encodeURIComponent(platform.id)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`兜底实例返回 ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error("兜底实例没有返回曲目");
  return data.slice(0, limit).map((item) => ({
    id: item.id || "",
    name: item.name || item.title || "",
    artist: item.artist || item.author || "",
    url: item.url || "",
    pic: item.pic || item.cover || "",
    lrc: item.lrc || "",
    origin: platform.provider,
  }));
}

function MusicPlayer() {
  const initialPrefs = useMemo(readPrefs, []);
  const [platformKey, setPlatformKey] = useState(() => pickInitialPlatform(initialPrefs));
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [collapsed, setCollapsed] = useState(() => initialPrefs.collapsed === true);
  const [closed, setClosed] = useState(() => initialPrefs.closed === true);

  // 容器节点用「回调 ref + state」保存：节点挂载/变化时初始化 effect 都能感知，
  // 不会出现「节点晚于 effect 出现 → APlayer 永远建不出来」的空面板。
  const [containerEl, setContainerEl] = useState(null);
  const containerRef = useCallback((node) => setContainerEl(node), []);
  /** APlayer 是否已创建完成：容器节点由回调 ref 注入、比 effect 晚一帧，首屏预加载要等它 */
  const [playerReady, setPlayerReady] = useState(false);
  /** 是否正在播放：驱动黑胶旋转与唱针压下 / 抬起（APlayer 转发的 audio 事件同步） */
  const [playing, setPlaying] = useState(false);
  /** 自绘进度条用的播放进度 / 总时长（秒），数据源是 audio.currentTime / audio.duration */
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  /** 播放顺序（APlayer options.loop）：all / one / none */
  const [loopMode, setLoopMode] = useState("all");
  /** 音量（0~1）：初值取用户上次保存的值，没有就用配置里的音量 */
  const [volume, setVolume] = useState(() =>
    typeof initialPrefs.volume === "number" ? initialPrefs.volume : CONFIG.volume || 0.65
  );
  /** 音量条是否展开（按钮在标题栏，展开后是一根细长滑块） */
  const [volumeOpen, setVolumeOpen] = useState(false);
  /** 是否正在拖动进度条：拖动期间忽略 timeupdate，避免滑块被回放位置抢回去 */
  const draggingRef = useRef(false);
  const playerRef = useRef(null);
  const abortRef = useRef(null);
  const lastIndexRef = useRef(-1);
  const failuresRef = useRef({ index: -1, count: 0, tried: new Set() });
  const handlersRef = useRef({ onError: () => {}, onSwitch: () => {} });

  const groups = useMemo(() => groupPlatforms(PLATFORMS), []);

  /** 切歌时同步歌词显隐（歌词内容由 APlayer 以 lrcType:3 异步拉取同源接口） */
  const syncLyrics = useCallback((index) => {
    const player = playerRef.current;
    if (!player || !player.list || !player.list.audios) return;
    const song = player.list.audios[index];
    if (!song) return;
    if (lastIndexRef.current !== index) {
      lastIndexRef.current = index;
      failuresRef.current = { index, count: 0, tried: new Set() };
    }
    if (song.lrc) player.lrc.show();
    else player.lrc.hide();
  }, []);

  /** 换地址重试当前曲目：switch 会重设 audio.src，并清掉 APlayer 内部的跳过定时器 */
  const playAt = useCallback((index, url) => {
    const player = playerRef.current;
    const song = player && player.list.audios[index];
    if (!player || !song || !url) return;
    song.url = url;
    player.list.switch(index);
    player.audio.src = url;
    player.play();
  }, []);

  /** 播放失败：先改用服务器中转，再找后端重新解析，都失败就等 APlayer 自动跳过 */
  const handlePlaybackError = useCallback(async () => {
    const player = playerRef.current;
    if (!player || !player.list || !player.list.audios) return;
    const index = player.list.index;
    const song = player.list.audios[index];
    if (!song) return;
    if (failuresRef.current.index !== index) {
      failuresRef.current = { index, count: 0, tried: new Set() };
    }
    const state = failuresRef.current;
    state.count += 1;
    if (state.count > MAX_ATTEMPTS) {
      setNotice(`「${song.name}」暂时无法播放，已自动跳过`);
      return;
    }

    if (!state.tried.has("proxy") && song.proxyUrl && song.proxyUrl !== song.url) {
      state.tried.add("proxy");
      setNotice(`「${song.name}」直连失败，改用服务器中转…`);
      playAt(index, song.proxyUrl);
      return;
    }

    if (!state.tried.has("resolve")) {
      state.tried.add("resolve");
      try {
        const params = new URLSearchParams({
          origin: song.origin || "",
          sid: song.id || "",
          name: song.name || "",
          artist: song.artist || "",
          proxy: song.proxyUrl ? "1" : "0",
        });
        const res = await fetch(`${API_BASE}/resolve?${params}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok && data.song && data.song.url) {
          setNotice(`已重新解析「${data.song.name || song.name}」`);
          playAt(index, data.song.url);
          return;
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      } catch (err) {
        setNotice(`重新解析失败：${err.message}`);
      }
    }

    setNotice(`「${song.name}」播放失败，稍后自动跳过`);
  }, [playAt]);

  // 用 ref 转发事件，保证 APlayer 里绑定的一次性回调始终拿到最新的实现
  useEffect(() => {
    handlersRef.current.onError = handlePlaybackError;
    handlersRef.current.onSwitch = syncLyrics;
  }, [handlePlaybackError, syncLyrics]);

  /** 用新榜单替换播放列表：清空 → 载入 → 需要时自动播放 */
  const applySongs = useCallback((songs, autoplay) => {
    const player = playerRef.current;
    if (!player) return;
    const withProxy = CONFIG.streamingProxy !== false;
    const audios = songs
      .filter((song) => song && song.url)
      .map((song) => ({
        name: song.name || "未知曲目",
        artist: song.artist || "",
        url: song.url,
        cover: song.pic || undefined,
        lrc: song.lrc || "",
        theme: readThemeColor(),
        // 以下几个是自定义字段，播放失败重试时要用（APlayer 会原样保留）
        id: song.id || "",
        origin: song.origin || "",
        proxyUrl:
          withProxy && song.rawUrl ? `${API_BASE}/stream?u=${encodeURIComponent(song.rawUrl)}` : "",
      }));

    player.list.clear();
    player.list.add(audios);
    lastIndexRef.current = -1;
    failuresRef.current = { index: -1, count: 0, tried: new Set() };
    setCount(audios.length);

    if (autoplay && audios.length) {
      player.list.switch(0);
      player.play();
    }
  }, []);

  /** 加载榜单：优先自建解析服务，失败则退回公共 Meting 实例直连 */
  const loadPlatform = useCallback(
    async (key, { autoplay = false } = {}) => {
      const platform = PLATFORMS.find((item) => item.key === key) || PLATFORMS[0];
      if (!platform || !playerRef.current) return;

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError("");
      setNotice("");

      try {
        const params = new URLSearchParams({
          platform: platform.key,
          provider: platform.provider,
          id: platform.id,
          mode: platform.mode || "meting",
          label: platform.name || platform.key,
          limit: String(CONFIG.limit || 20),
          proxy: CONFIG.streamingProxy === false ? "0" : "1",
        });
        const res = await fetch(`${API_BASE}/playlist?${params}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || `解析服务返回 ${res.status}`);
        const songs = Array.isArray(data.songs) ? data.songs : [];
        if (!songs.length) throw new Error("该榜单暂时没有可播放的曲目");
        applySongs(songs, autoplay);
        setNotice(data.preview ? "部分曲目为版权试听片段（已优先匹配完整音源）" : "");
      } catch (err) {
        if (err.name === "AbortError") return;
        try {
          const songs = await fetchViaPublicMeting(platform, CONFIG.limit || 20);
          applySongs(songs, autoplay);
          setNotice("解析服务不可用，已自动切换到公共实例直连模式");
        } catch (fallbackErr) {
          setCount(0);
          setError(err.message || "榜单加载失败");
        }
      } finally {
        setLoading(false);
      }
    },
    [applySongs]
  );

  // 初始化 APlayer：只创建一次，保证路由切换 / 隐藏面板时播放不中断。
  // 注意：面板是「常驻 DOM + 隐藏」而不是卸载，所以容器节点不会被替换，
  //       playerRef 一旦建好就一直复用（切平台只换列表，不重建实例）。
  useEffect(() => {
    if (CONFIG.enabled === false || !containerEl || playerRef.current) return undefined;
    const prefs = readPrefs();
    const player = new APlayer({
      container: containerEl,
      audio: [],
      theme: readThemeColor(),
      lrcType: 3, // 3 = 异步拉取歌词地址（这里指向同源的 /music/api/lrc）
      autoplay: false,
      mutex: true,
      fixed: false,
      preload: "auto",
      listFolded: CONFIG.listFolded !== false,
      listMaxHeight: "156px",
      volume: typeof prefs.volume === "number" ? prefs.volume : CONFIG.volume || 0.65,
      storageName: `${STORAGE_KEY}-ap`,
    });
    playerRef.current = player;
    setPlayerReady(true);

    player.on("error", () => handlersRef.current.onError());
    player.on("listswitch", (info) => {
      const index = info && typeof info.index === "number" ? info.index : player.list.index;
      handlersRef.current.onSwitch(index);
      // 换歌：进度条立刻归零，别让上一首的时间停在界面上
      setPosition(0);
      setDuration(0);
    });
    player.on("volumechange", () => {
      setVolume(player.audio.volume);
      writePrefs({ volume: player.audio.volume });
    });

    // 唱片旋转 / 唱针姿态依赖「是否正在播放」：
    // APlayer 内部会把原生 audio 事件（play / playing / pause / ended）转发到 .on()，
    // 这里只做一个「播放态 → React 状态」的同步，不动它的播放逻辑。
    const syncPlaying = () => setPlaying(!!player.audio && player.audio.paused === false);
    player.on("play", syncPlaying);
    player.on("playing", syncPlaying);
    player.on("pause", () => setPlaying(false));
    player.on("ended", () => setPlaying(false));

    // 进度同步：APlayer 同样把 timeupdate / durationchange 等原生事件转发出来，
    // 自绘进度条只读 audio 元素（不读 APlayer 内置 bar，那条控制条已经隐藏）。
    const syncProgress = () => {
      if (draggingRef.current) return; // 拖动中由用户说了算
      const audio = player.audio;
      if (!audio) return;
      if (Number.isFinite(audio.currentTime)) setPosition(audio.currentTime);
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    ["timeupdate", "durationchange", "loadedmetadata", "seeked", "canplay"].forEach((name) =>
      player.on(name, syncProgress)
    );

    // 把 APlayer 的内部状态同步到自绘控制条上（循环模式 / 音量）
    setLoopMode(LOOP_MODES.includes(player.options.loop) ? player.options.loop : "all");
    setVolume(player.audio.volume);

    return () => {
      player.destroy();
      playerRef.current = null;
      setPlayerReady(false);
      setPlaying(false);
    };
  }, [containerEl]);

  // 首次进入页面：等 APlayer 就绪后预加载榜单，但不自动播放
  // （用户还没交互，浏览器会拦截 autoplay；也避免无谓打扰）
  useEffect(() => {
    if (CONFIG.enabled === false || !playerReady || !platformKey) return;
    loadPlatform(platformKey, { autoplay: false });
    // 仅在 APlayer 首次就绪时预加载，之后由切换平台 / 重新加载 / 重新打开触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady]);

  // 重新展开（或从挂件恢复）时，把当前曲目的歌词显隐同步一次：
  // 隐藏期间不会触发 listswitch，APlayer 内部的歌词可见状态可能已过期。
  // 说明：隐藏用的是 visibility（盒子尺寸不变），而 APlayer 自身不监听 window.resize，
  //       所以这里不需要再做进度条尺寸重算。
  useEffect(() => {
    if (closed || collapsed || !playerReady) return undefined;
    const player = playerRef.current;
    if (!player || !player.list || !Array.isArray(player.list.audios) || !player.list.audios.length) {
      return undefined;
    }
    const timer = setTimeout(() => syncLyrics(player.list.index), 0);
    return () => clearTimeout(timer);
  }, [closed, collapsed, playerReady, syncLyrics]);

  const handlePlatformChange = useCallback(
    (key) => {
      setPlatformKey(key);
      writePrefs({ platform: key });
      // 切换平台：清空当前播放列表 → 载入新榜单 → 自动播放
      loadPlatform(key, { autoplay: true });
    },
    [loadPlatform]
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      writePrefs({ collapsed: !value });
      return !value;
    });
  }, []);

  /** 重新加载（↻）：先清空当前列表，再重新请求「当前下拉选中榜单」的曲目 */
  const handleReload = useCallback(() => {
    const player = playerRef.current;
    const wasPlaying = !!(player && player.audio && player.audio.paused === false);
    if (player && player.list) {
      player.list.clear();
      lastIndexRef.current = -1;
      failuresRef.current = { index: -1, count: 0, tried: new Set() };
      setCount(0);
    }
    setNotice("");
    // 原本在播就续播，避免「点刷新 = 突然静音」
    loadPlatform(platformKey, { autoplay: wasPlaying });
  }, [loadPlatform, platformKey]);

  const handleClose = useCallback(() => {
    setClosed(true);
    writePrefs({ closed: true });
  }, []);

  /** 从挂件重新展开：列表为空时按当前选中的榜单重新拉取一次 */
  const handleOpen = useCallback(() => {
    setClosed(false);
    writePrefs({ closed: false });
    const player = playerRef.current;
    const hasSongs = !!(player && player.list && Array.isArray(player.list.audios) && player.list.audios.length);
    if (!hasSongs && !loading) loadPlatform(platformKey, { autoplay: false });
  }, [loadPlatform, platformKey, loading]);

  /* ---------- 自绘控制条：全部走 APlayer 的公开 API ---------- */
  /** 统一「取实例 → 调用」：实例还没建好时点击不会抛错 */
  const withPlayer = useCallback((run) => {
    const player = playerRef.current;
    if (player) run(player);
  }, []);

  const handleTogglePlay = useCallback(() => withPlayer((player) => player.toggle()), [withPlayer]);
  const handlePrev = useCallback(() => withPlayer((player) => player.skipBack()), [withPlayer]);
  const handleNext = useCallback(() => withPlayer((player) => player.skipForward()), [withPlayer]);
  const handleToggleList = useCallback(() => withPlayer((player) => player.list.toggle()), [withPlayer]);

  /**
   * 循环模式轮转：all（列表循环）→ one（单曲循环）→ none（不循环）→ all。
   * 直接改 `options.loop` 即可：APlayer 的 ended 回调会读它来决定「下一首 / 单曲重播 / 停」，
   * 不需要也不应该重建实例。
   */
  const handleCycleLoop = useCallback(() => {
    withPlayer((player) => {
      const current = LOOP_MODES.includes(player.options.loop) ? player.options.loop : "all";
      const next = LOOP_MODES[(LOOP_MODES.indexOf(current) + 1) % LOOP_MODES.length];
      player.options.loop = next;
      setLoopMode(next);
    });
  }, [withPlayer]);

  /** 拖动进度条：先把滑块位置落到 state（手感跟手），再让 APlayer 真正跳转 */
  const handleSeek = useCallback(
    (event) => {
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      setPosition(value);
      withPlayer((player) => player.seek(value));
    },
    [withPlayer]
  );

  const handleVolume = useCallback(
    (event) => {
      const value = Number(event.target.value) / 100;
      if (!Number.isFinite(value)) return;
      setVolume(value);
      // 第二个参数 true = 不写 APlayer 自己的 storage：音量统一存在我们的 prefs 里
      withPlayer((player) => player.volume(value, true));
    },
    [withPlayer]
  );

  /** 拖拽 / 键盘调整进度期间挂起 timeupdate 同步（见 syncProgress 里的 draggingRef） */
  const seekDragHandlers = useMemo(
    () => ({
      onMouseDown: () => {
        draggingRef.current = true;
      },
      onMouseUp: () => {
        draggingRef.current = false;
      },
      onTouchStart: () => {
        draggingRef.current = true;
      },
      onTouchEnd: () => {
        draggingRef.current = false;
      },
      onKeyDown: () => {
        draggingRef.current = true;
      },
      onKeyUp: () => {
        draggingRef.current = false;
      },
      onBlur: () => {
        draggingRef.current = false;
      },
    }),
    []
  );

  const toggleVolume = useCallback(() => setVolumeOpen((open) => !open), []);

  /* ========================================================================
     平台 / 榜单：自绘 listbox
     ------------------------------------------------------------------------
     原生 <select> 的弹层由浏览器画在顶层（top layer）：z-index / 圆角 / 图标
     全都管不到它，深色页面里还会冒出一块系统灰。这里改成自绘弹层：
       · 触发按钮就是唯一入口（aria-haspopup="listbox" / aria-expanded）；
       · 弹层 portal 到 body + position: fixed —— 面板有 backdrop-filter 与
         overflow: hidden，面板内定位的弹层会被裁掉（filter / backdrop-filter
         还会把 fixed 后代的包含块拽回面板里），必须挂到 body 才盖得住；
       · 每次打开按触发按钮的矩形定位，下方空间不足时自动向上翻；
       · 键盘：↑↓ 移动、Home/End 跳首尾、Enter 选中、Esc 关闭并还焦。
     ======================================================================== */
  const pickerRef = useRef(null);
  const menuRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuBox, setMenuBox] = useState(null);

  /** 按触发按钮的矩形算弹层位置（可上翻），窗口尺寸变化时重算 */
  const placeMenu = useCallback(() => {
    const trigger = pickerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_PAD;
    const above = rect.top - MENU_GAP - VIEWPORT_PAD;
    // 下方塞不下「最小高度」且上方更宽裕 → 向上展开
    const openUp = below < MENU_MIN_HEIGHT && above > below;
    const room = Math.max(MENU_MIN_HEIGHT, openUp ? above : below);
    const height = Math.min(MENU_MAX_HEIGHT, room);
    const width = rect.width;
    setMenuBox({
      placement: openUp ? "up" : "down",
      left: Math.max(VIEWPORT_PAD, Math.min(rect.left, window.innerWidth - width - VIEWPORT_PAD)),
      top: openUp ? rect.top - MENU_GAP - height : rect.bottom + MENU_GAP,
      width,
      height,
    });
  }, []);

  /**
   * 收起弹层。
   * ⚠️ 刻意**不**清掉 menuBox：退场动画是在原位播的（AnimatePresence 会先留着
   * 那个节点），位置一旦被清成 null，弹层就会「跳」到屏幕左上角再消失。
   * 下次打开时 placeMenu() 会按当时的按钮矩形重算，所以留着没有任何副作用。
   */
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    playSfx("close");
  }, []);

  const openPicker = useCallback(() => {
    placeMenu();
    setPickerOpen(true);
    playSfx("open");
  }, [placeMenu]);

  const togglePicker = useCallback(() => {
    if (pickerOpen) closePicker();
    else openPicker();
  }, [pickerOpen, closePicker, openPicker]);

  /** 选中某个频道：切换 + 收起弹层 + 焦点还给触发按钮 */
  const selectPlatform = useCallback(
    (key) => {
      handlePlatformChange(key);
      closePicker();
      if (pickerRef.current) pickerRef.current.focus();
    },
    [handlePlatformChange, closePicker]
  );

  const focusOption = useCallback((index) => {
    const options = menuRef.current ? menuRef.current.querySelectorAll('[role="option"]') : [];
    if (!options.length) return;
    const next = options[Math.max(0, Math.min(index, options.length - 1))];
    if (next && next.focus) next.focus();
  }, []);

  const activeOptionIndex = useCallback(() => {
    const options = menuRef.current ? Array.from(menuRef.current.querySelectorAll('[role="option"]')) : [];
    return options.findIndex((option) => option.getAttribute("aria-selected") === "true");
  }, []);

  /** 弹层内键盘导航：↑↓ 环绕、Home/End 跳首尾、Tab 直接收起 */
  const handleMenuKeyDown = useCallback(
    (event) => {
      const options = menuRef.current
        ? Array.from(menuRef.current.querySelectorAll('[role="option"]'))
        : [];
      if (!options.length) return;

      const move = (index) => {
        const next = options[(index + options.length) % options.length];
        next.focus();
        // jsdom 里没有 scrollIntoView，先判断再调（测试环境不会因此炸掉）
        if (typeof next.scrollIntoView === "function") next.scrollIntoView({ block: "nearest" });
      };

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const currentIndex = options.indexOf(document.activeElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        move(currentIndex < 0 ? (step > 0 ? 0 : options.length - 1) : currentIndex + step);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        move(event.key === "Home" ? 0 : options.length - 1);
        return;
      }
      if (event.key === "Tab") closePicker();
    },
    [closePicker]
  );

  /** 触发按钮上按 ↑↓ 直接展开（Enter / 空格交给原生 click） */
  const handleTriggerKeyDown = useCallback(
    (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      openPicker();
    },
    [openPicker]
  );

  /* 打开时：定位 + 焦点落到当前选中项；关闭时不做多余的事 */
  useEffect(() => {
    if (!pickerOpen) return;
    placeMenu();
    const frame = requestAnimationFrame(() => focusOption(activeOptionIndex()));
    return () => cancelAnimationFrame(frame);
  }, [pickerOpen, placeMenu, focusOption, activeOptionIndex]);

  /* 打开期间的全局监听：定位跟随、点击外部 / Esc 关闭 */
  useEffect(() => {
    if (!pickerOpen) return undefined;

    // scroll 不冒泡，但捕获阶段能收到「任意内部滚动容器」的事件（capture: true）
    const handleReflow = () => placeMenu();
    const handleOutside = (event) => {
      const target = event.target;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (pickerRef.current && pickerRef.current.contains(target)) return;
      closePicker();
    };
    const handleKey = (event) => {
      if (event.key !== "Escape") return;
      closePicker();
      if (pickerRef.current) pickerRef.current.focus();
    };

    window.addEventListener("resize", handleReflow);
    window.addEventListener("scroll", handleReflow, true);
    document.addEventListener("mousedown", handleOutside, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("resize", handleReflow);
      window.removeEventListener("scroll", handleReflow, true);
      document.removeEventListener("mousedown", handleOutside, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pickerOpen, placeMenu, closePicker]);

  /* 面板收起 / 关闭时，弹层跟着收掉（否则会留一块浮在空中的列表） */
  useEffect(() => {
    if (collapsed || closed) closePicker();
  }, [collapsed, closed, closePicker]);

  if (CONFIG.enabled === false || !PLATFORMS.length) return null;

  const current = PLATFORMS.find((item) => item.key === platformKey);
  const tip = notice || CONFIG.tip || "展开歌单可切换平台与曲目";

  return (
    <div className={`music-player${closed ? " mp-is-closed" : ""}`}>
      {closed ? (
        <button
          type="button"
          className="mp-launcher"
          onClick={handleOpen}
          aria-label="打开音乐播放器"
          title="打开音乐播放器"
        >
          <AiOutlineCustomerService />
        </button>
      ) : null}

      {/* 关闭(✕) 只是把面板收成挂件图标：面板本体继续留在 DOM 里（CSS 视觉隐藏），
          APlayer 实例 / 当前曲目 / 播放进度都不会丢，重新展开即可继续用。 */}
      <section
        className={`mp-panel${collapsed ? " mp-is-collapsed" : ""}${closed ? " mp-is-hidden" : ""}${
          playing ? " mp-is-playing" : ""
        }`}
        aria-label="悬浮音乐播放器"
      >
        <header className="mp-head">
          <div className="mp-title">
            <AiOutlineCustomerService className="mp-title-icon" />
            <span className="mp-title-text">
              <strong>{CONFIG.title || "音乐播放器"}</strong>
              {CONFIG.subtitle ? <em>{CONFIG.subtitle}</em> : null}
            </span>
          </div>
          <div className="mp-actions">
            <button
              type="button"
              onClick={toggleVolume}
              aria-label="音量调节"
              aria-expanded={volumeOpen}
              title="音量"
              className={volumeOpen ? "is-active" : ""}
            >
              <Volume2 size={14} />
            </button>
            <button
              type="button"
              onClick={handleReload}
              disabled={loading}
              aria-label="重新加载榜单"
              title="重新加载榜单"
            >
              <AiOutlineReload className={loading ? "mp-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "展开播放器" : "折叠播放器"}
              title={collapsed ? "展开" : "折叠"}
            >
              {collapsed ? <AiOutlineUp /> : <AiOutlineDown />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="隐藏播放器"
              title="隐藏（音乐继续播放）"
            >
              <AiOutlineClose />
            </button>
          </div>
        </header>

        {/* data-lenis-prevent：滚轮落在这一块时别被全站 Lenis 接管，
            否则歌单内部的滚动会被页面滚动抢走（Lenis 会沿 composedPath 向上查找该属性） */}
        <div className="mp-body" data-lenis-prevent>
          {/* 折叠 / 展开的过渡层：grid-template-rows 1fr ↔ 0fr（见 style.css 里
              .mp-body / .mp-body-inner 的长注释）。多这一层是因为 grid 行高过渡
              需要一个「唯一的内容子元素」，而 .mp-body 直接挂着唱机 + 控制条 + 歌单。 */}
          <div className="mp-body-inner">
            {/* 平台 / 榜单：自绘下拉。触发按钮留在正常文档流里（不挤压下面的唱机与控制条，
                弹层是 fixed 浮层）；容器 z-index:5 仍然有效，用于兜住不支持 portal 的场景。 */}
            <div className="mp-picker">
              <span className="mp-picker-label">平台 / 榜单</span>
              <button
                type="button"
                ref={pickerRef}
                className={`mp-select-trigger${pickerOpen ? " is-open" : ""}`}
                onClick={togglePicker}
                onKeyDown={handleTriggerKeyDown}
                disabled={loading}
                aria-label="选择音乐平台与榜单"
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                aria-controls={pickerOpen ? MENU_ID : undefined}
              >
                <MusicBrandIcon platform={current} />
                <span className="mp-select-text">
                  <strong className="mp-select-name">{current ? current.name : "—"}</strong>
                  <em className="mp-select-group">{current ? current.group : ""}</em>
                </span>
                <AiOutlineDown className="mp-select-caret" aria-hidden="true" />
              </button>
            </div>

            <div className="mp-stage">
              {/* 静止高光层（玻璃反光 / 标签外圈 / 中心轴孔）：压在唱片上方，
                  用来体现出「唱片本体确实在转」，而不是整体一起转。 */}
              <div className="mp-vinyl-sheen" aria-hidden="true" />
              {/* 拟物唱针：与唱片共用 CSS 变量定位，播放时压下、暂停时平滑抬起 */}
              <div className="mp-stylus" aria-hidden="true">
                <span className="mp-stylus-pivot" />
                <span className="mp-stylus-arm">
                  <span className="mp-stylus-head" />
                </span>
              </div>
              <div className="mp-aplayer" ref={containerRef} />
              {loading ? (
                <div className="mp-mask">
                  <AiOutlineLoading3Quarters className="mp-spin" />
                  <span>正在解析「{current ? current.name : "榜单"}」…</span>
                </div>
              ) : null}
              {!loading && error ? (
                <div className="mp-mask mp-mask-error">
                  <AiOutlineExclamationCircle />
                  <span>{error}</span>
                  <button type="button" onClick={handleReload}>
                    重试
                  </button>
                </div>
              ) : null}
            </div>

            {/* 自绘控制条（APlayer 原生控制条已在 style.css 里整条隐藏）：
                进度条 → 按钮行 → 可展开的音量条。
                按钮行严格左右对称：[循环] [上一曲] 【播放/暂停·实心主按钮】 [下一曲] [播放列表] */}
            <div className="mp-controls" data-mp-controls>
              <div className="mp-progress">
                <span className="mp-time mp-time-now" data-mp-position>
                  {formatTime(position)}
                </span>
                <input
                  className="mp-range"
                  type="range"
                  min="0"
                  max={duration > 0 ? Math.floor(duration) : 0}
                  step="1"
                  value={duration > 0 ? Math.min(Math.floor(position), Math.floor(duration)) : 0}
                  onChange={handleSeek}
                  disabled={!(duration > 0)}
                  aria-label="播放进度"
                  title="播放进度"
                  {...seekDragHandlers}
                />
                <span className="mp-time" data-mp-duration>
                  {duration > 0 ? formatTime(duration) : "--:--"}
                </span>
              </div>

              <div className="mp-buttons">
                <button
                  type="button"
                  className="mp-btn"
                  onClick={handleCycleLoop}
                  aria-label={`循环模式：${LOOP_LABEL[loopMode]}`}
                  aria-pressed={loopMode !== "none"}
                  title={`循环模式：${LOOP_LABEL[loopMode]}`}
                  data-loop-mode={loopMode}
                >
                  <Repeat size={14} />
                  {loopMode === "one" ? (
                    <span className="mp-loop-badge" aria-hidden="true">
                      1
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="mp-btn"
                  onClick={handlePrev}
                  disabled={!count}
                  aria-label="上一曲"
                  title="上一曲"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  className="mp-btn mp-btn-main"
                  onClick={handleTogglePlay}
                  disabled={!count}
                  aria-label={playing ? "暂停" : "播放"}
                  title={playing ? "暂停" : "播放"}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  type="button"
                  className="mp-btn"
                  onClick={handleNext}
                  disabled={!count}
                  aria-label="下一曲"
                  title="下一曲"
                >
                  <SkipForward size={16} />
                </button>
                <button
                  type="button"
                  className="mp-btn"
                  onClick={handleToggleList}
                  aria-label="播放列表"
                  title="展开 / 收起播放列表"
                >
                  <ListMusic size={14} />
                </button>
              </div>

              {volumeOpen ? (
                <div className="mp-volume" data-mp-volume>
                  <Volume2 size={12} aria-hidden="true" />
                  <input
                    className="mp-range mp-range-volume"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(volume * 100)}
                    onChange={handleVolume}
                    aria-label="音量大小"
                    title="音量"
                  />
                </div>
              ) : null}
            </div>

            <div className="mp-foot">
              <span className="mp-count">{count ? `${count} 首` : "—"}</span>
              <span className="mp-tip" title={tip}>
                {tip}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 平台弹层：portal 到 body + position: fixed —— 面板的 backdrop-filter / overflow
          会把「面板内的弹层」裁掉甚至把 fixed 拉回面板内部，只有挂在 body 上才真的
          浮在唱机与控制条之上（z-index 见 style.css 的 .mp-menu）。 */}
      {createPortal(
        <AnimatePresence>
          {pickerOpen && menuBox ? (
            <motion.div
              id={MENU_ID}
              ref={menuRef}
              className={`mp-menu mp-menu--${menuBox.placement}`}
              role="listbox"
              aria-label="选择音乐平台与榜单"
              data-lenis-prevent
              style={{
                left: menuBox.left,
                top: menuBox.top,
                width: menuBox.width,
                maxHeight: menuBox.height,
              }}
              onKeyDown={handleMenuKeyDown}
              /* 弹出 / 收紧都由 framer-motion 逐帧驱动（CSS 里刻意没有任何 animation：
                 动画优先级高于行内样式，会和这里写的 transform 打架）。
                 方向跟着弹层的展开方向走：向下弹就从上方滑下来，向上弹则相反。 */
              initial={{ opacity: 0, scale: 0.96, y: menuBox.placement === "up" ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: menuBox.placement === "up" ? 4 : -4 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {groups.map((group) => (
                <div
                  className="mp-menu-group"
                  role="group"
                  aria-label={group.title}
                  key={group.title}
                >
                  {/* 分组标题只做视觉分隔：role="group" + aria-label 已经把它读出来了，
                      这里 aria-hidden 免得屏幕阅读器把同一个名字念两遍 */}
                  <p className="mp-menu-group-title" aria-hidden="true">
                    {group.title}
                  </p>
                  {group.items.map((item) => {
                    const active = item.key === platformKey;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`mp-menu-item${active ? " is-active" : ""}`}
                        data-platform={item.key}
                        onClick={() => selectPlatform(item.key)}
                      >
                        <MusicBrandIcon platform={item} />
                        <span className="mp-menu-name">{item.name}</span>
                        <span className="mp-menu-tag">{item.group}</span>
                        {active ? <Check size={13} className="mp-menu-check" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

export default MusicPlayer;
