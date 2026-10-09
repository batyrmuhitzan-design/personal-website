#!/usr/bin/env bash
# ==========================================================================
#  莎莎 · 个人主页 —— 「本机编译 + 服务器只打 nginx 镜像」部署脚本
#
#  为什么需要它：
#    服务器只有 837MB 内存 + 2GB swap，跑不动 CRA + TypeScript 的生产构建
#    （deploy.sh 的 docker compose build 会卡在 "Creating an optimized
#     production build..." 十几分钟后被 OOM 杀掉，镜像一直没有新版本）。
#    所以把编译搬到开发机，服务器只做「nginx + 静态文件」这一层打包，
#    几秒完成、几乎不吃内存。
#
#  用法：
#    bash scripts/deploy-prebuilt.sh             # 本机编译 + 推送代码 + 服务器打包上线
#    bash scripts/deploy-prebuilt.sh --no-build  # 跳过本机编译，直接用现有 build/
#    bash scripts/deploy-prebuilt.sh --no-push   # 不推代码（服务器自己 fetch origin）
#    bash scripts/deploy-prebuilt.sh --rollback  # 回滚：把 :previous 镜像换回去
#    bash scripts/deploy-prebuilt.sh -h | --help
#
#  做了什么：
#    1) 本机 npm run build（CI=true、不生成 sourcemap，与 Dockerfile 环境一致）
#    2) build/ → prebuilt/，打 tar.gz 推到服务器
#    3) 服务器 git reset --hard origin/master（prebuilt/ 在 .gitignore 里，不会被删）
#    4) docker build -f Dockerfile.prebuilt -t personal-website:latest .
#    5) docker compose up -d --force-recreate personal-website
#    6) 健康检查：容器 healthy + http://127.0.0.1:8881 返回 200
#    失败自动回滚到 :previous。
# ==========================================================================

set -Eeuo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" 2>/dev/null && pwd || printf '%s' "$PWD")"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd || printf '%s' "$SCRIPT_DIR")"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

DO_BUILD=1
NO_PUSH=0
DO_ROLLBACK=0

usage() {
  sed -n '2,27p' "$SCRIPT_PATH" 2>/dev/null | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --no-build)   DO_BUILD=0 ;;
    --no-push)    NO_PUSH=1 ;;
    --rollback)   DO_ROLLBACK=1 ;;
    -h|--help)    usage ;;
    *) echo "未知参数：$1（用 --help 查看用法）" >&2; exit 2 ;;
  esac
  shift
done

# ------------------------------ 读取 .env ------------------------------
if [ -f "$ENV_FILE" ]; then
  ENV_TMP="$(mktemp)"
  tr -d '\r' < "$ENV_FILE" > "$ENV_TMP"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_TMP"
  set +a
  rm -f "$ENV_TMP"
fi

SSH_HOST="${AGENT_SSH_HOST:-kaznu}"
REMOTE_DIR="${AGENT_REMOTE_DIR:-/opt/personal-website}"
BRANCH="${AGENT_GIT_BRANCH:-master}"
LOCAL_PORT="${AGENT_LOCAL_PORT:-8881}"
PUBLIC_URL="${SITE_PUBLIC_URL:-}"
WEB_CONTAINER="${AGENT_COMPOSE_PROJECT:-personal-website}"
WEB_IMAGE="personal-website:latest"
WEB_PREVIOUS="personal-website:previous"   # 上一个可用镜像，失败时回滚到这里

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_HEAD=$'\033[36m'; C_RESET=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_HEAD=""; C_RESET=""
fi
step() { printf '%s==> %s%s\n' "$C_HEAD" "$*" "$C_RESET"; }
ok()   { printf '%s  ✓ %s%s\n' "$C_OK" "$*" "$C_RESET"; }
warn() { printf '%s  ! %s%s\n' "$C_WARN" "$*" "$C_RESET" >&2; }
die()  { printf '%s  ✗ %s%s\n' "$C_ERR" "$*" "$C_RESET" >&2; exit 1; }

# ------------------------------ 回滚 ------------------------------
rollback_remote() {
  ssh "$SSH_HOST" "cd $REMOTE_DIR && docker image inspect $WEB_PREVIOUS >/dev/null 2>&1 && docker tag $WEB_PREVIOUS $WEB_IMAGE && docker compose up -d --force-recreate $WEB_CONTAINER" || true
}

if [ "$DO_ROLLBACK" = "1" ]; then
  step "回滚：$WEB_PREVIOUS → $WEB_IMAGE"
  ssh "$SSH_HOST" "cd $REMOTE_DIR && docker image inspect $WEB_PREVIOUS >/dev/null 2>&1 || { echo '服务器上没有 :previous 备份'; exit 1; }" \
    || die "无法回滚（没有 :previous 备份）"
  rollback_remote
  ok "已把 $WEB_PREVIOUS 换回 $WEB_IMAGE 并重建容器"
  ok "本机入口：http://127.0.0.1:${LOCAL_PORT}"
  exit 0
fi

# ------------------------------ 1/4 本机编译 ------------------------------
if [ "$DO_BUILD" = "1" ]; then
  step "1/4 本机编译（CI=true、不生成 sourcemap）"
  command -v npm >/dev/null 2>&1 || die "本机没有 npm"
  ( cd "$REPO_ROOT" && CI=true GENERATE_SOURCEMAP=false NODE_OPTIONS=--max-old-space-size=4096 npm run build ) \
    || die "本机 npm run build 失败（先看上面的错误）"
  [ -f "$REPO_ROOT/build/index.html" ] || die "编译结束但没有 build/index.html"
  ok "编译完成"
else
  step "1/4 跳过本机编译（--no-build）"
  [ -f "$REPO_ROOT/build/index.html" ] || die "build/ 里没有 index.html，去掉 --no-build 重跑"
fi

# 产物自检：确认这次「白屏 / 黑胶不转 / 卡通风光标」三个修复真的在包里
# （用 find -print -quit 取第一个匹配，避免 ls | head 触发 SIGPIPE 让 pipefail 误判失败）
CSS_FILE="$(find "$REPO_ROOT/build/static/css" -name 'main.*.css' -print -quit 2>/dev/null || true)"
JS_FILE="$(find "$REPO_ROOT/build/static/js" -name 'main.*.js' -print -quit 2>/dev/null || true)"
[ -n "$CSS_FILE" ] && [ -n "$JS_FILE" ] || die "产物里找不到 main.*.css / main.*.js"
grep -q 'motion-play-state' "$CSS_FILE" || die "产物缺少 --motion-play-state（动效开关），先别上线"
grep -q 'mp-vinyl-spin'     "$CSS_FILE" || die "产物缺少黑胶旋转动画 mp-vinyl-spin，先别上线"
# 卡通光标（.cur-*）的样式是组件运行时注入的，所以只能到 JS 包里找
grep -q 'cur-figure'        "$JS_FILE"  || die "产物缺少卡通风光标 cur-figure，先别上线"
grep -q 'cur-eye'           "$JS_FILE"  || die "产物缺少光标眼珠标记 cur-eye，先别上线"
ok "产物自检通过：$(basename "$JS_FILE") + $(basename "$CSS_FILE")"

# ------------------------------ 2/4 推送代码 ------------------------------
if [ "$NO_PUSH" = "1" ]; then
  warn "已指定 --no-push，服务器自行 fetch origin（需保证远端已有 Dockerfile.prebuilt）"
else
  step "2/4 推送代码到 origin/$BRANCH"
  git -C "$REPO_ROOT" push origin "HEAD:$BRANCH" || die "git push 失败（检查凭证，或先 pull 远端新提交）"
  ok "已推送 $(git -C "$REPO_ROOT" rev-parse --short HEAD) → origin/$BRANCH"
fi

# ------------------------------ 3/4 同步产物 ------------------------------
step "3/4 把构建产物送到服务器"
rm -rf "$REPO_ROOT/prebuilt"
mkdir -p "$REPO_ROOT/prebuilt"
cp -R "$REPO_ROOT/build/." "$REPO_ROOT/prebuilt/"
TARBALL="$(mktemp -t pw-prebuilt-XXXXXX).tar.gz"
tar -czf "$TARBALL" -C "$REPO_ROOT" prebuilt || die "打包 prebuilt/ 失败"
REMOTE_TARBALL="/tmp/pw-prebuilt-$$.tar.gz"
scp -q "$TARBALL" "$SSH_HOST:$REMOTE_TARBALL" \
  || die "scp 失败：SSH 免密是否正常？先试 ssh $SSH_HOST true"
ok "已上传 $(( $(wc -c < "$TARBALL") / 1024 )) KB → $SSH_HOST:$REMOTE_TARBALL"
rm -f "$TARBALL"

# ------------------------------ 4/4 服务器打包并切换 ------------------------------
step "4/4 服务器用 nginx 层打包并切换容器（不编译，几秒完成）"
REMOTE_CMD=$(cat <<REMOTE_EOF
set -Eeuo pipefail
cd $REMOTE_DIR
git fetch --prune origin
git reset --hard origin/$BRANCH
git --no-pager log --oneline -1 | sed 's/^/      版本：/'

if docker image inspect $WEB_IMAGE >/dev/null 2>&1; then
  docker tag $WEB_IMAGE $WEB_PREVIOUS
  echo "      已把现镜像备份为 $WEB_PREVIOUS"
fi

rm -rf prebuilt
mkdir -p prebuilt
tar -xzf $REMOTE_TARBALL -C .
[ -f prebuilt/index.html ] || { echo "解包后没有 prebuilt/index.html"; exit 1; }

docker build -f Dockerfile.prebuilt -t $WEB_IMAGE . || exit 1
docker compose up -d --force-recreate $WEB_CONTAINER || exit 1

st=starting
for _ in \$(seq 1 40); do
  st=\$(docker inspect -f '{{.State.Health.Status}}' $WEB_CONTAINER 2>/dev/null || echo starting)
  [ "\$st" = "healthy" ] && break
  sleep 3
done
[ "\$st" = "healthy" ] || { echo "容器状态：\$st"; exit 1; }

code=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$LOCAL_PORT/ || echo 000)
[ "\$code" = "200" ] || { echo "本机入口返回 \$code"; exit 1; }

rm -f $REMOTE_TARBALL
echo "      ✓ 容器 healthy，http://127.0.0.1:$LOCAL_PORT 返回 200"
REMOTE_EOF
)

if ! ssh "$SSH_HOST" "$REMOTE_CMD"; then
  warn "服务器侧部署失败，正在回滚到 $WEB_PREVIOUS"
  rollback_remote
  die "本次部署失败（已尝试回滚，详情见上方输出）"
fi

# ------------------------------ 收尾 ------------------------------
step "部署完成 ✅"
ok "版本：$(git -C "$REPO_ROOT" --no-pager log --oneline -1)"
ok "本机入口：http://127.0.0.1:${LOCAL_PORT}"
if [ -n "$PUBLIC_URL" ]; then ok "公网入口：${PUBLIC_URL}"; fi
ok "回滚命令：bash scripts/deploy-prebuilt.sh --rollback"


