# ==========================================================================
#  莎莎个人主页 · 音乐解析服务镜像
#  零第三方依赖（只用 Node 内置 fetch / http），所以镜像很小、构建很快
# ==========================================================================

FROM node:20-alpine

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    LANG=C.UTF-8 \
    PORT=8080

WORKDIR /app

# 只拷贝运行需要的东西（package.json 里的依赖为空，无需 npm install）
COPY package.json ./
COPY server.js ./
COPY lib ./lib

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server.js"]
