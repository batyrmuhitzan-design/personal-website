#!/usr/bin/env bash
# ==========================================================================
#  莎莎 · 个人主页 —— 842MB 小内存服务器「瘦身清理」脚本
#
#  背景：这台 2 vCPU / 842MB 的 Azure 机上同时跑着 MariaDB、Redis、NodeBB、
#        uvicorn（宿主进程）、发卡站、OpenResty 和本项目容器，内存耗尽后
#        进入 swap 抖动 → 整机用户态卡死（内核还回 SYN-ACK，但没有任何
#        服务能应答）。本脚本把「本项目不需要」的服务停掉并删除，只保留：
#          personal-website + music-api + OpenResty(1Panel) + SSH + Docker
#
#  用法（默认只体检，不改任何东西）：
#    bash scripts/slim-server.sh                            # 体检
#    bash scripts/slim-server.sh --apply                    # 执行，逐项 y/N 确认
#    bash scripts/slim-server.sh --apply --yes              # 全自动（删卷仍需手输短语）
#    bash scripts/slim-server.sh --apply --keep-containers  # 只清垃圾，不动容器
#    bash scripts/slim-server.sh --apply --containers-only  # 只处理容器
#    bash scripts/slim-server.sh --apply --prune-volumes    # 额外删「未使用」数据卷（危险）
#    bash scripts/slim-server.sh -h
#
#  安全红线（与 AGENT_GUIDE.md 第 12 节一致，由脚本强制）：
#    1) 永不删除 personal-website / music-api / OpenResty / nginx / 1Panel 容器
#    2) 永不执行 docker system prune -a（会连别的项目的镜像一起清掉）
#    3) 默认不碰数据卷；--prune-volumes 必须手输 DELETE-VOLUMES
#       （shasha_mysql_data 里是发卡站的真实交易数据，脚本对它永不删除）
#    4) 不动 SSH / Docker 守护进程本身
#    5) 先抓崩溃证据（OOM 内核日志）再清日志，避免把证据一起删掉
#    6) 用 docker stop + docker rm（不用 rm -f），数据卷全部保留
#
#  可用的环境变量（都有安全默认值，一般不用设）：
#    SLIM_REPORT_DIR      证据/报告输出目录，默认 /root/slim-report-<时间戳>
#    SLIM_PROTECT_DIRS    绝不在其中执行 compose down 的目录，默认 /opt/personal-website
#    ENV_FILE             读取配置用的 .env 路径，默认 <仓库>/.env
#
#  退出码：0 = 完成 / 1 = 有关键步骤失败 / 2 = 参数错误 / 3 = 环境不满足
# ==========================================================================

set -uo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" 2>/dev/null && pwd || printf '%s' "$PWD")"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd || printf '%s' "$SCRIPT_DIR")"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"

APPLY=0
ASSUME_YES=0
KEEP_CONTAINERS=0
CONTAINERS_ONLY=0
PRUNE_VOLUMES=0
ALLOW_PANEL=0

usage() {
  cat <<'USAGE'
莎莎 · 个人主页 —— 842MB 小内存服务器瘦身脚本

用法（默认只体检、不做任何改动）：
  bash scripts/slim-server.sh                            # 体检：列出容器/镜像/卷/内存/磁盘
  bash scripts/slim-server.sh --apply                    # 执行瘦身，逐项 y/N 确认
  bash scripts/slim-server.sh --apply --yes              # 全自动（删数据卷仍需手输短语）
  bash scripts/slim-server.sh --apply --keep-containers  # 只清垃圾，不动任何容器
  bash scripts/slim-server.sh --apply --containers-only  # 只处理容器，不清系统垃圾
  bash scripts/slim-server.sh --apply --prune-volumes    # 额外删「未使用」数据卷（危险）
  bash scripts/slim-server.sh -h | --help

说明：
  --apply 默认逐项 y/N 确认；--yes 全自动（删数据卷仍需手输 DELETE-VOLUMES）
  --allow-panel 才会把 1Panel 面板容器也纳入可删范围（默认保护；不建议用）

保留（永不删除）：personal-website、music-api、OpenResty/nginx/1Panel、SSH、Docker
可删（本项目无依赖，已核对源码与 compose）：shasha-faka-*、kaznu-nodebb-*、
  *redis*、*mysql*/*mariadb*、uvicorn(Python 服务) 等

安全红线：不执行 docker system prune -a；默认不删数据卷；
  shasha_mysql_data（真实交易数据）在任何模式下都不会被删除。
退出码：0 成功 / 1 有关键步骤失败 / 2 参数错误 / 3 环境不满足
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)           APPLY=1 ;;
    --dry-run|--check) APPLY=0 ;;
    --yes|-y)          ASSUME_YES=1 ;;
    --keep-containers) KEEP_CONTAINERS=1 ;;
    --containers-only) CONTAINERS_ONLY=1 ;;
    --prune-volumes)   PRUNE_VOLUMES=1 ;;
    --allow-panel)     ALLOW_PANEL=1 ;;
    -h|--help)         usage; exit 0 ;;
    *) printf '未知参数：%s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

# ------------------------------ 读取 .env ------------------------------
if [ -f "$ENV_FILE" ]; then
  ENV_TMP="$(mktemp 2>/dev/null || printf '%s/.env.tmp' "$SCRIPT_DIR")"
  tr -d '\r' < "$ENV_FILE" > "$ENV_TMP" 2>/dev/null || true
  set -a
  # shellcheck disable=SC1090
  . "$ENV_TMP" 2>/dev/null || true
  set +a
  rm -f "$ENV_TMP"
fi
LOCAL_PORT="${AGENT_LOCAL_PORT:-8881}"
PUBLIC_URL="${SITE_PUBLIC_URL:-https://i.1losion.me}"

# ------------------------------ 输出封装 ------------------------------
if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'
  C_HEAD=$'\033[36m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_HEAD=""; C_DIM=""; C_RESET=""
fi

FAILED=0
sect() { printf '\n%s════ %s ════%s\n' "$C_HEAD" "$*" "$C_RESET"; }
sub()  { printf '\n%s── %s ──%s\n' "$C_DIM" "$*" "$C_RESET"; }
info() { printf '   %s\n' "$*"; }
ok()   { printf '  %s[ ok ]%s %s\n' "$C_OK" "$C_RESET" "$*"; }
warn() { printf '  %s[warn]%s %s\n' "$C_WARN" "$C_RESET" "$*"; }
fail() { printf '  %s[fail]%s %s\n' "$C_ERR" "$C_RESET" "$*" >&2; }
die()  { fail "$*"; exit "${2:-1}"; }
note_fail() { FAILED=$((FAILED + 1)); fail "$*"; }
show() { printf '  %s$ %s%s\n' "$C_DIM" "$*" "$C_RESET"; }
run()  { show "$@"; "$@"; }

# confirm "<动作描述>"  体检模式永远返回 1（不做），--yes 直接同意
confirm() {
  local desc="$1" a=""
  if [ "$APPLY" != "1" ]; then
    printf '  %s[跳过]%s %s（体检模式不改动；要执行请加 --apply）\n' "$C_DIM" "$C_RESET" "$desc"
    return 1
  fi
  if [ "$ASSUME_YES" = "1" ]; then
    printf '  %s[自动同意]%s %s\n' "$C_OK" "$C_RESET" "$desc"
    return 0
  fi
  printf '  %s?%s %s [y/N] ' "$C_WARN" "$C_RESET" "$desc"
  read -r a || true
  case "$a" in
    y|Y|yes|YES) return 0 ;;
    *) printf '  %s[跳过]%s\n' "$C_DIM" "$C_RESET"; return 1 ;;
  esac
}

HOST="$(hostname 2>/dev/null || printf 'server')"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="${SLIM_REPORT_DIR:-/root/slim-report-$STAMP}"

# --------------------------- 容器分类规则 ---------------------------
# 保护名单（小写子串匹配）：本项目 + 反代 + 面板
PROTECT_LIST="personal-website music-api openresty nginx portainer watchtower"
[ "$ALLOW_PANEL" = "1" ] || PROTECT_LIST="$PROTECT_LIST 1panel"
# 可删名单：发卡 / 论坛 / 数据库 / 缓存 / Python 服务（本项目均无依赖）
REMOVE_LIST="faka nodebb redis mysql mariadb postgres uvicorn kaznu"
# 数据卷永删名单（真实数据）：即使 --prune-volumes 也不删
VOLUME_KEEP_LIST="shasha kaznu mysql maria nodebb faka 1panel"
# 不归本项目、但由 1Panel 面板编排管理的目录（不在里面乱跑 compose down；可用环境变量覆盖，便于测试）
FORBIDDEN_DIRS="${SLIM_PROTECT_DIRS:-/opt/personal-website}"

is_protected() {
  local n; n="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  local p
  for p in $PROTECT_LIST; do case "$n" in *"$p"*) return 0 ;; esac; done
  return 1
}
is_removable() {
  local n; n="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  local p
  for p in $REMOVE_LIST; do case "$n" in *"$p"*) return 0 ;; esac; done
  return 1
}
volume_is_kept() {
  local n; n="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  local p
  for p in $VOLUME_KEEP_LIST; do case "$n" in *"$p"*) return 0 ;; esac; done
  return 1
}
dir_is_forbidden() {
  local d="$1" p
  for p in $FORBIDDEN_DIRS; do [ "$d" = "$p" ] && return 0; done
  return 1
}
# 该目录里是否还挂着受保护容器（本项目/反代）——比路径判断更可靠，防止路径变更导致 fail-open
dir_has_protected_owner() {
  local d="$1" p
  for p in ${PROTECT_DIRS[@]:-}; do [ "$p" = "$d" ] && return 0; done
  return 1
}

# ============================ 0. 环境预检 ============================
sect "0. 环境预检"
printf '  主机 %s   时间 %s   报告目录 %s\n' "$HOST" "$(date -Is 2>/dev/null || date)" "$REPORT_DIR"
if [ "$(id -u 2>/dev/null || printf 1)" != "0" ]; then
  warn "当前不是 root，docker/systemctl/journalctl 可能需要 sudo；建议用 root 跑本脚本"
fi
command -v docker >/dev/null 2>&1 || die "找不到 docker，本脚本必须在服务器上执行（退出码 3）" 3
if command -v timeout >/dev/null 2>&1; then
  DOCKER_INFO_OK="$(timeout 20 docker info >/dev/null 2>&1 && printf 1 || printf 0)"
else
  DOCKER_INFO_OK="$(docker info >/dev/null 2>&1 && printf 1 || printf 0)"
fi
if [ "$DOCKER_INFO_OK" != "1" ]; then
  die "docker 无响应（机器可能还在卡死/swap 抖动）。
       先重启实例或经 Azure 串行控制台处理，等 'docker info' 能返回后再跑本脚本。" 3
fi
ok "docker 可用：$(docker --version 2>/dev/null | head -n 1)"
if [ "$APPLY" = "1" ]; then
  warn "本次是【执行模式】：会对无关容器执行 stop + rm（不含数据卷）"
else
  info "本次是【体检模式】：只读，不会做任何改动（加 --apply 才执行）"
fi

mkdir -p "$REPORT_DIR" 2>/dev/null || REPORT_DIR="$PWD/slim-report-$STAMP"
mkdir -p "$REPORT_DIR" 2>/dev/null || true

# ======================= 1. 抓崩溃证据（务必在清日志前） =======================
sect "1. 抓取本次卡死的证据（先留证，再清理）"
OOM_OUT="$REPORT_DIR/oom-evidence.txt"
{
  printf '# 生成时间: %s   主机: %s\n' "$(date -Is 2>/dev/null || date)" "$HOST"
  printf '\n## uptime\n';        uptime 2>&1
  printf '\n## free -m\n';       free -m 2>&1
  printf '\n## swapon --show\n'; swapon --show 2>&1
  printf '\n## df -h /\n';       df -h / 2>&1
  printf '\n## top 15 内存进程\n'
  ps -eo pid,ppid,%mem,rss,etime,args --sort=-%mem 2>&1 | head -n 16
  printf '\n## dmesg 中的 OOM 记录\n'
  dmesg -T 2>/dev/null | grep -iE 'out of memory|oom-kill|killed process|oom_reaper' | tail -40
  printf '\n## journalctl -k -b -1（上一次启动）中的 OOM 记录\n'
  journalctl -k -b -1 --no-pager 2>/dev/null | grep -iE 'out of memory|oom-kill|killed process|oom_reaper' | tail -60
  printf '\n## journalctl -k -b 0（本次启动）中的 OOM 记录\n'
  journalctl -k -b 0 --no-pager 2>/dev/null | grep -iE 'out of memory|oom-kill|killed process|oom_reaper' | tail -20
  printf '\n## 容器 OOMKilled / 重启次数\n'
  for cid in $(docker ps -aq 2>/dev/null); do
    docker inspect -f '{{.Name}} restarts={{.RestartCount}} oomKilled={{.State.OOMKilled}} exit={{.State.ExitCode}} status={{.State.Status}}' "$cid" 2>/dev/null
  done
  printf '\n## 全部容器快照\n'
  docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null
} > "$OOM_OUT" 2>&1
if grep -qiE 'out of memory|oom-kill|killed process' "$OOM_OUT" 2>/dev/null; then
  ok "找到内核 OOM 记录 → 证据已存 $OOM_OUT"
  grep -iE 'out of memory|oom-kill|killed process' "$OOM_OUT" | tail -n 5 | sed 's/^/     /'
else
  warn "没抓到 OOM 记录（也可能是磁盘写满/IO 卡死）；完整快照在 $OOM_OUT"
fi

# ============================ 2. 当前状态体检 ============================
sect "2. 当前状态（只读）"
sub "内存 / swap / 磁盘"
run free -m
command -v swapon >/dev/null 2>&1 && run swapon --show
run df -h /
sub "全部容器（含已停止）"
run docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
sub "镜像"
run docker images --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}'
sub "数据卷"
run docker volume ls
sub "Docker 空间占用"
run docker system df
sub "各容器当前内存占用"
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null || warn "docker stats 取不到（容器可能都在重启）"
sub "宿主 Top 内存进程（uvicorn 之类是宿主进程，不在容器里）"
ps -eo pid,%mem,rss,etime,args --sort=-%mem 2>/dev/null | head -n 16 || true
sub "监听端口（本项目相关 + 其它项目）"
(ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null) \
  | grep -E ':(22|80|443|3306|4567|6379|8000|8080|8881|8882|39888)\b' || info "（没抓到监听行）"
sub "磁盘占用 Top 目录"
du -xh --max-depth=1 / 2>/dev/null | sort -h | tail -n 12 || true

# ======================= 3. 容器分类 + 归属（防自动拉起） =======================
sect "3. 容器分类（决定谁会被 stop + rm）"
ALL_CONTAINERS=()
while IFS= read -r line; do [ -n "$line" ] && ALL_CONTAINERS+=("$line"); done \
  < <(docker ps -a --format '{{.Names}}' 2>/dev/null)

KEEP_LIST=(); REMOVE_LIST_C=(); UNKNOWN_LIST=()
COMPOSE_DIRS=(); PROTECT_DIRS=()
for c in "${ALL_CONTAINERS[@]:-}"; do
  [ -n "$c" ] || continue
  wd="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$c" 2>/dev/null || true)"
  [ "$wd" = "<no value>" ] && wd=""
  if is_protected "$c"; then
    KEEP_LIST+=("$c")
    [ -n "$wd" ] && PROTECT_DIRS+=("$wd")
  elif is_removable "$c"; then
    REMOVE_LIST_C+=("$c")
  else
    UNKNOWN_LIST+=("$c")
  fi
  if [ -n "$wd" ] && [ "$wd" != "null" ]; then
    found=0
    for d in "${COMPOSE_DIRS[@]:-}"; do [ "$d" = "$wd" ] && found=1; done
    [ "$found" = "0" ] && COMPOSE_DIRS+=("$wd")
  fi
done

info "【保护 · 永不删除】${KEEP_LIST[*]:-（无）}"
info "【本项目无关 · 可删】${REMOVE_LIST_C[*]:-（无）}"
info "【未分类 · 需人工判断】${UNKNOWN_LIST[*]:-（无）}"

if [ "${#REMOVE_LIST_C[@]}" -gt 0 ]; then
  sub "待删容器的明细（镜像 / 状态 / 重启策略）"
  for c in "${REMOVE_LIST_C[@]}"; do
    printf '   %-24s image=%-34s status=%-24s restart=%s\n' "$c" \
      "$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null)" \
      "$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)" \
      "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$c" 2>/dev/null)"
  done
fi

if [ "${#COMPOSE_DIRS[@]}" -gt 0 ]; then
  sub "这些容器由 compose / 1Panel 编排管理（只删容器会被自动拉起）"
  for d in "${COMPOSE_DIRS[@]}"; do
    if dir_is_forbidden "$d"; then
      info "$d   ← 本项目目录，绝对不动"
    else
      info "$d   （用 'cd $d && docker compose down' 停掉整个项目；不带 -v 不会删数据卷）"
    fi
  done
  warn "如果 1Panel 面板里把某些项目设成了「自启动」，光删容器不够，还要在面板里停用该项目"
fi

# ==================== 4. 停用并删除「本项目无关」容器 ====================
sect "4. 停用并删除无关容器（docker stop + docker rm，不用 -f）"
STOPPED_COUNT=0
if [ "$KEEP_CONTAINERS" = "1" ]; then
  info "已指定 --keep-containers：跳过整个容器处理环节"
elif [ "${#REMOVE_LIST_C[@]}" -eq 0 ]; then
  ok "没有需要删除的容器"
else
  for c in "${REMOVE_LIST_C[@]}"; do
    if is_protected "$c"; then
      warn "$c 命中保护规则，跳过（不会发生，仅为兜底）"
      continue
    fi
    img="$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null)"
    st="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)"
    info "→ $c   image=$img   status=$st"
    if confirm "stop + rm 容器 $c（数据卷保留）"; then
      if run docker stop -t 20 "$c"; then
        ok "已停止 $c"
      else
        note_fail "docker stop $c 失败（可能已经在停止中）"
      fi
      if run docker rm "$c"; then
        ok "已删除容器 $c"
        STOPPED_COUNT=$((STOPPED_COUNT + 1))
      else
        note_fail "docker rm $c 失败：容器可能仍在运行，请查看 docker ps"
      fi
    fi
  done
  for c in "${UNKNOWN_LIST[@]:-}"; do
    [ -n "$c" ] || continue
    warn "未分类容器 $c 未自动处理；确认它不属于本项目后，手动执行：docker stop $c && docker rm $c"
  done
  ok "本轮共删除容器 $STOPPED_COUNT 个"
fi

# ============ 5. 阻止 compose / 1Panel 把删掉的容器再拉起来 ============
sect "5. 阻止被自动拉起（compose 项目目录）"
if [ "$KEEP_CONTAINERS" = "1" ]; then
  info "已指定 --keep-containers：跳过（不动任何容器）"
elif [ "${#COMPOSE_DIRS[@]}" -eq 0 ]; then
  info "没有发现带 compose 标签的容器"
else
  for d in "${COMPOSE_DIRS[@]}"; do
    if dir_is_forbidden "$d"; then
      info "$d ← 本项目目录（$FORBIDDEN_DIRS），跳过：绝不在这里跑 compose down"
      continue
    fi
    if dir_has_protected_owner "$d"; then
      info "$d ← 这里还挂着受保护容器（本项目/反代），跳过：绝不在这里跑 compose down"
      continue
    fi
    if [ ! -f "$d/docker-compose.yml" ] && [ ! -f "$d/docker-compose.yaml" ] && [ ! -f "$d/compose.yml" ]; then
      warn "$d 里找不到 compose 文件，跳过（可能已删除或由面板生成）"
      continue
    fi
    info "项目目录：$d"
    if confirm "在 $d 执行 'docker compose down'（停容器 + 网络，保留数据卷）"; then
      if ( cd "$d" && run docker compose down ); then
        ok "已停用 $d 对应的项目"
      else
        note_fail "在 $d 执行 docker compose down 失败"
      fi
    fi
  done
  warn "若 1Panel 面板里把项目设为自启动，还需在面板【容器 → 编排】里停用/删除该项目，否则重启后会回来"
fi

# ==================== 6. 宿主进程（uvicorn 等非容器服务） ====================
sect "6. 宿主上的其它服务（uvicorn 等不是容器，删容器不影响它）"
OTHER_PORTS="8000 4567 8882 3306 6379"
if [ "$KEEP_CONTAINERS" = "1" ]; then
  info "已指定 --keep-containers：跳过宿主服务检查"
elif ! command -v ss >/dev/null 2>&1 && ! command -v netstat >/dev/null 2>&1; then
  warn "没有 ss/netstat，跳过宿主端口检查"
else
  FOUND_HOST_SVC=0
  for p in $OTHER_PORTS; do
    line="$( (ss -lntp 2>/dev/null || netstat -lntp 2>/dev/null) | grep -E "[:.]$p\b" | head -n 1 )"
    [ -n "$line" ] || continue
    pid="$(printf '%s' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n 1)"
    [ -n "$pid" ] || pid="$(printf '%s' "$line" | awk '{print $NF}' | sed -n 's/.*\/\([0-9][0-9]*\)$/\1/p')"
    [ -n "$pid" ] || continue
    comm="$(ps -o comm= -p "$pid" 2>/dev/null | tr -d ' ')"
    unit="$(cat "/proc/$pid/cgroup" 2>/dev/null | sed -n 's#.*/\([^/]*\.service\)$#\1#p' | head -n 1)"
    cg="$(cat "/proc/$pid/cgroup" 2>/dev/null | tr '\n' ' ')"
    printf '   端口 %-5s pid=%-7s comm=%-18s unit=%s\n' "$p" "$pid" "$comm" "${unit:-（无 systemd unit）}"
    case "$cg" in
      *docker*|*containerd*)
        info "     ↑ 属于容器的端口映射，由第 4/5 步处理，这里不动"
        continue
        ;;
    esac
    FOUND_HOST_SVC=1
    if [ -n "$unit" ] && command -v systemctl >/dev/null 2>&1; then
      if confirm "停用宿主服务 $unit（systemctl disable --now $unit）"; then
        if run systemctl disable --now "$unit"; then
          ok "已停用 $unit"
        else
          note_fail "systemctl disable --now $unit 失败"
        fi
      fi
    else
      warn "端口 $p 由宿主进程 pid=$pid（$comm）占用且无 systemd unit；确认无用后手动 kill：kill $pid"
    fi
  done
  [ "$FOUND_HOST_SVC" = "0" ] && info "其它项目端口上没有发现独立的宿主服务"
fi

# ==================== 7. Docker 垃圾清理（不动数据卷） ====================
sect "7. Docker 垃圾清理（构建缓存 / 悬空镜像 / 已停容器 / 无用网络）"
if [ "$CONTAINERS_ONLY" = "1" ]; then
  info "已指定 --containers-only：跳过 Docker 垃圾清理"
else
  sub "清理前"
  run docker system df
  if confirm "docker builder prune -f（清构建缓存，通常是最大的一块）"; then
    run docker builder prune -f || note_fail "builder prune 失败"
  fi
  if confirm "docker image prune -f（只删 <none> 悬空镜像，不动有标签的镜像）"; then
    run docker image prune -f || note_fail "image prune 失败"
  fi
  if confirm "docker network prune -f（删没有容器在用的网络）"; then
    run docker network prune -f || note_fail "network prune 失败"
  fi
  if confirm "docker system prune -f（已停容器 + 悬空镜像 + 无用网络 + 构建缓存；不含数据卷、不是 -a）"; then
    run docker system prune -f || note_fail "system prune 失败"
  fi
  warn "刻意不执行 'docker system prune -a' 和 'docker volume prune'：会连别的项目的镜像/数据卷一起清掉，是 AGENT_GUIDE 的明确红线"
  sub "清理后"
  run docker system df
  run df -h /
fi

# ==================== 8. 数据卷（默认只看不动） ====================
sect "8. 数据卷（默认只列不删）"
run docker volume ls
DANGLING_VOLUMES="$(docker volume ls -qf dangling=true 2>/dev/null || true)"
if [ -n "$DANGLING_VOLUMES" ]; then
  info "未挂在任何容器上的卷："
  printf '%s\n' "$DANGLING_VOLUMES" | sed 's/^/     /'
else
  info "没有「未使用」的卷"
fi
if [ "$APPLY" != "1" ]; then
  info "体检模式：不删卷"
elif [ "$PRUNE_VOLUMES" != "1" ]; then
  warn "未加 --prune-volumes，一个卷都不会删"
  info "删卷前请确认里面没有要留的数据；尤其 shasha_mysql_data 是发卡站的真实交易数据"
else
  warn "已启用 --prune-volumes：准备删除「未使用」的数据卷"
  SAFE_TO_DELETE=""
  for v in $DANGLING_VOLUMES; do
    if volume_is_kept "$v"; then
      warn "跳过 $v（命中真实数据保护名单，脚本永远不删它；确需删除请手动执行 docker volume rm $v）"
    else
      SAFE_TO_DELETE="$SAFE_TO_DELETE $v"
    fi
  done
  if [ -z "${SAFE_TO_DELETE// /}" ]; then
    ok "没有可安全删除的卷"
  else
    info "将被删除的卷：$SAFE_TO_DELETE"
    printf '  请输入 DELETE-VOLUMES 确认（其它任何输入 = 放弃）：'
    read -r phrase || true
    if [ "$phrase" = "DELETE-VOLUMES" ]; then
      for v in $SAFE_TO_DELETE; do
        run docker volume rm "$v" || note_fail "docker volume rm $v 失败"
      done
      ok "卷清理完成"
    else
      warn "输入不匹配，已放弃删卷"
    fi
  fi
fi

# ==================== 9. 系统垃圾（journald / apt / 临时文件） ====================
sect "9. 系统垃圾（journald / apt / 临时文件）"
if [ "$CONTAINERS_ONLY" = "1" ]; then
  info "已指定 --containers-only：跳过系统垃圾清理"
else
  sub "清理前"
  run df -h /
  [ -d /var/log/journal ] && info "journald 目录大小：$(du -sh /var/log/journal 2>/dev/null | cut -f1)"
  if command -v journalctl >/dev/null 2>&1; then
    if confirm "journalctl --vacuum-size=100M（把日志压到 100MB；OOM 证据已在第 1 步另存）"; then
      run journalctl --vacuum-size=100M || note_fail "journald 清理失败"
    fi
  else
    warn "没有 journalctl，跳过日志清理"
  fi
  if confirm "删除 /tmp 中 3 天前、/var/tmp 中 7 天前的文件"; then
    run find /tmp -xdev -type f -mtime +3 -delete 2>/dev/null || true
    run find /var/tmp -xdev -type f -mtime +7 -delete 2>/dev/null || true
    ok "临时文件清理完成"
  fi
  if command -v apt-get >/dev/null 2>&1; then
    if confirm "清理 apt 缓存（apt-get clean + autoclean + 删 .deb 包）"; then
      run apt-get clean || note_fail "apt-get clean 失败"
      run apt-get autoclean || note_fail "apt-get autoclean 失败"
      run find /var/cache/apt/archives -maxdepth 1 -name '*.deb' -delete 2>/dev/null || true
      ok "apt 缓存清理完成"
    fi
    info "以下软件包可自动卸载（仅提示，本脚本不执行 autoremove）："
    apt-get autoremove --dry-run 2>/dev/null | grep -E '^[A-Z]' | head -n 6 || true
  else
    warn "没有 apt-get（非 Debian 系），跳过"
  fi
  sub "清理后"
  run df -h /
fi

# ==================== 10. 验证：本站必须还活着 ====================
sect "10. 验证（本项目与反代必须还活着）"
for c in personal-website music-api; do
  st="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || printf 'missing')"
  case "$st" in
    running) ok "$c 正在运行" ;;
    missing) warn "$c 不存在（这台机器上可能还没部署本站）" ;;
    *)       warn "$c 状态=$st，尝试启动"; run docker start "$c" || note_fail "启动 $c 失败" ;;
  esac
done

OR_CT="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'openresty|nginx' | head -n 1)"
if [ -n "$OR_CT" ]; then
  ok "反向代理容器在运行：$OR_CT"
  if docker exec "$OR_CT" openresty -t >/dev/null 2>&1; then
    ok "OpenResty 配置语法 ok"
  elif docker exec "$OR_CT" nginx -t >/dev/null 2>&1; then
    ok "nginx 配置语法 ok"
  else
    warn "反代配置校验没跑通（容器内可能没有 openresty/nginx 命令），请在 1Panel 里人工确认"
  fi
else
  warn "没找到在运行的 OpenResty/nginx 容器 → 80/443 现在没人监听，公网会 502/超时！"
fi

if command -v curl >/dev/null 2>&1; then
  body="$(curl -fsS -m 5 "http://127.0.0.1:$LOCAL_PORT/healthz" 2>/dev/null || true)"
  if [ "$body" = "ok" ]; then
    ok "本机探针 http://127.0.0.1:$LOCAL_PORT/healthz → ok"
  else
    note_fail "本机探针未通过（响应：${body:-空}）→ 用 'cd /opt/personal-website && docker compose logs --tail=100' 看日志"
  fi
  mbody="$(curl -fsS -m 5 "http://127.0.0.1:$LOCAL_PORT/music/api/health" 2>/dev/null || true)"
  case "$mbody" in
    *'"ok":true'*) ok "音乐 API 探针正常" ;;
    *) warn "音乐 API 探针异常：${mbody:-（空）}" ;;
  esac
  if [ -n "$PUBLIC_URL" ]; then
    code="$(curl -o /dev/null -sS -m 10 -w '%{http_code}' "$PUBLIC_URL/healthz" 2>/dev/null || printf '000')"
    if [ "$code" = "200" ]; then
      ok "公网探针 $PUBLIC_URL/healthz → 200"
    else
      warn "公网探针返回 $code（DNS 未生效或证书未就绪时会出现 000）"
    fi
  fi
else
  warn "没有 curl，跳过探针"
fi

# ==================== 11. 结果汇总 ====================
sect "11. 结果汇总"
run free -m
run df -h /
printf '\n  报告文件：%s\n' "$REPORT_DIR"
printf '  容器：保留 %s 个，删除 %s 个\n' "${#KEEP_LIST[@]}" "$STOPPED_COUNT"
cat <<'TIP'

  后续建议（按需执行，能显著降低再次卡死的概率）：
   1) 降低 swap 抢占：/etc/sysctl.conf 里加 vm.swappiness=10 然后 sysctl -p
   2) 限制日志体积：/etc/systemd/journald.conf 设 SystemMaxUse=100M 然后重启 systemd-journald
   3) 不要在服务器上构建：前端在本地/CI 构建好再传镜像，842MB 的机器扛不住 node 构建
   4) compose 加日志轮转（logging.options.max-size/max-file）与 mem_limit
   5) 加看门狗：每 5 分钟探 127.0.0.1:8881/healthz，连续 3 次失败就 docker compose up -d --force-recreate
TIP

if [ "$FAILED" -gt 0 ]; then
  printf '\n  %s有 %s 个步骤失败，请看上面 [fail] 行%s\n' "$C_ERR" "$FAILED" "$C_RESET"
  exit 1
fi
if [ "$APPLY" != "1" ]; then
  printf '\n  %s体检完成：本次没有做任何改动。确认无误后执行：%sbash scripts/slim-server.sh --apply\n' "$C_WARN" "$C_RESET"
else
  printf '\n  %s瘦身完成。%s\n' "$C_OK" "$C_RESET"
fi
exit 0





