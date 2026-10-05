/**
 * ==========================================================================
 *  Meting 聚合客户端
 * ==========================================================================
 *  公共 Meting 实例能力（2026-10 实测）：
 *    api.injahow.cn   : playlist / url / pic / lrc 可用，search 不支持
 *    api.qijieya.cn   : playlist / url / pic / lrc / search 全部可用
 *    meting.icodeq.com: playlist / url / search 可用（返回字段是 title/author）
 *
 *  所以这里统一做两件事：
 *    1) 多实例降级，任何一个挂了自动切下一个；
 *    2) 字段方言归一化（name|title、artist|author|singer）；
 *    3) 播放/封面/歌词地址统一按「优选实例」重新拼装，
 *       避免把带 auth 的临时地址透传给前端（实例换域名也不影响）。
 * ==========================================================================
 */

import { DEFAULT_UA, extractQueryId, fetchJson } from "./util.js";

export const DEFAULT_METING_INSTANCES = [
  "https://api.injahow.cn/meting/",
  "https://api.qijieya.cn/meting/",
  "https://meting.icodeq.com/api",
];

/** search 只有部分实例支持，优先能用的（实测） */
export const SEARCH_METING_INSTANCES = [
  "https://api.qijieya.cn/meting/",
  "https://meting.icodeq.com/api",
  "https://api.injahow.cn/meting/",
];

function buildUrl(base, server, type, id) {
  const url = new URL(base);
  url.searchParams.set("server", server);
  url.searchParams.set("type", type);
  url.searchParams.set("id", id);
  return url.toString();
}

export const metingAudioUrl = (base, server, sid) => buildUrl(base, server, "url", sid);
export const metingPicUrl = (base, server, picId) => buildUrl(base, server, "pic", picId);
export const metingLrcUrl = (base, server, sid) => buildUrl(base, server, "lrc", sid);

function pickString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** 把不同实例的字段方言统一成内部结构 */
function normalizeItem(item, base, server) {
  const name = pickString(item, ["name", "title"]);
  if (!name) return null;
  const artist = pickString(item, ["artist", "author", "singer"]);
  const audioField = pickString(item, ["url"]);
  const picField = pickString(item, ["pic", "cover"]);
  const lrcField = pickString(item, ["lrc", "lyric"]);
  const sid =
    pickString(item, ["id"]) ||
    extractQueryId(audioField) ||
    extractQueryId(lrcField) ||
    extractQueryId(picField);
  if (!sid) return null;
  const picId = extractQueryId(picField) || sid;
  return {
    name,
    artist,
    sid,
    origin: server,
    audioUrl: metingAudioUrl(base, server, sid),
    picUrl: metingPicUrl(base, server, picId),
    lrcUrl: metingLrcUrl(base, server, sid),
    instance: base,
  };
}

/** 按顺序尝试各实例，返回第一个成功的数组结果 */
export async function metingRequest(server, type, id, { instances = DEFAULT_METING_INSTANCES, timeout = 15000 } = {}) {
  const failures = [];
  for (const base of instances) {
    try {
      const data = await fetchJson(
        buildUrl(base, server, type, id),
        { headers: { "User-Agent": DEFAULT_UA } },
        timeout
      );
      if (Array.isArray(data)) return { data, instance: base };
      if (data && typeof data === "object" && data.error) throw new Error(String(data.error));
      throw new Error("返回结构异常");
    } catch (err) {
      failures.push(`${base} → ${err.message}`);
    }
  }
  throw Object.assign(new Error(`所有 Meting 实例均不可用：${failures.join("；")}`), { status: 502 });
}

/** 取歌单：返回归一化后的曲目列表（audio/pic/lrc 均已按可用实例拼好） */
export async function metingPlaylist(server, id, options = {}) {
  const { limit = 50, instances, timeout } = options;
  const { data, instance } = await metingRequest(server, "playlist", id, { instances, timeout });
  const songs = data
    .map((item) => normalizeItem(item, instance, server))
    .filter((song) => song && song.name && song.sid);
  if (!songs.length) {
    throw Object.assign(new Error("该歌单没有解析到可播放曲目"), { status: 502 });
  }
  return { songs: songs.slice(0, limit), instance };
}

/** 搜索单曲：用于 Spotify 曲目跨源匹配 */
export async function metingSearch(server, keyword, options = {}) {
  const { limit = 8, instances = SEARCH_METING_INSTANCES, timeout = 12000 } = options;
  const { data, instance } = await metingRequest(server, "search", keyword, { instances, timeout });
  return {
    items: data
      .map((item) => normalizeItem(item, instance, server))
      .filter((song) => song && song.name && song.sid)
      .slice(0, limit),
    instance,
  };
}
