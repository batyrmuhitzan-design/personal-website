/**
 * ==========================================================================
 *  解析编排：把「榜单请求」变成 APlayer 能直接用的歌曲数组
 * ==========================================================================
 *  两条主链路：
 *    mode=meting —— 公共 Meting 实例聚合（网易云 / QQ 榜单，实测可直出完整音频）
 *                   实例全挂时，netease 榜单会退回「网易云明文接口取曲目 + 跨源匹配」
 *    mode=match  —— 先取榜单曲目信息，再逐曲匹配国内可播放音源（Spotify 榜单）
 *
 *  输出统一为前端播放器的 DTO：
 *    { id, name, artist, url, rawUrl, pic, lrc, origin, preview, bytes }
 * ==========================================================================
 */

import { cacheGet, cacheSet } from "./cache.js";
import { DEFAULT_METING_INSTANCES, metingAudioUrl, metingLrcUrl, metingPlaylist } from "./meting.js";
import { matchPlayable, matchPlaylist } from "./match.js";
import { neteasePlaylistTracks } from "./netease.js";
import { listPlatforms, normalizePlatformRequest } from "./platforms.js";
import { kuwoResolve } from "./kuwo.js";
import { httpsify } from "./proxy.js";
import { HttpError, probeAudioSize, sleep } from "./util.js";
import { spotifyPlaylistTracks } from "./spotify.js";

/** 歌单缓存：30 分钟（音源直链有时效，不宜缓存太久） */
const PLAYLIST_TTL = Number(process.env.PLAYLIST_TTL_MS || 30 * 60 * 1000);
/** 单曲重解析缓存：6 小时 */
const SONG_TTL = Number(process.env.SONG_TTL_MS || 6 * 60 * 60 * 1000);
/** 前端访问 /music/api 时用的前缀（拼代理地址用） */
const API_PREFIX = process.env.API_PREFIX || "/music/api";

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toClientSong(song, proxy) {
  const audio = httpsify(song.audioUrl || "");
  return {
    id: song.sid || song.spotifyId || "",
    name: song.name || "",
    artist: song.artist || "",
    url: proxy && audio ? `${API_PREFIX}/stream?u=${encodeURIComponent(audio)}` : audio,
    rawUrl: audio,
    pic: httpsify(song.picUrl || ""),
    lrc: song.lrcUrl ? `${API_PREFIX}/lrc?u=${encodeURIComponent(httpsify(song.lrcUrl))}` : "",
    origin: song.origin || song.matchedBy || "",
    preview: Boolean(song.preview),
    bytes: song.bytes || 0,
  };
}

async function isPlayable(url, minBytes = 10000) {
  const bytes = await probeAudioSize(url, 8000);
  return bytes === 0 || bytes >= minBytes;
}

/** meting 通道：直接拿歌单曲目 */
async function buildChannel(platform, limit, log) {
  try {
    const { songs, instance } = await metingPlaylist(platform.provider, platform.id, { limit });
    return { songs, via: `meting:${new URL(instance).hostname}`, mode: "channel" };
  } catch (err) {
    log(`Meting 不可用（${err.message}），尝试兜底`);
    if (platform.provider !== "netease") throw err;
    const tracks = await neteasePlaylistTracks(platform.id);
    if (!tracks.length) throw new HttpError(502, "榜单曲目获取失败");
    const songs = await matchPlaylist(tracks, { limit, log });
    if (!songs.length) throw new HttpError(502, "榜单曲目未能匹配到可播放音源");
    return { songs, via: "netease-plain+match", mode: "match" };
  }
}

/** match 通道：Spotify 榜单 → 国内音源 */
async function buildMatched(platform, limit, log) {
  const tracks = await spotifyPlaylistTracks(platform.id, { limit: Math.max(limit * 2, 30) });
  log(`Spotify 取到 ${tracks.length} 首曲目，开始跨源匹配`);
  const songs = await matchPlaylist(tracks, { limit, log });
  if (!songs.length) throw new HttpError(502, "Spotify 曲目未能匹配到可播放音源");
  return { songs, via: "spotify-embed+match", mode: "match" };
}

/**
 * 榜单主入口：query 支持
 *   platform / provider / id / mode / label / limit / proxy
 */
export async function buildPlaylist(query, { log = () => {} } = {}) {
  const platform = normalizePlatformRequest(query);
  const limit = clampInt(query.limit, 1, 50, 20);
  const proxy = query.proxy !== "0";
  const cacheKey = `pl:${platform.provider}:${platform.id}:${platform.mode}:${limit}:${proxy ? 1 : 0}`;

  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };

  const started = Date.now();
  const internal =
    platform.mode === "match"
      ? await buildMatched(platform, limit, log)
      : await buildChannel(platform, limit, log);
  const songs = internal.songs.map((song) => toClientSong(song, proxy));

  const payload = {
    ok: true,
    platform: platform.key,
    label: platform.label,
    provider: platform.provider,
    playlistId: platform.id,
    mode: internal.mode,
    via: internal.via,
    proxy,
    count: songs.length,
    preview: songs.some((song) => song.preview),
    tookMs: Date.now() - started,
    songs,
  };

  cacheSet(cacheKey, payload, PLAYLIST_TTL);
  return payload;
}

/**
 * 单曲重解析：播放失败（直链过期 / 版权变动）时前端会调这里换一个新地址。
 * origin: netease | tencent | kuwo | kugou（其他值则直接走跨源匹配）
 */
export async function resolveOne(query, { log = () => {} } = {}) {
  const provider = String(query.origin || "").toLowerCase();
  const sid = String(query.sid || "").trim();
  const name = String(query.name || "").trim();
  const artist = String(query.artist || "").trim();
  const proxy = query.proxy !== "0";
  const cacheKey = `song:${provider}:${sid}:${name}:${artist}:${proxy ? 1 : 0}`;

  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };

  let song = null;

  if (sid && ["netease", "tencent", "kuwo", "kugou"].includes(provider)) {
    if (provider === "kuwo") {
      try {
        song = {
          name,
          artist,
          sid,
          origin: "kuwo",
          audioUrl: await kuwoResolve(sid),
          matchedBy: "kuwo",
        };
      } catch (err) {
        log(`酷我重解析失败(${err.message})`);
      }
    } else {
      for (const base of DEFAULT_METING_INSTANCES) {
        const audioUrl = metingAudioUrl(base, provider, sid);
        if (await isPlayable(audioUrl)) {
          song = {
            name,
            artist,
            sid,
            origin: provider,
            audioUrl,
            lrcUrl: metingLrcUrl(base, provider, sid),
            matchedBy: provider,
          };
          break;
        }
      }
    }
  }

  if (!song && name) {
    log(`按歌名跨源匹配：${name} ${artist}`);
    song = await matchPlayable({ name, artist }, { log });
  }

  if (!song) throw new HttpError(404, "该曲目暂时找不到可播放音源");

  const payload = { ok: true, song: toClientSong(song, proxy) };
  cacheSet(cacheKey, payload, SONG_TTL);
  return payload;
}

export function healthInfo() {
  return {
    ok: true,
    service: "shasha-music-api",
    version: "1.0.0",
    uptimeSec: Math.round(process.uptime()),
    platforms: Object.keys(listPlatforms()).length,
    node: process.version,
    now: new Date().toISOString(),
  };
}

export { listPlatforms, sleep };
