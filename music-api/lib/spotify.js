/**
 * ==========================================================================
 *  Spotify 歌单解析（服务端侧，无需官方 API / 无需登录）
 * ==========================================================================
 *  背景：Meting 生态没有 Spotify 音源（公共实例返回 {"error":"unknown playlist id"}），
 *        官方匿名 token 也已封禁（get_access_token → 403；api/token → 400 not permitted）。
 *
 *  做法：服务器抓取 Spotify 官方公开的 embed 页（https://open.spotify.com/embed/playlist/<id>），
 *        页面里带有服务端渲染的曲目数据（title / subtitle / uri=spotify:track:xxx）。
 *        取到歌名+艺人后，交给 match.js 到国内的网易云/酷我找可播放音频，
 *        于是「无梯子」也能听 Spotify 榜单。
 *
 *  注意：这是对公开页面的结构化数据提取，不是官方 API；Spotify 改版时可能需要调整解析。
 *        因此解析失败时会抛错并由上层回退（前端会提示 Spotify 频道暂时不可用）。
 * ==========================================================================
 */

import { DEFAULT_UA, fetchText, HttpError } from "./util.js";

const EMBED_ENDPOINT = "https://open.spotify.com/embed/playlist/";
const SPOTIFY_HEADERS = {
  "User-Agent": DEFAULT_UA,
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml",
};

/**
 * 取歌单曲目。返回 [{ spotifyId, name, artist }]
 * 只返回「歌名非空」的条目，保持页面里的原始顺序。
 */
export async function spotifyPlaylistTracks(playlistId, { limit = 100, timeout = 15000 } = {}) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(String(playlistId))) {
    throw new HttpError(400, `Spotify 歌单 id 不合法: ${playlistId}`);
  }
  const html = await fetchText(
    `${EMBED_ENDPOINT}${encodeURIComponent(playlistId)}`,
    { headers: SPOTIFY_HEADERS },
    timeout
  );
  const tracks = extractTracks(html).slice(0, limit);
  if (!tracks.length) {
    throw new HttpError(502, "Spotify 页面没有解析到曲目（可能被限流或页面结构变化）");
  }
  return tracks;
}

/** 优先解析页面内嵌 JSON；失败时退回「就近取值」的正则兜底 */
export function extractTracks(html) {
  const fromJson = extractFromEmbedJson(html);
  if (fromJson.length >= 3) return fromJson;
  return extractByProximity(html);
}

function extractFromEmbedJson(html) {
  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!match) return [];
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const tracks = [];
  const seen = new Set();
  // 用栈做「保序」深度优先遍历：子节点逆序入栈，弹出即为原始顺序
  const stack = [data];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i -= 1) stack.push(node[i]);
      continue;
    }
    const uri = typeof node.uri === "string" && node.uri.startsWith("spotify:track:") ? node.uri : "";
    if (uri && !seen.has(uri)) {
      const name = typeof node.title === "string" ? node.title.trim() : "";
      const artist = typeof node.subtitle === "string" ? node.subtitle.trim() : "";
      if (name) {
        seen.add(uri);
        tracks.push({ spotifyId: uri.slice("spotify:track:".length), name, artist });
      }
    }
    const values = Object.values(node);
    for (let i = values.length - 1; i >= 0; i -= 1) {
      const value = values[i];
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return tracks;
}

/** 兜底：每个 spotify:track:xxx 前后 800 字符内就近找 title / subtitle */
function extractByProximity(html) {
  const tracks = [];
  const seen = new Set();
  const pattern = /spotify:track:([A-Za-z0-9]{10,40})/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const id = match[1];
    if (seen.has(id)) continue;
    const from = Math.max(0, match.index - 800);
    const window = html.slice(from, Math.min(html.length, match.index + 800));
    const name = nearest(window, /"title":"((?:[^"\\]|\\.)*)"/g, match.index - from);
    const artist = nearest(window, /"subtitle":"((?:[^"\\]|\\.)*)"/g, match.index - from);
    if (!name) continue;
    seen.add(id);
    tracks.push({ spotifyId: id, name: unescapeJson(name), artist: unescapeJson(artist) });
  }
  return tracks;
}

function nearest(window, pattern, anchor) {
  let best = null;
  let bestDistance = Infinity;
  let match;
  const re = new RegExp(pattern.source, "g");
  while ((match = re.exec(window)) !== null) {
    const distance = Math.abs(match.index - anchor);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = match[1];
    }
  }
  return best;
}

function unescapeJson(value) {
  if (!value) return "";
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}
