#!/usr/bin/env bash
# ==========================================================================
#  莎莎 · 个人主页 —— Agent 环境自检（环境变量 / DeepSeek 端点 / SSH / 容器 / 站点）
#
#  用途：DeepSeek Agent 或人动手之前先跑一遍，一次看清「配置齐不齐、链路通不通」。
#        纯 bash + curl + ssh，无第三方依赖，服务器与开发机都能跑。
#
#  用法：
#    bash scripts/agent-check.sh            # 全量：本机配置 + DeepSeek/NIM API + SSH + 容器 + 站点
#    bash scripts/agent-check.sh --no-api   # 跳过需要密钥的 API 调用
#    bash scripts/agent-check.sh --local    # 跳过所有 SSH 远端检查（离线排障用）
#    bash scripts/agent-check.sh -h
#
#  退出码：0 = 关键项全通过；1 = 有 [FAIL]；警告项（内存/磁盘/线上版本不一致）不影响退出码。
# ==========================================================================

set -uo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" 2>/dev/null && pwd || printf '%s' "$PWD")"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd || printf '%s' "$SCRIPT_DIR")"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

NO_API=0
SKIP_REMOTE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-api) NO_API=1 ;;
    --local)  SKIP_REMOTE=1 ;;
    -h|--help) sed -n '2,17p' "$SCRIPT_PATH" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0 ;;
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
API_CONTAINER="${AGENT_API_CONTAINER:-music-api}"
HEALTH_TIMEOUT="${AGENT_HEALTH_TIMEOUT:-120}"

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_HEAD=$'\033[36m'; C_RESET=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_HEAD=""; C_RESET=""
fi

PASS=0; FAIL=0; WARN=0; SKIP=0
sect() { printf '\n%s── %s ──%s\n' "$C_HEAD" "$*" "$C_RESET"; }
pass() { PASS=$((PASS + 1)); printf '  %s[OK]%s   %s\n'   "$C_OK"   "$C_RESET" "$*"; }
bad()  { FAIL=$((FAIL + 1)); printf '  %s[FAIL]%s %s\n'   "$C_ERR"  "$C_RESET" "$*"; }
warn() { WARN=$((WARN + 1)); printf '  %s[WARN]%s %s\n'   "$C_WARN" "$C_RESET" "$*"; }
skip() { SKIP=$((SKIP + 1)); printf '  [SKIP] %s\n' "$*"; }

# 密钥只显示前 7 位 + 后 4 位，避免把完整 key 写进日志/会话记录
mask() {
  local v="${1:-}"
  if [ -z "$v" ]; then printf '<空>'
  elif [ "${#v}" -le 14 ]; then printf '<已设置(%d 字符)>' "${#v}"
  else printf '%s...%s (%d 字符)' "${v:0:7}" "${v: -4}" "${#v}"; fi
}

# ============================ 1. 本机 .env ============================
sect "1. 本机环境变量（$ENV_FILE）"
if [ -f "$ENV_FILE" ]; then
  pass ".env 存在"
else
  bad ".env 不存在 → 执行 cp .env.example .env 并填入真实值"
fi
for k in DEEPSEEK_API_KEY DEEPSEEK_BASE_URL DEEPSEEK_MODEL \
         NVIDIA_NIM_API_KEY NVIDIA_NIM_BASE_URL NVIDIA_NIM_MODEL \
         AGENT_SSH_HOST AGENT_REMOTE_DIR AGENT_GIT_BRANCH SITE_PUBLIC_URL; do
  v="${!k:-}"
  if [ -z "$v" ]; then
    bad "$k 未设置"
  else
    case "$k" in
      *API_KEY*) pass "$k = $(mask "$v")" ;;
      *)         pass "$k = $v" ;;
    esac
  fi
done

# ======================= 2. DeepSeek 官方端点 =======================
sect "2. DeepSeek 官方端点（OpenAI 兼容协议）"
if [ "$NO_API" = "1" ]; then
  skip "已指定 --no-api"
elif [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  warn "没有 DEEPSEEK_API_KEY（不在 .env 里），跳过 API 调用"
else
  base="${DEEPSEEK_BASE_URL:-https://api.deepseek.com}"
  resp="$(curl -sS -m 25 -w $'\n%{http_code}' -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
          "$base/models" 2>&1 || true)"
  code="$(printf '%s' "$resp" | tail -n 1)"
  body="$(printf '%s' "$resp" | sed '$d')"
  case "$code" in
    200)
      models="$(printf '%s' "$body" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')"
      pass "GET $base/models → 200；可用模型：${models:-?}"
      ;;
    401|403) bad "GET $base/models → $code 鉴权失败：key 过期或写错" ;;
    000|"")  bad "GET $base/models → 连不上（网络/代理/域名解析）：$(printf '%s' "$body" | head -c 160)" ;;
    *)       bad "GET $base/models → HTTP $code：$(printf '%s' "$body" | head -c 200)" ;;
  esac

  # 真实跑一次最小对话（max_tokens=8，成本可忽略），确认 chat 通路真的能用
  if [ "$code" = "200" ]; then
    model="${DEEPSEEK_MODEL:-deepseek-chat}"
    payload="{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":8,\"stream\":false}"
    resp="$(curl -sS -m 40 -w $'\n%{http_code}' "$base/chat/completions" \
            -H "Authorization: Bearer $DEEPSEEK_API_KEY" -H 'Content-Type: application/json' \
            -d "$payload" 2>&1 || true)"
    code="$(printf '%s' "$resp" | tail -n 1)"
    body="$(printf '%s' "$resp" | sed '$d')"
    if [ "$code" = "200" ]; then
      pass "POST /chat/completions（$model）→ 200，对话端点可用"
    else
      bad "POST /chat/completions（$model）→ HTTP $code：$(printf '%s' "$body" | head -c 200)"
    fi
  fi
fi

# ======================= 3. NVIDIA NIM 备用端点 =======================
sect "3. NVIDIA NIM（备用 DeepSeek 端点）"
if [ "$NO_API" = "1" ]; then
  skip "已指定 --no-api"
elif [ -z "${NVIDIA_NIM_API_KEY:-}" ]; then
  warn "没有 NVIDIA_NIM_API_KEY，跳过（不影响主链路）"
else
  nbase="${NVIDIA_NIM_BASE_URL:-https://integrate.api.nvidia.com/v1}"
  resp="$(curl -sS -m 25 -w $'\n%{http_code}' -H "Authorization: Bearer $NVIDIA_NIM_API_KEY" \
          "$nbase/models" 2>&1 || true)"
  code="$(printf '%s' "$resp" | tail -n 1)"
  body="$(printf '%s' "$resp" | sed '$d')"
  if [ "$code" = "200" ]; then
    nmodels="$(printf '%s' "$body" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 | grep -i deepseek | head -5 | tr '\n' ' ')"
    pass "GET $nbase/models → 200；DeepSeek 系列：${nmodels:-<返回列表里没有 deepseek 字样>}"
  else
    warn "GET $nbase/models → HTTP $code（备用端点，不计入失败）：$(printf '%s' "$body" | head -c 160)"
  fi

# ======================= 4. SSH 免密与服务器状态 =======================
sect "4. SSH 免密与服务器状态"
REMOTE_OK=0
ON_SERVER=0
[ -d "$REMOTE_DIR/.git" ] && ON_SERVER=1

# 统一封装：在服务器上就跑本机命令，在开发机上就走 ssh
remote() {
  if [ "$ON_SERVER" = "1" ]; then bash -c "$1"
  else ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" "$1"
  fi
}

if [ "$SKIP_REMOTE" = "1" ]; then
  skip "已指定 --local，跳过远端检查"
elif [ "$ON_SERVER" = "1" ]; then
  pass "当前就在服务器上（$REMOTE_DIR），改用本机命令检查"
  REMOTE_OK=1
elif out="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$SSH_HOST" 'echo SSH_OK' 2>&1)" && [ "$out" = "SSH_OK" ]; then
  pass "ssh $SSH_HOST 免密登录可用（BatchMode，无需输入密码）"
  REMOTE_OK=1
else
  bad "ssh $SSH_HOST 免密失败：$(printf '%s' "$out" | head -c 200) → 查 ~/.ssh/config 与密钥权限"
fi

if [ "$REMOTE_OK" = "1" ]; then
  info="$(remote 'echo "HOST=$(hostname)"; echo "MEM_AVAIL_MB=$(free -m | sed -n 2p | tr -s " " | cut -d" " -f7)"; echo "DISK_AVAIL_KB=$(df -Pk / | sed -n 2p | tr -s " " | cut -d" " -f4)"' 2>/dev/null || true)"
  rhost="$(printf '%s\n' "$info" | sed -n 's/^HOST=//p')"
  rmem="$(printf '%s\n' "$info" | sed -n 's/^MEM_AVAIL_MB=//p')"
  rdisk="$(printf '%s\n' "$info" | sed -n 's/^DISK_AVAIL_KB=//p')"
  pass "服务器 $rhost 可达：可用内存 ${rmem:-?}MB，根分区可用 $(( ${rdisk:-0} / 1024 ))MB"
  [ "${rmem:-0}" -lt 200 ] && warn "可用内存 < 200MB：这台机器无法并发构建，先 docker builder prune -f 再构建"
  [ "${rdisk:-0}" -lt 3145728 ] && warn "根分区可用 < 3GB：建议 docker builder prune -f 清理构建缓存"

  ps="$(remote 'docker ps --format "{{.Names}}|{{.Status}}"' 2>/dev/null || true)"
  for c in "$WEB_CONTAINER" "$API_CONTAINER"; do
    line="$(printf '%s\n' "$ps" | grep "^$c|" || true)"
    if [ -z "$line" ]; then
      bad "容器 $c 未在运行 → 在服务器执行：cd $REMOTE_DIR && docker compose up -d"
    elif printf '%s' "$line" | grep -qi 'unhealthy'; then
      bad "容器 $c 状态 unhealthy → docker logs --tail=80 $c"
    elif printf '%s' "$line" | grep -qi 'healthy'; then
      pass "容器 $c：${line#*|}（healthy）"
    else
      warn "容器 $c 无健康状态：${line#*|}"
    fi
  done
  printf '  [INFO] 同机全部容器：\n'
  printf '%s\n' "$ps" | sed 's/^/         /'

  rsha="$(remote "git -C $REMOTE_DIR rev-parse --short HEAD" 2>/dev/null || true)"
  lsha="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
  rdirty="$(remote "git -C $REMOTE_DIR status --porcelain | wc -l" 2>/dev/null || true)"
  if [ -n "$rsha" ] && [ "$rsha" = "$lsha" ]; then
    pass "远端版本 = 本地 HEAD（$rsha），服务器副本与远端 $BRANCH 同步"
  elif [ -n "$rsha" ]; then
    warn "远端版本 $rsha ≠ 本地 HEAD ${lsha:-?}：本地有未推送/未部署的提交，跑 bash deploy.sh 同步"
  fi
  [ "${rdirty:-0}" != "0" ] && warn "服务器副本有 $rdirty 个本地改动（部署时会被 git reset --hard 覆盖）"

  body="$(remote "curl -fsS -m 5 http://127.0.0.1:$LOCAL_PORT/healthz" 2>/dev/null || true)"
  if [ "$body" = "ok" ]; then pass "服务器本机 http://127.0.0.1:$LOCAL_PORT/healthz → ok"
  else bad "服务器本机 /healthz 无响应（期望 ok，实际：${body:-<空>}）"; fi

  body="$(remote "curl -fsS -m 8 http://127.0.0.1:$LOCAL_PORT/music/api/health" 2>/dev/null || true)"
  case "$body" in
    *'"ok":true'*) pass "服务器本机 /music/api/health → 音乐解析服务正常" ;;
    *) bad "音乐解析服务异常：${body:-<空>}（docker logs --tail=80 $API_CONTAINER）" ;;
  esac

  rp="$(remote 'docker ps --format "{{.Names}}"' 2>/dev/null | grep -c 'openresty' || true)"
  if [ "${rp:-0}" -ge 1 ]; then pass "反代容器（1Panel OpenResty）在运行"
  else bad "没检测到 OpenResty 反代容器，公网访问会 502"; fi

  site_host="$(printf '%s' "$PUBLIC_URL" | sed -e 's#^https\?://##' -e 's#/.*$##')"
  if [ -n "$site_host" ]; then
    conf="$(remote "ls /opt/1panel/apps/openresty/openresty/www/sites/$site_host/proxy/*.conf 2>/dev/null | head -1" 2>/dev/null || true)"
    if [ -n "$conf" ]; then pass "反代片段存在：$conf"
    else warn "没找到 $site_host 的反代片段（1Panel 站点可能改名或未建）"; fi
  fi
fi

# ======================= 5. 公网访问与线上版本 =======================
sect "5. 公网访问与线上版本"
if [ -z "$PUBLIC_URL" ]; then
  warn "SITE_PUBLIC_URL 未设置，跳过公网检查"
else
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$PUBLIC_URL/healthz" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then pass "$PUBLIC_URL/healthz → 200"; else bad "$PUBLIC_URL/healthz → HTTP $code"; fi

  code="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$PUBLIC_URL/" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then pass "$PUBLIC_URL/ → 200"; else bad "$PUBLIC_URL/ → HTTP $code"; fi

  online="$(curl -fsS -m 15 "$PUBLIC_URL/" 2>/dev/null | grep -o 'static/js/main\.[A-Za-z0-9]*\.js' | head -1 || true)"
  localjs="$(ls "$REPO_ROOT"/build/static/js/main.*.js 2>/dev/null | head -1 || true)"
  if [ -n "$online" ] && [ -n "$localjs" ]; then
    if [ "$(basename "$localjs")" = "$(basename "$online")" ]; then
      pass "线上产物与本地 build/ 完全一致（$(basename "$online")）"
    else
      warn "线上 $(basename "$online") ≠ 本地 $(basename "$localjs")：本地有未部署的改动，或线上是旧版本"
    fi
  elif [ -n "$online" ]; then
    pass "线上入口脚本：$online（本地没有 build/，跳过一致性比对）"
  else
    bad "线上首页里找不到 static/js/main.*.js，反代或构建可能异常"
  fi
fi

# ======================= 汇总 =======================
printf '\n%s── 汇总 ──%s\n' "$C_HEAD" "$C_RESET"
printf '  通过 %d 项，失败 %d 项，警告 %d 项，跳过 %d 项\n' "$PASS" "$FAIL" "$WARN" "$SKIP"
if [ "$FAIL" -eq 0 ]; then
  printf '  %s关键检查全部通过 ✅%s\n' "$C_OK" "$C_RESET"
  exit 0
fi
printf '  %s有 %d 项关键检查未通过，请按上面的 [FAIL] 逐条修复 ✗%s\n' "$C_ERR" "$FAIL" "$C_RESET" >&2
exit 1

fi

