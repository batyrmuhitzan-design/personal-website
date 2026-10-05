/**
 * ==========================================================================
 *  网易云明文接口（兜底）
 * ==========================================================================
 *  实测（2026-10）这两个接口不需要签名、直接返回明文 JSON：
 *    /api/playlist/detail?id=<id>          歌单详情（含完整曲目）
 *    /api/search/get?s=<kw>&type=1000      歌单检索（配置期用来找歌单 id）
 *  注意 /api/search/get/web 返回的是加密串，不可用。
 *
 *  用途：当所有公共 Meting 实例都挂掉时，仍能拿到榜单曲目信息，
 *        音频部分再交给 match.js 走酷我兜底。
 * ==========================================================================
 */

import { DEFAULT_UA, fetchJson } from "./util.js";

const HEADERS = { "User-Agent": DEFAULT_UA, Referer: "https://music.163.com/" };

/** 歌单曲目（不含音频地址，仅元数据） */
export async function neteasePlaylistTracks(id, { timeout = 15000 } = {}) {
  const data = await fetchJson(
    `https://music.163.com/api/playlist/detail?id=${encodeURIComponent(id)}`,
    { headers: HEADERS },
    timeout
  );
  const tracks = data?.result?.tracks || data?.playlist?.tracks || [];
  return tracks
    .map((track) => ({
      name: typeof track.name === "string" ? track.name.trim() : "",
      artist: (track.ar || track.artists || []).map((item) => item.name).filter(Boolean).join("/"),
      sid: String(track.id || ""),
      picUrl: track.al?.picUrl || track.album?.picUrl || "",
      duration: Math.round((track.dt || track.duration || 0) / 1000),
    }))
    .filter((track) => track.sid && track.name);
}

/** 歌单检索：只为「配置期人工找 id」准备，不参与线上播放请求 */
export async function neteaseSearchPlaylists(keyword, limit = 5, { timeout = 15000 } = {}) {
  const data = await fetchJson(
    `https://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=1000&limit=${limit}`,
    { headers: HEADERS },
    timeout
  );
  return (data?.result?.playlists || []).map((item) => ({
    id: String(item.id),
    name: item.name,
    trackCount: item.trackCount,
    creator: item.creator?.nickname || "",
  }));
}
