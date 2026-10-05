# ==========================================================================
#  莎莎 · 个人主页 —— 多阶段构建
#  阶段 1：Node 里执行 npm run build，产出静态文件 build/
#  阶段 2：nginx:alpine 托管静态文件，容器内监听 80 端口
#  最终镜像仅包含 nginx + 静态资源，体积小、启动快
# ==========================================================================

# ---------------------------- 构建阶段 ----------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 先只拷贝依赖清单，利用 Docker 层缓存，改代码时不必重装依赖
COPY package.json package-lock.json ./

# 模板的上游依赖存在 peer 版本冲突，需要 --legacy-peer-deps
RUN npm install --legacy-peer-deps --no-audit --no-fund

# 拷贝其余源码并构建
COPY . .

# CI=true：CRA 以非交互方式构建，且把 lint 警告视为错误（本项目当前零警告）
# GENERATE_SOURCEMAP=false：不在镜像里输出 sourcemap，进一步减小体积
ENV CI=true
ENV GENERATE_SOURCEMAP=false
# 842MB 小内存服务器：给 Node 构建阶段加大堆上限，避免 framer-motion + Tailwind 后
# terser 压缩时 JavaScript 堆溢出（宿主机有 2G swap 兜底，1G 堆是安全的）
ENV NODE_OPTIONS=--max-old-space-size=1024
RUN npm run build

# ---------------------------- 运行阶段 ----------------------------
FROM nginx:alpine

# 中文内容，保证静态资源按 UTF-8 返回
ENV LANG=C.UTF-8
ENV TZ=Asia/Shanghai

# 站点配置（含 gzip、缓存策略、SPA history 回退）
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 拷贝构建产物
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
