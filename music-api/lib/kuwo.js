/**
 * ==========================================================================
 *  酷我音乐（免登录、可直出 MP3 直链）
 * ==========================================================================
 *  实测（2026-10）：
 *    搜索   http://search.kuwo.cn/r.s?all=<关键词>&ft=music&itemset=web_2013&client=kt&rformat=json
 *           —— 返回的是「单引号 JSON」（非标准 JSON），所以这里用正则逐字段提取
 *    解析   http://antiserver.kuwo.cn/anti.s?type=convert_url3&rid=MUSIC_<rid>&format=mp3&response=url
 *           —— 返回 {"code":200,"url":"https://kw-bj.kuwo.cn/....mp3"}，实测 4.1MB 完整音频
 *
 *  用途：Spotify 榜单里网易云只给试听（约 480KB）的欧美曲目，用酷我补齐完整版。
 * ==========================================================================
 */

import { DEFAULT_UA, fetchJson, fetchText, HttpError } from "./util.js";

const SEARCH_ENDPOINT = "http://search.kuwo.cn/r.s";
const CONVERT_ENDPOINT = "http://antiserver.kuwo.cn/anti.s";
const HEADERS = { "User-Agent": DEFAULT_UA };

/** 在单个结果片段里取字段值（兼容 'KEY':'value' 与 'KEY':value） */
function readField(chunk, key) {
  const pattern = new RegExp(`'${key}':\\s*'?([^',}]*)'?`);
  const match = pattern.exec(chunk);
  return match ? match[1].replace(/&nbsp;/g, " ").trim() : "";
}

/**
 * 关键词搜索，返回 [{ rid, name, artist, album, duration }]
 * 酷我搜索结果是单引号 JSON，所以先定位每首歌的 MUSICRID 位置，
 * 再以相邻两条记录为边界切片，避免写一个脆弱的 JSON 解析器。
 */
export async function kuwoSearch(keyword, limit = 6, timeout = 12000) {
  const url =
    `${SEARCH_ENDPOINT}?all=${encodeURIComponent(keyword)}` +
    `&ft=music&itemset=web_2013&client=kt&pn=0&rn=${limit}&rformat=json&encoding=utf8`;
  const text = await fetchText(url, { headers: HEADERS }, timeout);
  return parseSearchPayload(text, limit);
}

/**
 * 解析酷我搜索返回的单引号 JSON 文本（抽成纯函数，便于自检脚本覆盖）。
 * 先定位每首歌的 MUSICRID，再以相邻两条记录为边界切片取字段。
 */
export function parseSearchPayload(text, limit = 6) {
  const positions = [];
  const ridPattern = /'MUSICRID':'(MUSIC_\d+)'/g;
  let match;
  while ((match = ridPattern.exec(text)) !== null) {
    positions.push({ rid: match[1], index: match.index });
  }

  return positions.slice(0, limit).map((position, index) => {
    const next = positions[index + 1];
    const end = next ? next.index : Math.min(text.length, position.index + 2000);
    const chunk = text.slice(position.index, end);
    return {
      rid: position.rid,
      name: readField(chunk, "SONGNAME"),
      artist: readField(chunk, "ARTIST"),
      album: readField(chunk, "ALBUM"),
      duration: Number(readField(chunk, "DURATION")) || 0,
    };
  });
}

/** rid -> 可播放的 https MP3 直链（酷我 CDN 带时效签名，所以按需实时解析） */
export async function kuwoResolve(rid, timeout = 12000) {
  if (!/^MUSIC_\d+$/.test(String(rid))) throw new HttpError(400, `酷我 rid 不合法: ${rid}`);
  const url = `${CONVERT_ENDPOINT}?type=convert_url3&rid=${encodeURIComponent(rid)}&format=mp3&response=url`;
  const data = await fetchJson(url, { headers: HEADERS }, timeout);
  const audio = typeof data?.url === "string" ? data.url : "";
  if (!audio.startsWith("http")) throw new HttpError(502, `酷我未返回可播放地址（rid=${rid}）`);
  return audio;
}
