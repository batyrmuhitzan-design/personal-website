# 莎莎 · 音乐解析服务（music-api）

给首页左下角悬浮播放器提供**国内可直接播放**的音源。零第三方依赖，只用 Node 20 内置的
`fetch` / `http`，镜像很小、构建很快。

```
浏览器（国内，无 VPN）
  └─ 同源请求 /music/api/*  ← Nginx 反向代理
        └─ 容器 music-api:8080
              ├─ 网易云 / QQ / 抖音 / 汽水：公共 Meting 实例聚合解析
              └─ Spotify：读取公开歌单页 → 逐曲匹配国内可播放音源（网易云 → 酷我）
```

## 一、快速使用

```bash
npm start          # 启动服务，默认 0.0.0.0:8080
npm run check      # 不联网的自检（Spotify 页面解析、酷我字段解析、参数校验、白名单…）

# 接口冒烟
curl 'http://127.0.0.1:8080/api/health'
curl 'http://127.0.0.1:8080/api/playlist?platform=netease-hot&limit=3'
curl 'http://127.0.0.1:8080/api/playlist?platform=spotify&limit=3'   # 首次约 10~20s，之后命中 30 分钟缓存
```

## 二、接口

| 路径 | 参数 | 说明 |
| --- | --- | --- |
| `/api/health` | — | 健康检查（容器 HEALTHCHECK 用） |
| `/api/platforms` | — | 服务端内置榜单目录 |
| `/api/playlist` | `platform` 或 `provider`+`id`、`mode`、`label`、`limit`(≤50)、`proxy`(0/1) | 归一化后的曲目数组，字段与 APlayer 对齐：`name/artist/url/rawUrl/pic/lrc/origin/preview` |
| `/api/resolve` | `origin`、`sid`、`name`、`artist`、`proxy` | 单曲重新解析（音源直链过期、播放失败重试时用） |
| `/api/lrc` | `u`（音源歌词地址） | 转发歌词文本（同源，规避跨域） |
| `/api/stream` | `u`（音源地址） | 音频转发：透传 Range、统一 `Content-Type: audio/mpeg` |

其中 `mode`：
- `meting`：走公共 Meting 实例（支持 `netease/tencent/kuwo/kugou/baidu/migu`）；
- `match`：先取榜单曲目信息，再逐曲匹配国内可播放音源（目前用于 Spotify）。

## 三、实现要点

- **多实例降级**：`api.injahow.cn` → `api.qijieya.cn` → `meting.icodeq.com`，任一挂掉自动切换；
  播放/封面/歌词地址统一按可用实例重新拼装，不把带 `auth` 的临时地址透给前端。
- **容器内 IPv6 的坑**：酷我域名是双栈，而 Docker 容器通常没有 IPv6 出口，
  全局 `fetch`（undici）会卡在 IPv6 上直接 `ETIMEDOUT`；因此酷我相关请求走
  `lib/http.js`（`node:http` + `family: 4` 强制 IPv4），实测容器内立即恢复 200。
- **Spotify**：Meting 生态没有该音源，官方匿名 token 也已封禁，因此改为解析
  `open.spotify.com/embed/playlist/<id>` 页面内嵌的曲目数据（约 50 首），再交给匹配模块。
- **跨源匹配**：网易云搜索（拿封面/歌词）＋酷我搜索（欧美曲目完整度高）→ 相似度打分
  → Range 探测体积（`content-range` 只取 2 字节）→ 小于 1.2MB 视为试听片段，继续找下一个候选。
- **缓存**：榜单 30 分钟、单曲 6 小时（`PLAYLIST_TTL_MS` / `SONG_TTL_MS` 可调）。
- **安全**：`/api/stream`、`/api/lrc` 只允许白名单域名（网易云/酷我/QQ/Meting 实例），
  避免被当成开放代理；需要额外域名用 `ALLOW_HOSTS` 追加，调试时才用 `ALLOW_ANY=1`。

## 四、可调环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 监听端口 |
| `API_PREFIX` | `/music/api` | 生成代理地址时用的前缀 |
| `PLAYLIST_TTL_MS` | `1800000` | 榜单缓存时长（30 分钟） |
| `SONG_TTL_MS` | `21600000` | 单曲解析缓存时长（6 小时） |
| `ALLOW_HOSTS` | 空 | 追加音源域名白名单（逗号分隔，子域名自动匹配） |
| `ALLOW_ANY` | 未设置 | `1` = 放开代理白名单（仅调试） |

## 五、已知限制（重要）

1. **版权**：跨源匹配受各平台版权限制，个别欧美曲目只能拿到试听片段或匹配不到，
   播放器会自动跳过并给出提示；这是音源侧限制，不是服务缺陷。
2. **公共实例稳定性**：网易云/QQ 依赖公共 Meting 实例，实例挂掉时会自动切换/降级；
   若长期不稳定，可自建 Meting 实例后把实例地址加到 `lib/meting.js` 的
   `DEFAULT_METING_INSTANCES`（或在解析失败时改走 `netease.js` 的明文接口 + 酷我匹配）。
3. **页面结构变动**：Spotify 解析基于公开页面的内嵌数据（非官方 API），
   页面改版可能失效；`lib/spotify.js` 内置了「就近正则」兜底，
   `npm run check` 可在改版后快速确认解析是否仍然正常。
4. **法律与条款**：本服务仅用于个人主页的榜单试听，请遵守各音源平台的用户协议与著作权规定，
   不要用于批量下载或商业分发。
