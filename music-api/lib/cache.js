/**
 * ==========================================================================
 *  极简 TTL 内存缓存（单进程足够用）
 *  目的：上游歌单解析（尤其 Spotify 的逐曲匹配）比较贵，
 *        同一份榜单在 TTL 内直接复用，避免每次刷新都重新打上游。
 * ==========================================================================
 */

const store = new Map();
const MAX_ENTRIES = 800;

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expire) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlMs) {
  if (store.size >= MAX_ENTRIES) {
    // 简单的先进先出淘汰，够用且不引入依赖
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { value, expire: Date.now() + ttlMs });
}

/** 命中缓存直接返回，否则执行 producer 并写入缓存 */
export async function cacheWrap(key, ttlMs, producer) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;
  const value = await producer();
  if (value !== undefined && value !== null) cacheSet(key, value, ttlMs);
  return value;
}

export function cacheStats() {
  return { entries: store.size };
}
