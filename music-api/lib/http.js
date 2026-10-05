/**
 * ==========================================================================
 *  强制 IPv4 的极简 HTTP 客户端
 * ==========================================================================
 *  为什么不直接用全局 fetch（undici）：
 *    酷我等国产音源域名是双栈（同时有 A 与 AAAA 记录），而 Docker 容器通常没有
 *    IPv6 出口。实测在容器内 fetch 这两个域名会 ETIMEDOUT，而 node:http 指定
 *    family:4 立刻返回 200，所以酷我相关请求走这里。
 *  这里也不跟随 302（音源直链由上层自己拼装并交给 /api/stream 代理）。
 * ==========================================================================
 */

import http from "node:http";
import https from "node:https";
import { DEFAULT_UA, HttpError } from "./util.js";

export function requestText(url, { timeout = 12000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      reject(new HttpError(400, `地址不合法: ${url}`));
      return;
    }

    const client = target.protocol === "https:" ? https : http;
    const request = client.get(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        headers: { "User-Agent": DEFAULT_UA, Accept: "*/*", ...headers },
        family: 4, // 关键：强制 IPv4，绕开容器没有 IPv6 出口的问题
        timeout,
      },
      (response) => {
        const status = response.statusCode || 0;
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new HttpError(502, `上游返回 ${status}: ${target.hostname}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        response.on("error", (err) => reject(new HttpError(502, `读取失败: ${err.message}`)));
      }
    );

    request.on("timeout", () => request.destroy(new HttpError(504, `上游超时: ${target.hostname}`)));
    request.on("error", (err) =>
      reject(err instanceof HttpError ? err : new HttpError(502, `请求失败: ${err.message}`))
    );
  });
}

export async function requestJson(url, options) {
  const text = await requestText(url, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, `上游返回的不是合法 JSON: ${url}`);
  }
}
