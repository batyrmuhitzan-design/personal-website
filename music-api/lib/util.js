/**
 * ==========================================================================
 *  通用工具：上游请求、文本归一化、匹配打分、音频体积探测
 * ==========================================================================
 */

export const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 小于该体积的音频视为「试听片段」而非完整歌曲 */
export const MIN_FULL_BYTES = 1200000;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带超时的 fetch。Node 18+ 自带 fetch，这里用 AbortController 控制超时，
 * 避免某个上游卡死拖垮整次歌单解析。
 */
export async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, options = {}, timeout = 12000) {
  const res = await fetchWithTimeout(url, options, timeout);
  if (!res.ok) throw new HttpError(502, `上游返回 ${res.status}: ${url}`);
  return res.text();
}

export async function fetchJson(url, options = {}, timeout = 12000) {
  const text = await fetchText(url, options, timeout);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, `上游返回的不是合法 JSON: ${url}`);
  }
}

/** 从形如 `...?type=url&id=123` 的地址里取出 id（Meting 各实例都是这个格式） */
export function extractQueryId(url = "") {
  const match = /[?&]id=([^&"'#]+)/.exec(String(url));
  return match ? decodeURIComponent(match[1]) : "";
}

/** 归一化歌名/艺人：去掉 feat、括号补充说明、标点与大小写差异后便于跨平台比对 */
export function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/&nbsp;/g, " ")
    .replace(/\((?:feat|ft|with|live|remaster(?:ed)?|version)[^)]*\)/gi, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s*[-–—]\s*(?:live|remaster(?:ed)?|version|radio edit)\s*$/i, " ")
    .replace(/[^0-9a-z\u4e00-\u9fa5]+/g, "")
    .trim();
}

/** 0~1 的相似度：完全一致 1，互相包含 0.82，其余按字符重合度折算 */
export function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.82;
  const chars = new Set(x);
  let hit = 0;
  chars.forEach((char) => {
    if (y.includes(char)) hit += 1;
  });
  return (hit / chars.size) * 0.7;
}

/**
 * 候选打分：歌名权重最高，其次是艺人，时长只作为「像不像一首完整歌」的参考。
 */
export function scoreCandidate(query, candidate) {
  const nameScore = similarity(query.name, candidate.name);
  const artistScore = query.artist
    ? Math.max(similarity(query.artist, candidate.artist), containedRatio(query.artist, candidate.artist))
    : 0.6;
  let score = nameScore * 0.68 + artistScore * 0.32;
  if (candidate.duration && (candidate.duration < 45 || candidate.duration > 900)) score -= 0.12;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

/** 艺人字段常是「A/B/C」，用交集比例而不是整串相似度 */
function containedRatio(a, b) {
  const left = String(a)
    .split(/[/,、&]+/)
    .map((s) => normalize(s))
    .filter(Boolean);
  const right = String(b).toLowerCase();
  if (!left.length) return 0;
  const hit = left.filter((token) => right.includes(token)).length;
  return hit / left.length;
}

/**
 * 探测远端音频体积。只取头 2 个字节，读 content-range / content-length，
 * 用来判断上游给的是「完整歌曲」还是「试听片段」。
 */
export async function probeAudioSize(url, timeout = 10000) {
  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { Range: "bytes=0-1", "User-Agent": DEFAULT_UA }, redirect: "follow" },
      timeout
    );
    const range = res.headers.get("content-range");
    if (range) {
      const total = Number(String(range).split("/")[1]);
      if (Number.isFinite(total) && total > 0) return total;
    }
    const length = Number(res.headers.get("content-length"));
    return Number.isFinite(length) && length > 0 ? length : 0;
  } catch {
    return 0;
  }
}

/** 受限并发地跑一批任务，避免一次性打爆上游 */
export async function mapLimit(items, limit, worker) {
  const list = Array.from(items);
  const results = new Array(list.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
