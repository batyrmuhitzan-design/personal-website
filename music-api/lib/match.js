/**
 * ==========================================================================
 *  跨源匹配：把「歌名 + 艺人」在国内音源里换成真正能播的音频地址
 * ==========================================================================
 *  Spotify 榜单是英文曲目为主，实测网易云对这类曲目大多只给试听（约 480KB），
 *  因此这里的策略是：
 *    1) 网易云搜索 —— 顺带拿到封面与歌词（同一首歌的封面/歌词可用）；
 *    2) 酷我搜索   —— 欧美曲目完整度高，实测可拿到 4MB 级别完整音频；
 *    3) 逐曲做 Range 探测（只取两个字节读 content-range），
 *       体积达到 MIN_FULL_BYTES 才算「完整歌曲」，否则记为试听兜底继续找下一个候选。
 * ==========================================================================
 */

import { kuwoResolve, kuwoSearch } from "./kuwo.js";
import { metingSearch } from "./meting.js";
import { MIN_FULL_BYTES, mapLimit, probeAudioSize, scoreCandidate, sleep } from "./util.js";

/** 低于这个相似度就直接丢弃，避免匹配到完全不相关的歌 */
const MIN_ACCEPT_SCORE = 0.6;
/** 单个候选源最多看几条 */
const CANDIDATES_PER_SOURCE = 6;
/** 最多实际解析几条候选（每条都要探测体积） */
const MAX_RESOLVE_ATTEMPTS = 4;

/** 匹配单曲；返回 null 表示没有找到可接受的结果 */
export async function matchPlayable(query, options = {}) {
  const { minBytes = MIN_FULL_BYTES, timeout = 12000, log = () => {} } = options;
  const keyword = [query.name, query.artist].filter(Boolean).join(" ").trim();
  if (!keyword) return null;

  const candidates = [];

  try {
    const { items } = await metingSearch("netease", keyword, { limit: CANDIDATES_PER_SOURCE, timeout });
    items.forEach((item) => {
      candidates.push({ ...item, source: "netease", score: scoreCandidate(query, item) });
    });
  } catch (err) {
    log(`网易云搜索失败(${err.message})`);
  }

  try {
    const hits = await kuwoSearch(keyword, CANDIDATES_PER_SOURCE, timeout);
    hits.forEach((hit) => {
      candidates.push({
        name: hit.name,
        artist: hit.artist,
        sid: hit.rid,
        duration: hit.duration,
        source: "kuwo",
        score: scoreCandidate(query, hit),
      });
    });
  } catch (err) {
    log(`酷我搜索失败(${err.message})`);
  }

  const ranked = candidates
    .filter((item) => item.score >= MIN_ACCEPT_SCORE)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;

  // 同曲目的网易云封面 / 歌词可以复用
  const artwork = ranked.find((item) => item.source === "netease" && item.picUrl) || null;
  let previewFallback = null;

  for (const candidate of ranked.slice(0, MAX_RESOLVE_ATTEMPTS)) {
    try {
      const audioUrl =
        candidate.source === "kuwo" ? await kuwoResolve(candidate.sid, timeout) : candidate.audioUrl;
      if (!audioUrl) continue;

      const bytes = await probeAudioSize(audioUrl, timeout);
      const uncertain = bytes === 0;
      const full = uncertain || bytes >= minBytes;

      const song = {
        name: candidate.name || query.name,
        artist: candidate.artist || query.artist,
        sid: candidate.sid,
        origin: candidate.source,
        audioUrl,
        picUrl: candidate.picUrl || artwork?.picUrl || "",
        lrcUrl: candidate.lrcUrl || artwork?.lrcUrl || "",
        preview: !full,
        bytes,
        score: candidate.score,
        matchedBy: candidate.source,
      };

      if (full) return song;
      if (!previewFallback || song.bytes > previewFallback.bytes) previewFallback = song;
    } catch (err) {
      log(`解析候选失败(${candidate.source}/${candidate.sid}): ${err.message}`);
    }
  }

  // 全部只是试听片段时，至少把质量最好的那首留下来（前端会提示「试听」）
  return previewFallback;
}

/**
 * 批量匹配：并发受控 + 全局时间预算，超时就直接返回已经拿到的部分，
 * 保证首屏不会因为个别曲目卡住而一直转圈。
 */
export async function matchPlaylist(tracks, options = {}) {
  const { limit = 20, concurrency = 4, budget = 25000, timeout = 12000, log = () => {} } = options;
  const input = tracks.slice(0, limit);
  const results = new Array(input.length).fill(null);

  const tasks = input.map((track, index) => async () => {
    try {
      const song = await matchPlayable(track, { timeout, log });
      if (song) results[index] = { ...song, spotifyId: track.spotifyId || "" };
    } catch (err) {
      log(`匹配失败 ${track.name}: ${err.message}`);
    }
  });

  await Promise.race([mapLimit(tasks, concurrency, (task) => task()), sleep(budget)]);
  return results.filter(Boolean);
}
