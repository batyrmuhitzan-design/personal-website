import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import APlayer from "aplayer";
import "aplayer/dist/APlayer.min.css";
import {
  AiOutlineClose,
  AiOutlineCustomerService,
  AiOutlineDown,
  AiOutlineExclamationCircle,
  AiOutlineLoading3Quarters,
  AiOutlineReload,
  AiOutlineUp,
} from "react-icons/ai";
import profile from "../portfolio.config";

/**
 * ==========================================================================
 *  悬浮音乐播放器（暗黑风格 · 固定在页面左下角）
 * ==========================================================================
 *  数据链路：
 *    默认走自建解析服务（music-api/，同源 /music/api）——
 *      网易云 / QQ / 抖音 / 汽水：公共 Meting 实例聚合解析；
 *      Spotify：服务端解析公开歌单后匹配国内可播放音源，所以无梯子也能听。
 *    解析服务不可用时，自动退回「公共 Meting 实例直连」模式（不需要后端）。
 *
 *  组件生命周期：挂在 App.js 的 Routes 之外，路由切换不会卸载，
 *  因此 APlayer 实例与播放进度都能保持连续。
 * ==========================================================================
 */

const CONFIG = profile.musicPlayer || {};
const PLATFORMS = Array.isArray(CONFIG.platforms) ? CONFIG.platforms : [];
const API_BASE = (process.env.REACT_APP_MUSIC_API || CONFIG.apiBase || "/music/api").replace(/\/+$/, "");
const STORAGE_KEY = "shasha-music-player";
const THEME_COLOR = "#c770f0";
/** 同一首歌最多尝试几次（代理 → 重新解析），超过就交给 APlayer 自动跳过 */
const MAX_ATTEMPTS = 2;

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

  const containerRef = useRef(null);
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
        theme: THEME_COLOR,
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

  // 初始化 APlayer：只创建一次，保证路由切换时播放不中断
  useEffect(() => {
    if (CONFIG.enabled === false || !containerRef.current || playerRef.current) return undefined;
    const prefs = readPrefs();
    const player = new APlayer({
      container: containerRef.current,
      audio: [],
      theme: THEME_COLOR,
      lrcType: 3, // 3 = 异步拉取歌词地址（这里指向同源的 /music/api/lrc）
      autoplay: false,
      mutex: true,
      fixed: false,
      preload: "auto",
      listFolded: CONFIG.listFolded !== false,
      listMaxHeight: "208px",
      volume: typeof prefs.volume === "number" ? prefs.volume : CONFIG.volume || 0.65,
      storageName: `${STORAGE_KEY}-ap`,
    });
    playerRef.current = player;

    player.on("error", () => handlersRef.current.onError());
    player.on("listswitch", (info) => {
      const index = info && typeof info.index === "number" ? info.index : player.list.index;
      handlersRef.current.onSwitch(index);
    });
    player.on("volumechange", () => writePrefs({ volume: player.audio.volume }));

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  // 首次进入页面：预加载榜单但不自动播放（浏览器也会拦截无交互的自动播放）
  useEffect(() => {
    if (CONFIG.enabled === false || !platformKey) return;
    loadPlatform(platformKey, { autoplay: false });
    // 仅在挂载时预加载一次，之后由用户切换平台或点「重新加载」触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 展开面板后触发一次 resize，让 APlayer 重新计算进度条宽度
  useEffect(() => {
    if (closed || collapsed) return undefined;
    const timer = setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
    return () => clearTimeout(timer);
  }, [closed, collapsed]);

  const handlePlatformChange = useCallback(
    (event) => {
      const key = event.target.value;
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

  const handleReload = useCallback(() => {
    loadPlatform(platformKey, { autoplay: false });
  }, [loadPlatform, platformKey]);

  const handleClose = useCallback(() => {
    setClosed(true);
    writePrefs({ closed: true });
  }, []);

  const handleOpen = useCallback(() => {
    setClosed(false);
    writePrefs({ closed: false });
  }, []);

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
      ) : (
        <section
          className={`mp-panel${collapsed ? " mp-is-collapsed" : ""}`}
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

          <div className="mp-body">
            <label className="mp-picker">
              <span className="mp-picker-label">平台 / 榜单</span>
              <select
                value={platformKey}
                onChange={handlePlatformChange}
                disabled={loading}
                aria-label="选择音乐平台与榜单"
              >
                {groups.map((group) => (
                  <optgroup key={group.title} label={group.title}>
                    {group.items.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <div className="mp-stage">
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

            <div className="mp-foot">
              <span className="mp-count">{count ? `${count} 首` : "—"}</span>
              <span className="mp-tip" title={tip}>
                {tip}
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default MusicPlayer;
