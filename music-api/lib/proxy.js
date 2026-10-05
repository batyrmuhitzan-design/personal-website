/**
 * ==========================================================================
 *  音源代理 / 歌词代理
 * ==========================================================================
 *  为什么要代理：
 *    1) 网易云/QQ 的音源响应头有时候不是 audio/mpeg（实测 QQ 返回
 *       application/x-www-form-urlencoded），浏览器可能拒绝播放，这里统一修正；
 *    2) 部分音源是 http 跳转，https 站点直接播放会被判为混合内容；
 *    3) 顺带解决防盗链（补 UA）与 CORS（同源访问）；
 *    4) 支持 Range 透传，拖动进度条不会整段重下。
 *
 *  安全：只允许白名单域名，避免服务被当成任意代理滥用。
 * ==========================================================================
 */

import { Readable } from "node:stream";
import { DEFAULT_METING_INSTANCES } from "./meting.js";
import { DEFAULT_UA, fetchWithTimeout, HttpError } from "./util.js";

const BUILTIN_ALLOW = [
  "music.126.net",
  "music.163.com",
  "kuwo.cn",
  "qq.com",
  "kugou.com",
  "baidu.com",
  "migu.cn",
  "126.net",
  "injahow.cn",
  "qijieya.cn",
  "icodeq.com",
];

let cachedAllow = null;

function allowList() {
  if (cachedAllow) return cachedAllow;
  const fromEnv = String(process.env.ALLOW_HOSTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const fromInstances = DEFAULT_METING_INSTANCES.map((base) => {
    try {
      return new URL(base).hostname;
    } catch {
      return "";
    }
  }).filter(Boolean);
  cachedAllow = Array.from(new Set([...BUILTIN_ALLOW, ...fromEnv, ...fromInstances]));
  return cachedAllow;
}

/** 音源 http → https（网易云封面/音源 https 同样可用，避免混合内容） */
export function httpsify(url) {
  return String(url || "").replace(/^http:\/\//i, "https://");
}

export function assertAllowed(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new HttpError(400, "地址不合法");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new HttpError(400, "不支持的协议");
  if (process.env.ALLOW_ANY === "1") return parsed;
  const host = parsed.hostname;
  const allowed = allowList().some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  if (!allowed) throw new HttpError(403, `域名不在白名单内：${host}`);
  return parsed;
}

async function fetchUpstream(rawUrl, { range, timeout = 20000 } = {}) {
  const target = assertAllowed(rawUrl);
  const headers = { "User-Agent": DEFAULT_UA, Accept: "*/*" };
  if (range) headers.Range = range;
  const res = await fetchWithTimeout(target.toString(), { headers, redirect: "follow" }, timeout);
  if (!res.ok && res.status !== 206) throw new HttpError(502, `上游返回 ${res.status}`);
  return res;
}

function audioContentType(upstreamType) {
  const type = String(upstreamType || "");
  if (/audio\/mpeg|audio\/mp3|octet-stream/i.test(type)) return "audio/mpeg";
  if (type.startsWith("audio/")) return type.split(";")[0];
  return "audio/mpeg";
}

/** 音频流式转发（支持 Range） */
export async function streamAudio(rawUrl, req, res) {
  const upstream = await fetchUpstream(rawUrl, { range: req.headers.range });
  const headers = {
    "Content-Type": audioContentType(upstream.headers.get("content-type")),
    "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
    "Cache-Control": "public, max-age=1800",
  };
  const length = upstream.headers.get("content-length");
  if (length) headers["Content-Length"] = length;
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers["Content-Range"] = contentRange;

  res.writeHead(upstream.status === 206 ? 206 : 200, headers);
  if (!upstream.body) {
    res.end();
    return;
  }
  Readable.fromWeb(upstream.body).pipe(res);
}

/** 歌词（LRC 文本）转发，统一按 UTF-8 纯文本返回 */
export async function fetchLrcText(rawUrl) {
  const upstream = await fetchUpstream(rawUrl, { timeout: 15000 });
  return upstream.text();
}
