#!/usr/bin/env bash
# ==========================================================================
#  莎莎 · 个人主页 —— 一键部署脚本（给人和 DeepSeek Agent 共用）
#
#  目标：只跑一条命令，就完成「拉取代码 → 编译构建 → 启动容器 → 健康检查」，
#        任何一步失败都自动回滚到上一个可用镜像，不会把站点长期留在坏状态。
#
#  用法：
#    bash deploy.sh                      # 自动判断：在服务器上=本机部署；在开发机上=推送+远端部署
#    bash deploy.sh --server             # 强制服务器模式
#    bash deploy.sh --local              # 强制本地模式（git push 后经 SSH 触发服务器模式）
#    bash deploy.sh --local --no-push    # 本地模式但不推送（由服务器自己 fetch origin）
#    bash deploy.sh --local --allow-dirty# 允许工作区有未提交改动（这些改动不会上线，仅用于排障）
#    bash deploy.sh --timeout 180        # 健康检查超时秒数（默认取 .env 的 AGENT_HEALTH_TIMEOUT=120）
#    bash deploy.sh --no-rollback        # 失败时不回滚（只在排障时用）
#    bash deploy.sh --pull               # 构建前先 docker pull 基础镜像（默认不拉，省流量）
#    bash deploy.sh -h | --help          # 帮助
#
#  服务器模式做的事（顺序执行，失败即回滚）：
#    1) 记录当前 commit，并把现镜像打上 :previous 标签
#    2) git fetch + git reset --hard origin/<branch>   ← 副本与远端保持一致
#    3) docker compose build
#    4) docker compose up -d
#    5) 健康检查：容器 health 状态 + /healthz + /music/api/health（公网域名为附加项）
#    6) 成功 → 打印摘要、访问地址、磁盘余量提示；失败 → 回滚并返回非 0 退出码
#
#  不会做的事：不动别的项目（shasha-faka / nodebb / 1losion.me 的 uvicorn），
#  不执行 docker compose down -v，不删除数据卷。
# ==========================================================================

set -Eeuo pipefail

# ------------------------------ 脚本自身路径 ------------------------------
# 本地模式需要它的绝对路径 scp 到服务器；--help 也读它的头部注释
SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" 2>/dev/null && pwd || printf '%s' "$PWD")"

# ------------------------------ 参数解析 ------------------------------
MODE="auto"                # auto | server | local
ALLOW_DIRTY=0
NO_PUSH=0
NO_ROLLBACK=0
DO_PULL=0
HEALTH_TIMEOUT_OVERRIDE=""

usage() {
  # 直接取文件头注释作为帮助输出（兼容 bash deploy.sh 与 bash -s 两种调用方式）
  local src="$SCRIPT_PATH"
  [ -f "$src" ] || src="$0"
  if [ -f "$src" ]; then
    sed -n '2,25p' "$src" | sed 's/^# \{0,1\}//'
  else
    echo "用法：bash deploy.sh [--server|--local|--no-push|--allow-dirty|--no-rollback|--pull|--timeout N]"
  fi
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --server)      MODE="server" ;;
    --local)       MODE="local" ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --no-push)     NO_PUSH=1 ;;
    --no-rollback) NO_ROLLBACK=1 ;;
    --pull)        DO_PULL=1 ;;
    --timeout)     HEALTH_TIMEOUT_OVERRIDE="${2:-}"; shift ;;
    -h|--help)     usage ;;
    *) echo "未知参数：$1（用 --help 查看用法）" >&2; exit 2 ;;
  esac
  shift
done

# ------------------------------ 读取 .env ------------------------------
# .env 里可以覆盖下面的默认值；Windows 上写出的 CRLF 先清掉再 source，
# 否则路径末尾会混进 \r，SSH 会报 "No such file or directory"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env}"
if [ -f "$ENV_FILE" ]; then
  ENV_TMP="$(mktemp)"
  tr -d '\r' < "$ENV_FILE" > "$ENV_TMP"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_TMP"
  set +a
  rm -f "$ENV_TMP"
fi

REMOTE_DIR="${AGENT_REMOTE_DIR:-/opt/personal-website}"
BRANCH="${AGENT_GIT_BRANCH:-master}"
SSH_HOST="${AGENT_SSH_HOST:-kaznu}"
SERVER_IP="${AGENT_SERVER_IP:-74.241.248.9}"
LOCAL_PORT="${AGENT_LOCAL_PORT:-8881}"
PUBLIC_URL="${SITE_PUBLIC_URL:-}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT_OVERRIDE:-${AGENT_HEALTH_TIMEOUT:-120}}"
WEB_CONTAINER="${AGENT_COMPOSE_PROJECT:-personal-website}"
API_CONTAINER="music-api"
WEB_IMAGE="personal-website:latest"
API_IMAGE="shasha-music-api:latest"

# ------------------------------ 终端输出 ------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_HEAD=$'\033[36m'
else
  C_RESET=""; C_OK=""; C_WARN=""; C_ERR=""; C_HEAD=""
fi
step()  { printf '%s==> %s%s\n' "$C_HEAD" "$*" "$C_RESET"; }
ok()    { printf '  %s✓%s %s\n' "$C_OK" "$C_RESET" "$*"; }
warn()  { printf '  %s!%s %s\n' "$C_WARN" "$C_RESET" "$*"; }
fail()  { printf '  %s✗%s %s\n' "$C_ERR" "$C_RESET" "$*" >&2; }
die()   { fail "$*"; exit 1; }

# ------------------------------ 基础工具 ------------------------------
pick_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    die "这台机器上没有 docker compose，无法部署"
  fi
}

# 容器状态：healthy / starting / unhealthy / running / exited / missing
container_health() {
  local name="$1" status
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || true)"
  printf '%s' "${status:-missing}"
}

http_body() { curl -fsS -m 5 "$1" 2>/dev/null || true; }

wait_healthy() {
  local name="$1" deadline=$((SECONDS + HEALTH_TIMEOUT)) status
  while [ "$SECONDS" -lt "$deadline" ]; do
    status="$(container_health "$name")"
    case "$status" in
      healthy|running) ok "容器 $name：$status"; return 0 ;;
      unhealthy)       fail "容器 $name → unhealthy，日志：$COMPOSE logs --tail=80 $name"; return 1 ;;
    esac
    sleep 3
  done
  fail "容器 $name 在 ${HEALTH_TIMEOUT}s 内未就绪（当前：$(container_health "$name")）"
  return 1
}

# 站点自身的两个探针：静态页 /healthz 与音乐解析服务
check_endpoints() {
  local body
  body="$(http_body "http://127.0.0.1:${LOCAL_PORT}/healthz")"
  if [ "$body" = "ok" ]; then ok "本机 http://127.0.0.1:${LOCAL_PORT}/healthz → ok"
  else fail "本机 /healthz 期望 ok，实际：${body:-<无响应>}"; return 1; fi

  body="$(http_body "http://127.0.0.1:${LOCAL_PORT}/music/api/health")"
  case "$body" in
    *'"ok":true'*) ok "本机 /music/api/health → 解析服务正常" ;;
    *) fail "音乐解析服务异常：${body:-<无响应>}（日志：$COMPOSE logs --tail=80 music-api）"; return 1 ;;
  esac

  if [ -n "$PUBLIC_URL" ]; then
    body="$(curl -fsS -m 10 "$PUBLIC_URL/healthz" 2>/dev/null || true)"
    if [ "$body" = "ok" ]; then ok "公网 ${PUBLIC_URL}/healthz → ok"
    else warn "公网 ${PUBLIC_URL}/healthz 未通过（多为 DNS/反代/证书问题，不计入本次部署判定）"; fi
  fi
  return 0
}

# ------------------------------ 回滚机制 ------------------------------
ROLLBACK_ARMED=0
PREV_SHA=""

rollback() {
  set +e
  warn "部署失败 → 回滚到上一个可用版本"
  if [ -n "$PREV_SHA" ]; then
    if git reset --hard "$PREV_SHA" >/dev/null 2>&1; then ok "代码已回退到 ${PREV_SHA:0:7}"
    else warn "代码回退失败，请手工执行：git reset --hard $PREV_SHA"; fi
  fi
  if docker image inspect "personal-website:previous" >/dev/null 2>&1; then
    if docker tag personal-website:previous "$WEB_IMAGE" && $COMPOSE up -d --force-recreate >/dev/null 2>&1; then
      ok "已用 personal-website:previous 镜像重新拉起容器"
    else
      warn "镜像回滚失败，请手工执行：$COMPOSE up -d --build"
    fi
  else
    warn "没有 :previous 镜像，改为按源码重建：$COMPOSE up -d --build"
    $COMPOSE up -d --build >/dev/null 2>&1 || warn "重建也失败，需要人工介入"
  fi
  check_endpoints || warn "回滚后仍未通过自检，请立刻查看日志：$COMPOSE logs --tail=100"
  set -e
}

on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$ROLLBACK_ARMED" = "1" ] && [ "$NO_ROLLBACK" != "1" ]; then
    rollback
  fi
  exit "$rc"
}
trap on_exit EXIT

# ------------------------------ 服务器模式 ------------------------------
server_deploy() {
  [ -d "$REMOTE_DIR/.git" ] || die "找不到仓库副本 $REMOTE_DIR，--server 只能在服务器上执行"
  command -v docker >/dev/null 2>&1 || die "没有 docker，无法部署"
  pick_compose
  cd "$REMOTE_DIR" || die "无法进入 $REMOTE_DIR"

  step "1/5 预检与回滚点"
  PREV_SHA="$(git rev-parse HEAD)"
  ok "当前版本：$(git --no-pager log --oneline -1)"
  if [ -n "$(git status --porcelain)" ]; then
    warn "副本上有未提交改动，将被 git reset --hard 覆盖（以远端为准）"
  fi
  if docker image inspect "$WEB_IMAGE" >/dev/null 2>&1; then
    docker tag "$WEB_IMAGE" "personal-website:previous" && ok "现镜像已备份为 personal-website:previous"
  else
    warn "没有现镜像（首次部署），跳过镜像备份"
  fi
  ROLLBACK_ARMED=1

  step "2/5 拉取代码"
  git fetch --prune origin || die "git fetch 失败（网络或仓库权限问题）"
  git reset --hard "origin/$BRANCH" || die "git reset --hard origin/$BRANCH 失败"
  ok "已同步到 $(git --no-pager log --oneline -1)"

  step "3/5 构建镜像（这台机器内存小，切勿并发构建）"
  if [ "$DO_PULL" = "1" ]; then $COMPOSE build --pull; else $COMPOSE build; fi
  ok "构建完成：$WEB_IMAGE / $API_IMAGE"

  step "4/5 启动容器"
  $COMPOSE up -d || die "docker compose up -d 失败"
  wait_healthy "$WEB_CONTAINER" || die "站点容器未就绪"
  wait_healthy "$API_CONTAINER" || die "音乐解析容器未就绪"

  step "5/5 健康检查"
  check_endpoints || die "端点自检未通过"

  ROLLBACK_ARMED=0
  echo
  step "部署完成 ✅"
  ok "版本：$(git --no-pager log --oneline -1)"
  ok "本机入口：http://127.0.0.1:${LOCAL_PORT}（服务器直连 http://${SERVER_IP}:${LOCAL_PORT}）"
  [ -n "$PUBLIC_URL" ] && ok "公网入口：${PUBLIC_URL}"
  ok "日志：$COMPOSE logs -f --tail=100   |   停止：$COMPOSE down"

  # 这台服务器根分区常年接近 70%，顺手清掉悬空镜像并提示构建缓存
  docker image prune -f >/dev/null 2>&1 || true
  local avail_kb
  avail_kb="$(df -Pk / | awk 'NR==2 {print $4}')"
  if [ "${avail_kb:-0}" -lt 3145728 ]; then
    warn "根分区可用空间不足 3GB，建议清理构建缓存：docker builder prune -f"
  else
    ok "根分区可用空间约 $(( avail_kb / 1024 ))MB"
  fi
  return 0
}

# ------------------------------ 本地模式 ------------------------------
local_deploy() {
  command -v git >/dev/null 2>&1 || die "本机没有 git"
  REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$SCRIPT_DIR")"
  LOCAL_SCRIPT="$REPO_ROOT/$(basename "$SCRIPT_PATH")"
  [ -f "$LOCAL_SCRIPT" ] || die "找不到本地脚本：$LOCAL_SCRIPT"

  step "1/3 检查工作区"
  local dirty
  dirty="$(git -C "$REPO_ROOT" status --porcelain)"
  if [ -n "$dirty" ]; then
    if [ "$ALLOW_DIRTY" = "1" ]; then
      warn "工作区有未提交改动（本次上线【不包含】这些改动）："
      printf '%s\n' "$dirty" | sed 's/^/      /'
    else
      die "工作区有未提交改动，上线后线上仍是旧代码。请先 commit，或加 --allow-dirty 跳过"
    fi
  else
    ok "工作区干净"
  fi

  step "2/3 推送到 origin/$BRANCH"
  if [ "$NO_PUSH" = "1" ]; then
    warn "已指定 --no-push，改为由服务器自行 fetch origin"
  else
    git -C "$REPO_ROOT" push origin "HEAD:$BRANCH" || die "git push 失败（检查凭证，或远端有新提交需要先 pull）"
    ok "已推送 $(git -C "$REPO_ROOT" rev-parse --short HEAD) → origin/$BRANCH"
  fi

  step "3/3 经 SSH 触发服务器部署"
  local remote_tmp extra=""
  [ "$NO_ROLLBACK" = "1" ] && extra="$extra --no-rollback"
  [ "$DO_PULL" = "1" ] && extra="$extra --pull"
  [ -n "$HEALTH_TIMEOUT_OVERRIDE" ] && extra="$extra --timeout $HEALTH_TIMEOUT_OVERRIDE"
  remote_tmp="/tmp/pw-deploy-$$.sh"
  scp -q "$LOCAL_SCRIPT" "$SSH_HOST:$remote_tmp" \
    || die "scp 失败：SSH 免密是否正常？先试 ssh $SSH_HOST true"
  # Windows 上保存的脚本可能是 CRLF，落到 Linux 会报 "$'\r': command not found"，
  # 所以先 tr 掉 \r 再执行；远端跑完始终清理临时脚本，并把退出码原样带回本地
  ssh "$SSH_HOST" "tr -d '\r' < $remote_tmp > $remote_tmp.lf && mv $remote_tmp.lf $remote_tmp && bash $remote_tmp --server$extra; rc=\$?; rm -f $remote_tmp $remote_tmp.lf; exit \$rc" \
    || die "服务器上的部署失败（已尝试回滚，详情见上方输出）"
  ok "远端部署流程结束"
  return 0
}

# ------------------------------ 入口 ------------------------------
if [ "$MODE" = "auto" ]; then
  # 在服务器上（登着 SSH 或 /opt/personal-website 存在）→ 服务器模式；否则本机模式
  if [ -n "${SSH_CONNECTION:-}" ] || [ -d "$REMOTE_DIR/.git" ]; then MODE="server"; else MODE="local"; fi
fi

if [ "$MODE" = "server" ]; then
  step "模式：server（在 $REMOTE_DIR 上直接部署）"
  server_deploy
else
  step "模式：local（本机 → $SSH_HOST:$REMOTE_DIR）"
  local_deploy
fi
