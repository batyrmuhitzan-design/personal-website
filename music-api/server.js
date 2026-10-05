/**
 * ==========================================================================
 *  莎莎个人主页 · 音乐解析服务（零依赖，Node 20）
 * ==========================================================================
 *  接口一览：
 *    GET /api/health                              健康检查
 *    GET /api/platforms                           内置榜单目录
 *    GET /api/playlist?platform=&provider=&id=&mode=&limit=&proxy=
 *                                                 榜单曲目（APlayer 可直接用）
 *    GET /api/resolve?origin=&sid=&name=&artist=  单曲重新解析（直链过期时重试）
 *    GET /api/lrc?u=<音源 lrc 地址>               歌词文本（同源，规避跨域）
 *    GET /api/stream?u=<音源地址>                 音频转发（Range / 修正响应头）
 *
 *  前端由 nginx 反向代理到本服务：/music/api/ -> http://music-api:8080/api/
 * ==========================================================================
 */

import http from "node:http";
import { URL } from "node:url";
import { fetchLrcText, streamAudio } from "./lib/proxy.js";
import { buildPlaylist, healthInfo, listPlatforms, resolveOne } from "./lib/resolver.js";
import { HttpError } from "./lib/util.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  const body = Buffer.from(String(text), "utf8");
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": body.length,
  });
  res.end(body);
}

function applyCommonHeaders(res) {
  // 同源部署时用不到 CORS，但保留后可以单独把服务暴露出去调试
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range,Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function log(...args) {
  console.log(`[music-api] ${new Date().toISOString()}`, ...args);
}

const server = http.createServer(async (req, res) => {
  applyCommonHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "只支持 GET" });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const started = Date.now();

  try {
    switch (url.pathname) {
      case "/api/health": {
        sendJson(res, 200, healthInfo());
        break;
      }
      case "/api/platforms": {
        sendJson(res, 200, { ok: true, platforms: listPlatforms() });
        break;
      }
      case "/api/playlist": {
        const payload = await buildPlaylist(Object.fromEntries(url.searchParams), { log });
        log(
          `playlist ${payload.platform} → ${payload.count} 首（${payload.via}，${payload.tookMs}ms` +
            `${payload.cached ? "，命中缓存" : ""}）`
        );
        sendJson(res, 200, payload);
        break;
      }
      case "/api/resolve": {
        const payload = await resolveOne(Object.fromEntries(url.searchParams), { log });
        log(`resolve ${url.searchParams.get("origin")}/${url.searchParams.get("sid") || url.searchParams.get("name")}`);
        sendJson(res, 200, payload);
        break;
      }
      case "/api/lrc": {
        const target = url.searchParams.get("u");
        if (!target) throw new HttpError(400, "缺少参数 u");
        const text = await fetchLrcText(target);
        sendText(res, 200, text);
        break;
      }
      case "/api/stream": {
        const target = url.searchParams.get("u");
        if (!target) throw new HttpError(400, "缺少参数 u");
        await streamAudio(target, req, res);
        log(`stream ${new URL(target).hostname} (${Date.now() - started}ms)`);
        break;
      }
      default: {
        sendJson(res, 404, { ok: false, error: `未知路径：${url.pathname}` });
      }
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : err.status || 500;
    if (status >= 500) log(`ERROR ${url.pathname}: ${err.stack || err.message}`);
    if (res.headersSent) {
      res.end();
      return;
    }
    sendJson(res, status, { ok: false, error: err.message || "服务内部错误" });
  }
});

server.on("clientError", (err, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT, HOST, () => {
  log(`listening on http://${HOST}:${PORT}`);
  log(`已加载榜单目录 ${Object.keys(listPlatforms()).length} 项；API 前缀 ${process.env.API_PREFIX || "/music/api"}`);
});

const shutdown = (signal) => {
  log(`收到 ${signal}，正在退出`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
