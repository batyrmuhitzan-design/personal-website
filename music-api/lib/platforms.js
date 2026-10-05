/**
 * ==========================================================================
 *  榜单目录（后端默认值）
 * ==========================================================================
 *  前端 src/portfolio.config.js 里的 musicPlayer.platforms 是展示来源，
 *  请求时会带上 provider / id / mode；这里保留一份服务端目录，
 *  这样即使前端只传 platform=<key>（或旧版页面）也能照常工作。
 *
 *  mode:
 *    meting —— 走公共 Meting 聚合实例解析（网易云 / QQ 等原生支持）
 *    match  —— 先取榜单曲目信息，再逐曲匹配国内可播放音源（Spotify 用）
 *
 *  以下 id 均为 2026-10 实测可用（netease 歌单返回 audio/mpeg 完整音频）：
 *    3778678    网易云 热歌榜
 *    19723756   网易云 飙升榜
 *    3779629    网易云 新歌榜
 *    7051235710 QQ 音乐 热歌榜
 *    2629584905 抖音热歌精选（410 首）
 *    17887842370 2026 爆款抖音热歌（131 首）
 *    316192152  纯音乐图书馆 · 专注学习（561 首）
 *    7517623099 汽水音乐热歌榜（892 首）
 *    Spotify 37i9dQZEVXbMDoHDwVN2tF = Top 50 - Global
 * ==========================================================================
 */

export const PLATFORMS = {
  spotify: { key: "spotify", label: "Spotify · 全球 Top 50", provider: "spotify", id: "37i9dQZEVXbMDoHDwVN2tF", mode: "match" },
  "netease-hot": { key: "netease-hot", label: "网易云 · 热歌榜", provider: "netease", id: "3778678", mode: "meting" },
  "netease-rising": { key: "netease-rising", label: "网易云 · 飙升榜", provider: "netease", id: "19723756", mode: "meting" },
  "netease-new": { key: "netease-new", label: "网易云 · 新歌榜", provider: "netease", id: "3779629", mode: "meting" },
  "tencent-hot": { key: "tencent-hot", label: "QQ 音乐 · 热歌榜", provider: "tencent", id: "7051235710", mode: "meting" },
  "douyin-hot": { key: "douyin-hot", label: "抖音 · 爆款热歌", provider: "netease", id: "2629584905", mode: "meting" },
  "douyin-viral": { key: "douyin-viral", label: "抖音 · 爆红精选", provider: "netease", id: "17887842370", mode: "meting" },
  instrumental: { key: "instrumental", label: "纯音乐 · 专注学习", provider: "netease", id: "316192152", mode: "meting" },
  "soda-hot": { key: "soda-hot", label: "汽水音乐 · 热歌榜", provider: "netease", id: "7517623099", mode: "meting" },
};

export const SUPPORTED_METING_SERVERS = ["netease", "tencent", "kuwo", "kugou", "baidu", "migu"];

/** 校验前端传来的榜单参数，返回一份规范化后的配置 */
export function normalizePlatformRequest(query) {
  const key = String(query.platform || "").trim();
  const known = PLATFORMS[key];
  const provider = String(query.provider || known?.provider || "").trim().toLowerCase();
  const id = String(query.id || known?.id || "").trim();
  const mode = String(query.mode || known?.mode || "meting").trim();
  const label = String(query.label || known?.label || key || "自定义榜单").trim();

  if (!provider) throw Object.assign(new Error("缺少 provider（netease/tencent/spotify…）"), { status: 400 });
  if (!id) throw Object.assign(new Error("缺少歌单 id"), { status: 400 });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw Object.assign(new Error("歌单 id 格式不合法"), { status: 400 });
  if (!["meting", "match"].includes(mode)) throw Object.assign(new Error(`不支持的 mode: ${mode}`), { status: 400 });
  if (mode === "meting" && !SUPPORTED_METING_SERVERS.includes(provider)) {
    throw Object.assign(new Error(`Meting 不支持的音源平台: ${provider}`), { status: 400 });
  }
  if (mode === "match" && provider !== "spotify") {
    throw Object.assign(new Error(`mode=match 目前仅用于 spotify 榜单`), { status: 400 });
  }

  return { key: key || `${provider}-${id}`, label, provider, id, mode };
}

export function listPlatforms() {
  return Object.values(PLATFORMS);
}
