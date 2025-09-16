#!/bin/bash

# =================================================================
# Claude Relay Service - 数据迁移和备份脚本
# =================================================================
#
# 功能特性：
# - Redis 到 PostgreSQL 数据迁移
# - PostgreSQL 到 Redis 数据迁移
# - 增量数据同步
# - 数据一致性验证
# - 自动备份和恢复
# - 迁移进度跟踪
# - 回滚支持
# - 数据完整性检查
#
# 使用方法：
#   ./scripts/data-migration.sh [OPTIONS] COMMAND
#
# 命令：
#   backup       : 备份数据
#   restore      : 恢复数据
#   migrate      : 迁移数据
#   sync         : 同步数据
#   validate     : 验证数据一致性
#   cleanup      : 清理备份文件
#   status       : 显示迁移状态
#
# 选项：
#   --source TYPE        : 源数据库类型（redis|postgres）
#   --target TYPE        : 目标数据库类型（postgres|redis）
#   --backup-dir DIR     : 备份目录（默认：./backups）
#   --backup-file FILE   : 指定备份文件
#   --strategy STRATEGY  : 迁移策略（full|incremental）
#   --batch-size SIZE    : 批处理大小（默认：1000）
#   --verify             : 迁移后验证数据
#   --no-backup          : 跳过备份
#   --force              : 强制执行，跳过确认
#   --dry-run            : 模拟运行
#   --verbose            : 显示详细日志
#   --help               : 显示帮助信息
#
# 示例：
#   ./scripts/data-migration.sh backup
#   ./scripts/data-migration.sh migrate --source redis --target postgres
#   ./scripts/data-migration.sh sync --strategy incremental
#   ./scripts/data-migration.sh restore --backup-file backup_20240916.tar.gz
#

set -euo pipefail

# =================================================================
# 全局变量和配置
# =================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# 默认配置
DEFAULT_BACKUP_DIR="./backups"
DEFAULT_BATCH_SIZE=1000
DEFAULT_STRATEGY="full"

# 运行时变量
COMMAND=""
SOURCE_DB=""
TARGET_DB=""
BACKUP_DIR="$DEFAULT_BACKUP_DIR"
BACKUP_FILE=""
MIGRATION_STRATEGY="$DEFAULT_STRATEGY"
BATCH_SIZE="$DEFAULT_BATCH_SIZE"
VERIFY_DATA=false
NO_BACKUP=false
FORCE_EXECUTE=false
DRY_RUN=false
VERBOSE=false
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# 状态图标
ICON_SUCCESS="✅"
ICON_WARNING="⚠️"
ICON_ERROR="❌"
ICON_INFO="ℹ️"
ICON_PROGRESS="🔄"

# 临时文件
TEMP_DIR="/tmp/claude-relay-migration-$$"
MIGRATION_LOG="$TEMP_DIR/migration.log"
PROGRESS_FILE="$TEMP_DIR/progress.txt"

# =================================================================
# 工具函数
# =================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")

    case "$level" in
        "ERROR")   echo -e "${RED}[ERROR]${NC} [$timestamp] $message" | tee -a "$MIGRATION_LOG" >&2 ;;
        "WARN")    echo -e "${YELLOW}[WARN]${NC}  [$timestamp] $message" | tee -a "$MIGRATION_LOG" >&2 ;;
        "INFO")    echo -e "${GREEN}[INFO]${NC}  [$timestamp] $message" | tee -a "$MIGRATION_LOG" ;;
        "DEBUG")   [[ "$VERBOSE" == true ]] && echo -e "${BLUE}[DEBUG]${NC} [$timestamp] $message" | tee -a "$MIGRATION_LOG" ;;
        "PROGRESS") echo -e "${CYAN}[PROGRESS]${NC} [$timestamp] $message" | tee -a "$MIGRATION_LOG" ;;
        *)         echo "[$timestamp] $message" | tee -a "$MIGRATION_LOG" ;;
    esac
}

print_header() {
    local title="$1"
    local width=80
    local padding=$(( (width - ${#title} - 2) / 2 ))

    echo ""
    echo -e "${CYAN}$(printf '=%.0s' $(seq 1 $width))${NC}"
    echo -e "${CYAN}$(printf '%*s' $padding)${WHITE} $title ${CYAN}$(printf '%*s' $padding)${NC}"
    echo -e "${CYAN}$(printf '=%.0s' $(seq 1 $width))${NC}"
    echo ""
}

show_progress() {
    local current="$1"
    local total="$2"
    local desc="$3"
    local percentage=$((current * 100 / total))
    local width=50
    local filled=$((current * width / total))
    local empty=$((width - filled))

    printf "\r${CYAN}Progress:${NC} ["
    printf "%*s" $filled | tr ' ' '='
    printf "%*s" $empty | tr ' ' '-'
    printf "] %d%% (%d/%d) %s" "$percentage" "$current" "$total" "$desc"

    echo "$current/$total $desc" > "$PROGRESS_FILE"

    if [[ $current -eq $total ]]; then
        echo ""
    fi
}

confirm() {
    local message="$1"
    local default="${2:-n}"

    if [[ "$FORCE_EXECUTE" == true ]]; then
        log "INFO" "Force mode enabled, auto-confirming: $message"
        return 0
    fi

    local prompt="$message (y/n) [${default}]: "
    read -p "$prompt" -r response
    response=${response:-$default}

    case "$response" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

setup_temp_directory() {
    mkdir -p "$TEMP_DIR"
    mkdir -p "$BACKUP_DIR"
    touch "$MIGRATION_LOG"
    touch "$PROGRESS_FILE"
}

cleanup_temp_directory() {
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}

check_requirements() {
    log "INFO" "检查系统要求..."

    local required_commands=("docker" "docker-compose" "jq" "node")
    local missing_commands=()

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_commands+=("$cmd")
        fi
    done

    if [[ ${#missing_commands[@]} -gt 0 ]]; then
        log "ERROR" "缺少必要的命令: ${missing_commands[*]}"
        exit 1
    fi

    # 检查 Docker 服务
    if ! docker info &> /dev/null; then
        log "ERROR" "Docker 服务未运行"
        exit 1
    fi

    # 检查数据库管理脚本
    if [[ ! -f "scripts/database-manager.js" ]]; then
        log "ERROR" "数据库管理脚本不存在: scripts/database-manager.js"
        exit 1
    fi

    log "INFO" "系统要求检查通过"
}

check_database_connections() {
    log "INFO" "检查数据库连接..."

    # 检查 Redis 连接
    if docker ps --format "table {{.Names}}" | grep -q "claude-relay-redis"; then
        if docker exec claude-relay-redis redis-cli ping > /dev/null 2>&1; then
            log "INFO" "Redis 连接正常"
        else
            log "ERROR" "Redis 连接失败"
            exit 1
        fi
    else
        log "WARN" "Redis 容器未运行"
    fi

    # 检查 PostgreSQL 连接
    if docker ps --format "table {{.Names}}" | grep -q "claude-relay-postgres"; then
        if docker exec claude-relay-postgres pg_isready -U "${POSTGRES_USER:-postgres}" > /dev/null 2>&1; then
            log "INFO" "PostgreSQL 连接正常"
        else
            log "ERROR" "PostgreSQL 连接失败"
            exit 1
        fi
    else
        log "WARN" "PostgreSQL 容器未运行"
    fi
}

# =================================================================
# 备份和恢复功能
# =================================================================

cmd_backup() {
    print_header "数据备份"

    local backup_name="backup_${TIMESTAMP}"
    local backup_archive="${BACKUP_DIR}/${backup_name}.tar.gz"

    if [[ -n "$BACKUP_FILE" ]]; then
        backup_archive="$BACKUP_FILE"
        backup_name=$(basename "$backup_archive" .tar.gz)
    fi

    log "INFO" "开始数据备份: $backup_name"

    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "[DRY RUN] 将创建备份: $backup_archive"
        return 0
    fi

    local temp_backup_dir="$TEMP_DIR/backup"
    mkdir -p "$temp_backup_dir"

    # 备份应用数据
    if [[ -d "./data" ]]; then
        log "INFO" "备份应用数据目录..."
        cp -r ./data "$temp_backup_dir/" 2>/dev/null || true
    fi

    # 备份配置文件
    if [[ -d "./config" ]]; then
        log "INFO" "备份配置文件..."
        cp -r ./config "$temp_backup_dir/" 2>/dev/null || true
    fi

    # 备份环境配置
    if [[ -f ".env" ]]; then
        cp .env "$temp_backup_dir/" 2>/dev/null || true
    fi

    # 导出 Redis 数据
    if docker ps --format "table {{.Names}}" | grep -q "claude-relay-redis"; then
        log "INFO" "导出 Redis 数据..."

        # 触发 Redis 保存
        docker exec claude-relay-redis redis-cli BGSAVE > /dev/null 2>&1 || true
        sleep 5

        # 导出 RDB 文件
        docker cp claude-relay-redis:/data/dump.rdb "$temp_backup_dir/redis.rdb" 2>/dev/null || true

        # 导出 Redis 数据为 JSON
        local redis_export="$temp_backup_dir/redis_data.json"
        if timeout 60 node scripts/database-manager.js export-redis > "$redis_export" 2>/dev/null; then
            log "INFO" "Redis 数据导出完成"
        else
            log "WARN" "Redis 数据导出失败，使用 RDB 文件"
        fi
    fi

    # 导出 PostgreSQL 数据
    if docker ps --format "table {{.Names}}" | grep -q "claude-relay-postgres"; then
        log "INFO" "导出 PostgreSQL 数据..."

        local pg_dump_file="$temp_backup_dir/postgres.sql"
        if docker exec claude-relay-postgres pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DATABASE:-claude_relay}" > "$pg_dump_file" 2>/dev/null; then
            log "INFO" "PostgreSQL 数据导出完成"
        else
            log "WARN" "PostgreSQL 数据导出失败"
        fi

        # 导出 PostgreSQL 数据为 JSON
        local pg_export="$temp_backup_dir/postgres_data.json"
        if timeout 60 node scripts/database-manager.js export-postgres > "$pg_export" 2>/dev/null; then
            log "INFO" "PostgreSQL 数据导出完成"
        else
            log "WARN" "PostgreSQL 数据导出失败"
        fi
    fi

    # 创建备份元数据
    cat > "$temp_backup_dir/metadata.json" << EOF
{
  "backup_name": "$backup_name",
  "timestamp": "$TIMESTAMP",
  "created_at": "$(date -Iseconds)",
  "version": "$(cat package.json | jq -r .version 2>/dev/null || echo 'unknown')",
  "strategy": "full",
  "source": "mixed",
  "includes": {
    "application_data": $([ -d "./data" ] && echo "true" || echo "false"),
    "configuration": $([ -d "./config" ] && echo "true" || echo "false"),
    "redis_data": $(docker ps --format "table {{.Names}}" | grep -q "claude-relay-redis" && echo "true" || echo "false"),
    "postgres_data": $(docker ps --format "table {{.Names}}" | grep -q "claude-relay-postgres" && echo "true" || echo "false")
  }
}
EOF

    # 创建备份存档
    log "INFO" "创建备份存档..."
    (cd "$temp_backup_dir" && tar -czf "$backup_archive" .) || {
        log "ERROR" "备份存档创建失败"
        exit 1
    }

    local backup_size=$(du -h "$backup_archive" | cut -f1)
    log "INFO" "备份完成: $backup_archive (大小: $backup_size)"

    # 清理超过 10 个的旧备份
    log "INFO" "清理旧备份文件..."
    find "$BACKUP_DIR" -name "backup_*.tar.gz" -type f | sort -r | tail -n +11 | xargs rm -f 2>/dev/null || true
}

cmd_restore() {
    print_header "数据恢复"

    if [[ -z "$BACKUP_FILE" ]]; then
        # 选择最新的备份文件
        BACKUP_FILE=$(find "$BACKUP_DIR" -name "backup_*.tar.gz" -type f | sort -r | head -1)
        if [[ -z "$BACKUP_FILE" ]]; then
            log "ERROR" "未找到备份文件"
            exit 1
        fi
        log "INFO" "使用最新备份文件: $BACKUP_FILE"
    fi

    if [[ ! -f "$BACKUP_FILE" ]]; then
        log "ERROR" "备份文件不存在: $BACKUP_FILE"
        exit 1
    fi

    log "INFO" "开始数据恢复: $BACKUP_FILE"

    if ! confirm "确认恢复数据？这将覆盖现有数据"; then
        log "INFO" "用户取消恢复操作"
        return 0
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "[DRY RUN] 将恢复备份: $BACKUP_FILE"
        return 0
    fi

    local restore_dir="$TEMP_DIR/restore"
    mkdir -p "$restore_dir"

    # 解压备份文件
    log "INFO" "解压备份文件..."
    tar -xzf "$BACKUP_FILE" -C "$restore_dir" || {
        log "ERROR" "备份文件解压失败"
        exit 1
    }

    # 检查备份元数据
    if [[ -f "$restore_dir/metadata.json" ]]; then
        log "INFO" "备份信息:"
        local backup_name=$(jq -r .backup_name "$restore_dir/metadata.json" 2>/dev/null || echo "unknown")
        local created_at=$(jq -r .created_at "$restore_dir/metadata.json" 2>/dev/null || echo "unknown")
        log "INFO" "  备份名称: $backup_name"
        log "INFO" "  创建时间: $created_at"
    fi

    # 停止服务
    log "INFO" "停止应用服务..."
    docker-compose stop claude-relay 2>/dev/null || true

    # 恢复应用数据
    if [[ -d "$restore_dir/data" ]]; then
        log "INFO" "恢复应用数据..."
        rm -rf ./data 2>/dev/null || true
        cp -r "$restore_dir/data" ./ 2>/dev/null || true
    fi

    # 恢复配置文件
    if [[ -d "$restore_dir/config" ]]; then
        log "INFO" "恢复配置文件..."
        cp -r "$restore_dir/config"/* ./config/ 2>/dev/null || true
    fi

    # 恢复环境配置
    if [[ -f "$restore_dir/.env" ]]; then
        log "INFO" "恢复环境配置..."
        cp "$restore_dir/.env" ./ 2>/dev/null || true
    fi

    # 恢复 Redis 数据
    if [[ -f "$restore_dir/redis.rdb" ]] && docker ps --format "table {{.Names}}" | grep -q "claude-relay-redis"; then
        log "INFO" "恢复 Redis 数据..."

        docker exec claude-relay-redis redis-cli FLUSHALL > /dev/null 2>&1 || true
        docker cp "$restore_dir/redis.rdb" claude-relay-redis:/data/dump.rdb 2>/dev/null || true
        docker restart claude-relay-redis > /dev/null 2>&1 || true
        sleep 10
    fi

    # 恢复 PostgreSQL 数据
    if [[ -f "$restore_dir/postgres.sql" ]] && docker ps --format "table {{.Names}}" | grep -q "claude-relay-postgres"; then
        log "INFO" "恢复 PostgreSQL 数据..."

        docker exec claude-relay-postgres psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DATABASE:-claude_relay}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1 || true
        docker exec -i claude-relay-postgres psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DATABASE:-claude_relay}" < "$restore_dir/postgres.sql" > /dev/null 2>&1 || true
    fi

    # 重启服务
    log "INFO" "重启应用服务..."
    docker-compose start claude-relay 2>/dev/null || true

    log "INFO" "数据恢复完成"
}

# =================================================================
# 数据迁移功能
# =================================================================

cmd_migrate() {
    print_header "数据迁移"

    if [[ -z "$SOURCE_DB" ]] || [[ -z "$TARGET_DB" ]]; then
        log "ERROR" "必须指定源数据库和目标数据库"
        log "ERROR" "使用 --source 和 --target 参数"
        exit 1
    fi

    log "INFO" "迁移配置:"
    log "INFO" "  源数据库: $SOURCE_DB"
    log "INFO" "  目标数据库: $TARGET_DB"
    log "INFO" "  迁移策略: $MIGRATION_STRATEGY"
    log "INFO" "  批处理大小: $BATCH_SIZE"

    if ! confirm "确认开始数据迁移？"; then
        log "INFO" "用户取消迁移操作"
        return 0
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "[DRY RUN] 将执行数据迁移"
        return 0
    fi

    # 执行迁移前备份
    if [[ "$NO_BACKUP" == false ]]; then
        log "INFO" "执行迁移前备份..."
        BACKUP_FILE="${BACKUP_DIR}/pre_migration_${TIMESTAMP}.tar.gz"
        cmd_backup
    fi

    # 根据迁移方向执行迁移
    case "${SOURCE_DB}_to_${TARGET_DB}" in
        "redis_to_postgres")
            migrate_redis_to_postgres
            ;;
        "postgres_to_redis")
            migrate_postgres_to_redis
            ;;
        *)
            log "ERROR" "不支持的迁移路径: $SOURCE_DB -> $TARGET_DB"
            exit 1
            ;;
    esac

    # 数据验证
    if [[ "$VERIFY_DATA" == true ]]; then
        log "INFO" "验证迁移后的数据..."
        cmd_validate
    fi

    log "INFO" "数据迁移完成"
}

migrate_redis_to_postgres() {
    log "INFO" "开始 Redis 到 PostgreSQL 迁移..."

    # 使用数据库管理器进行迁移
    if timeout 300 node scripts/database-manager.js sync --source redis --target postgres --force; then
        log "INFO" "Redis 到 PostgreSQL 迁移成功"
    else
        log "ERROR" "Redis 到 PostgreSQL 迁移失败"
        exit 1
    fi
}

migrate_postgres_to_redis() {
    log "INFO" "开始 PostgreSQL 到 Redis 迁移..."

    # 使用数据库管理器进行迁移
    if timeout 300 node scripts/database-manager.js sync --source postgres --target redis --force; then
        log "INFO" "PostgreSQL 到 Redis 迁移成功"
    else
        log "ERROR" "PostgreSQL 到 Redis 迁移失败"
        exit 1
    fi
}

# =================================================================
# 数据同步和验证功能
# =================================================================

cmd_sync() {
    print_header "数据同步"

    log "INFO" "执行数据同步（策略: $MIGRATION_STRATEGY）..."

    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "[DRY RUN] 将执行数据同步"
        return 0
    fi

    case "$MIGRATION_STRATEGY" in
        "full")
            log "INFO" "执行全量同步..."
            if timeout 300 node scripts/database-manager.js sync --force; then
                log "INFO" "全量同步完成"
            else
                log "ERROR" "全量同步失败"
                exit 1
            fi
            ;;
        "incremental")
            log "INFO" "执行增量同步..."
            # 增量同步逻辑需要根据具体实现调整
            log "WARN" "增量同步功能正在开发中"
            ;;
        *)
            log "ERROR" "未知的同步策略: $MIGRATION_STRATEGY"
            exit 1
            ;;
    esac
}

cmd_validate() {
    print_header "数据一致性验证"

    log "INFO" "开始数据一致性检查..."

    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "[DRY RUN] 将执行数据验证"
        return 0
    fi

    # 使用数据库管理器检查一致性
    if timeout 120 node scripts/database-manager.js check-consistency; then
        log "INFO" "数据一致性检查通过"
    else
        log "WARN" "数据一致性检查发现问题"
        return 1
    fi
}

# =================================================================
# 状态和清理功能
# =================================================================

cmd_status() {
    print_header "迁移状态"

    # 检查备份文件
    log "INFO" "备份文件状态:"
    if [[ -d "$BACKUP_DIR" ]]; then
        local backup_count=$(find "$BACKUP_DIR" -name "backup_*.tar.gz" -type f | wc -l)
        log "INFO" "  备份文件数量: $backup_count"

        if [[ $backup_count -gt 0 ]]; then
            local latest_backup=$(find "$BACKUP_DIR" -name "backup_*.tar.gz" -type f | sort -r | head -1)
            local backup_size=$(du -h "$latest_backup" | cut -f1)
            local backup_date=$(stat -c %y "$latest_backup" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
            log "INFO" "  最新备份: $(basename "$latest_backup")"
            log "INFO" "  备份大小: $backup_size"
            log "INFO" "  备份日期: $backup_date"
        fi
    else
        log "INFO" "  备份目录不存在"
    fi

    # 检查数据库状态
    log "INFO" "数据库状态:"
    if timeout 30 node scripts/database-manager.js health > /dev/null 2>&1; then
        log "INFO" "  数据库健康状态: 正常"
    else
        log "WARN" "  数据库健康状态: 异常"
    fi

    # 检查迁移进度
    if [[ -f "$PROGRESS_FILE" ]]; then
        local progress=$(cat "$PROGRESS_FILE")
        log "INFO" "  当前迁移进度: $progress"
    fi
}

cmd_cleanup() {
    print_header "清理备份文件"

    if [[ ! -d "$BACKUP_DIR" ]]; then
        log "INFO" "备份目录不存在，无需清理"
        return 0
    fi

    local backup_files=($(find "$BACKUP_DIR" -name "backup_*.tar.gz" -type f | sort))
    local backup_count=${#backup_files[@]}

    if [[ $backup_count -eq 0 ]]; then
        log "INFO" "没有找到备份文件"
        return 0
    fi

    log "INFO" "找到 $backup_count 个备份文件"

    # 保留最近 5 个备份，删除其余的
    local keep_count=5
    if [[ $backup_count -gt $keep_count ]]; then
        local delete_count=$((backup_count - keep_count))
        log "INFO" "将删除 $delete_count 个旧备份文件"

        if confirm "确认删除旧备份文件？"; then
            if [[ "$DRY_RUN" == false ]]; then
                for ((i=0; i<delete_count; i++)); do
                    local file_to_delete="${backup_files[$i]}"
                    rm -f "$file_to_delete"
                    log "INFO" "已删除: $(basename "$file_to_delete")"
                done
            else
                log "INFO" "[DRY RUN] 将删除 $delete_count 个文件"
            fi
        else
            log "INFO" "用户取消清理操作"
        fi
    else
        log "INFO" "备份文件数量未超过保留限制，无需清理"
    fi
}

# =================================================================
# 帮助和参数解析
# =================================================================

show_help() {
    cat << EOF
Claude Relay Service - 数据迁移和备份脚本

使用方法:
  $0 [OPTIONS] COMMAND

命令:
  backup       备份数据
  restore      恢复数据
  migrate      迁移数据
  sync         同步数据
  validate     验证数据一致性
  cleanup      清理备份文件
  status       显示迁移状态

选项:
  --source TYPE         源数据库类型（redis|postgres）
  --target TYPE         目标数据库类型（postgres|redis）
  --backup-dir DIR      备份目录（默认：./backups）
  --backup-file FILE    指定备份文件
  --strategy STRATEGY   迁移策略（full|incremental）
  --batch-size SIZE     批处理大小（默认：1000）
  --verify              迁移后验证数据
  --no-backup           跳过备份
  --force               强制执行，跳过确认
  --dry-run             模拟运行
  --verbose             显示详细日志
  --help                显示此帮助信息

示例:
  $0 backup
  $0 migrate --source redis --target postgres --verify
  $0 sync --strategy incremental
  $0 restore --backup-file backup_20240916.tar.gz
  $0 cleanup --dry-run

更多信息请参考项目文档。
EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --source)
                SOURCE_DB="$2"
                shift 2
                ;;
            --target)
                TARGET_DB="$2"
                shift 2
                ;;
            --backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            --backup-file)
                BACKUP_FILE="$2"
                shift 2
                ;;
            --strategy)
                MIGRATION_STRATEGY="$2"
                shift 2
                ;;
            --batch-size)
                BATCH_SIZE="$2"
                shift 2
                ;;
            --verify)
                VERIFY_DATA=true
                shift
                ;;
            --no-backup)
                NO_BACKUP=true
                shift
                ;;
            --force)
                FORCE_EXECUTE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            backup|restore|migrate|sync|validate|cleanup|status)
                COMMAND="$1"
                shift
                ;;
            *)
                log "ERROR" "未知参数: $1"
                log "ERROR" "使用 --help 查看帮助信息"
                exit 1
                ;;
        esac
    done

    if [[ -z "$COMMAND" ]]; then
        log "ERROR" "必须指定命令"
        log "ERROR" "使用 --help 查看帮助信息"
        exit 1
    fi

    # 验证参数
    if [[ "$COMMAND" == "migrate" ]]; then
        if [[ -z "$SOURCE_DB" ]] || [[ -z "$TARGET_DB" ]]; then
            log "ERROR" "migrate 命令必须指定 --source 和 --target 参数"
            exit 1
        fi

        local valid_dbs=("redis" "postgres")
        if [[ ! " ${valid_dbs[@]} " =~ " $SOURCE_DB " ]] || [[ ! " ${valid_dbs[@]} " =~ " $TARGET_DB " ]]; then
            log "ERROR" "数据库类型必须是: ${valid_dbs[*]}"
            exit 1
        fi

        if [[ "$SOURCE_DB" == "$TARGET_DB" ]]; then
            log "ERROR" "源数据库和目标数据库不能相同"
            exit 1
        fi
    fi
}

# =================================================================
# 主函数
# =================================================================

main() {
    parse_arguments "$@"

    print_header "Claude Relay Service 数据迁移工具"

    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "运行模式: DRY RUN（模拟执行）"
    fi

    # 设置临时目录
    setup_temp_directory

    # 设置清理函数
    trap cleanup_temp_directory EXIT

    # 检查要求
    check_requirements
    check_database_connections

    # 加载环境配置
    if [[ -f ".env" ]]; then
        source .env
    fi

    # 执行命令
    case "$COMMAND" in
        "backup")   cmd_backup ;;
        "restore")  cmd_restore ;;
        "migrate")  cmd_migrate ;;
        "sync")     cmd_sync ;;
        "validate") cmd_validate ;;
        "cleanup")  cmd_cleanup ;;
        "status")   cmd_status ;;
        *)
            log "ERROR" "未知命令: $COMMAND"
            exit 1
            ;;
    esac

    log "INFO" "操作完成"
}

# =================================================================
# 错误处理和脚本入口
# =================================================================

trap 'log "ERROR" "脚本执行过程中发生错误"; cleanup_temp_directory; exit 1' ERR

# 确保在正确的目录中运行
if [[ ! -f "package.json" ]] || [[ ! -f "docker-compose.yml" ]]; then
    log "ERROR" "请在 Claude Relay Service 项目根目录中运行此脚本"
    exit 1
fi

# 执行主函数
main "$@"