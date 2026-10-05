/**
 * ==========================================================================
 *  解析服务自检脚本（零依赖、不联网）
 *      用法：npm run check    （等价于 node scripts/check.mjs）
 * ==========================================================================
 *  覆盖本次二改新增的纯逻辑：Spotify 页面解析、酷我字段解析、
 *  榜单参数校验、音源地址拼装、代理白名单。
 *  需要真实网络的端到端验证见 README 里的 curl 清单。
 * ==========================================================================
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSearchPayload } from "../lib/kuwo.js";
import { metingAudioUrl, metingLrcUrl, metingPicUrl } from "../lib/meting.js";
import { PLATFORMS, normalizePlatformRequest } from "../lib/platforms.js";
import { assertAllowed, httpsify } from "../lib/proxy.js";
import { extractTracks } from "../lib/spotify.js";
import { extractQueryId, normalize, scoreCandidate, similarity } from "../lib/util.js";

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(`  ✓ ${name}`);
  } catch (err) {
    results.push(`  ✗ ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

/* ------------------------- Spotify embed 解析 ------------------------- */
const embedHtml = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      state: {
        data: {
          entity: {
            name: "Top 50 - Global",
            trackList: [
              { uri: "spotify:track:3h5T5JypYU7huFiVYhv1dr", title: "Patient Zero", subtitle: "Artist A" },
              { uri: "spotify:track:11hcBLPtbMp4aQI6zGQLub", title: "Earrings", subtitle: "Artist B, Artist C" },
              { uri: "spotify:track:70cHKK8bHAfJrOGVnfRG9J", title: "The Cure", subtitle: "Artist D" },
            ],
          },
        },
      },
    },
  },
})}</script></body></html>`;

check("Spotify：从 __NEXT_DATA__ 解析出曲目", () => {
  const tracks = extractTracks(embedHtml);
  assert.equal(tracks.length, 3);
  assert.deepEqual(tracks[0], {
    spotifyId: "3h5T5JypYU7huFiVYhv1dr",
    name: "Patient Zero",
    artist: "Artist A",
  });
  assert.equal(tracks[1].artist, "Artist B, Artist C");
});

check("Spotify：页面结构变化时走就近正则兜底", () => {
  const html =
    `<div>"title":"Earrings","subtitle":"Artist B"</div>spotify:track:11hcBLPtbMp4aQI6zGQLub` +
    `<span>"title":"The Cure","subtitle":"Artist D"</span>spotify:track:70cHKK8bHAfJrOGVnfRG9J`;
  const tracks = extractTracks(html);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].spotifyId, "11hcBLPtbMp4aQI6zGQLub");
  assert.equal(tracks[1].name, "The Cure");
});

/* ------------------------- 酷我字段解析 ------------------------- */
check("酷我：解析单引号 JSON 搜索结果", () => {
  const payload =
    "{'HIT':'9','abslist':[{'MUSICRID':'MUSIC_13275309','SONGNAME':'Patient&nbsp;Zero','ARTIST':'Tab','DURATION':'82','ALBUM':'A'}," +
    "{'MUSICRID':'MUSIC_261281122','SONGNAME':'Patient Zero','ARTIST':'Somebody','DURATION':'215','ALBUM':'B'}],'TOTAL':'9'}";
  const hits = parseSearchPayload(payload, 6);
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], {
    rid: "MUSIC_13275309",
    name: "Patient Zero",
    artist: "Tab",
    album: "A",
    duration: 82,
  });
  assert.equal(hits[1].duration, 215);
});

/* ------------------------- 榜单参数校验 ------------------------- */
check("榜单：已知 key 可自动补全 provider/id/mode", () => {
  const platform = normalizePlatformRequest({ platform: "spotify" });
  assert.equal(platform.provider, "spotify");
  assert.equal(platform.id, PLATFORMS.spotify.id);
  assert.equal(platform.mode, "match");
});

check("榜单：自定义 provider/id 通过，非法参数被拒绝", () => {
  const custom = normalizePlatformRequest({ provider: "netease", id: "3778678", mode: "meting", label: "自定义" });
  assert.equal(custom.provider, "netease");
  assert.equal(custom.label, "自定义");
  assert.throws(() => normalizePlatformRequest({ provider: "netease" }), /缺少歌单 id/);
  assert.throws(() => normalizePlatformRequest({ provider: "netease", id: "3778678", mode: "bogus" }), /不支持的 mode/);
  assert.throws(() => normalizePlatformRequest({ provider: "spotify", id: "abc123", mode: "meting" }), /Meting 不支持/);
  assert.throws(() => normalizePlatformRequest({ provider: "netease", id: "1;rm -rf", mode: "meting" }), /格式不合法/);
});

/* ------------------------- 地址拼装与工具函数 ------------------------- */
check("Meting：播放 / 封面 / 歌词地址拼装正确", () => {
  const base = "https://api.qijieya.cn/meting/";
  assert.equal(
    metingAudioUrl(base, "netease", "123"),
    "https://api.qijieya.cn/meting/?server=netease&type=url&id=123"
  );
  assert.ok(metingPicUrl(base, "tencent", "abc").includes("type=pic&id=abc"));
  assert.ok(metingLrcUrl(base, "netease", "123").includes("type=lrc&id=123"));
  assert.equal(extractQueryId("https://a.com/meting/?server=netease&type=url&id=1973665667"), "1973665667");
  assert.equal(extractQueryId("no-id-here"), "");
});

check("匹配：归一化 / 相似度 / 打分符合预期", () => {
  assert.equal(normalize("BIRDS OF A FEATHER (feat. X)"), "birdsofafeather");
  assert.equal(similarity("Patient Zero", "patient zero"), 1);
  const exact = scoreCandidate({ name: "Earrings", artist: "Malcolm Todd" }, { name: "Earrings", artist: "Malcolm Todd" });
  const wrong = scoreCandidate({ name: "Earrings", artist: "Malcolm Todd" }, { name: "Sunflower", artist: "Post Malone" });
  assert.ok(exact > 0.9, `命中曲目分数偏低: ${exact}`);
  assert.ok(wrong < 0.6, `不相关曲目分数偏高: ${wrong}`);
});

check("代理：http 升级为 https，非白名单域名被拦截", () => {
  assert.equal(httpsify("http://p1.music.126.net/a.jpg"), "https://p1.music.126.net/a.jpg");
  assert.doesNotThrow(() => assertAllowed("https://kw-bj.kuwo.cn/a.mp3"));
  assert.doesNotThrow(() => assertAllowed("https://api.injahow.cn/meting/?server=netease&type=url&id=1"));
  assert.throws(() => assertAllowed("https://example.com/evil.mp3"), /白名单/);
  assert.throws(() => assertAllowed("file:///etc/passwd"), /不支持的协议/);
});

/* ------------------------- 目录与服务入口 ------------------------- */
check("目录：内置榜单 id 形态合法", () => {
  const keys = Object.keys(PLATFORMS);
  assert.ok(keys.length >= 5, "榜单数量过少");
  Object.values(PLATFORMS).forEach((platform) => {
    assert.match(platform.id, /^[A-Za-z0-9_-]{1,64}$/, `${platform.key} 的 id 不合法`);
    assert.ok(platform.label.length > 0, `${platform.key} 缺少 label`);
  });
});

check("酷我：使用强制 IPv4 的 HTTP 客户端（容器无 IPv6 出口时不至于超时）", () => {
  const httpSource = readFileSync(new URL("../lib/http.js", import.meta.url), "utf8");
  const kuwoSource = readFileSync(new URL("../lib/kuwo.js", import.meta.url), "utf8");
  assert.ok(httpSource.includes("family: 4"), "http.js 应强制 family: 4");
  assert.ok(kuwoSource.includes('from "./http.js"'), "kuwo.js 应使用内置 HTTP 客户端");
  assert.ok(!/fetchText|fetchJson/.test(kuwoSource), "kuwo.js 不应再依赖全局 fetch");
});

check("服务：入口暴露必需路由", () => {
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  ["/api/health", "/api/playlist", "/api/resolve", "/api/lrc", "/api/stream"].forEach((route) => {
    assert.ok(server.includes(route), `缺少路由 ${route}`);
  });
});

console.log("music-api 自检结果：");
console.log(results.join("\n"));
console.log(process.exitCode ? "\n存在失败项，请检查上面的输出。" : "\n全部通过 ✅");

