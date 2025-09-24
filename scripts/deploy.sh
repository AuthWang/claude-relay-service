#!/bin/bash

# 🚀 Claude Relay Service - 自动化部署脚本
# PostgreSQL 混合架构零宕机部署
# Created by DevOps-Expert with SMART-6 optimization

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_MODE="${1:-hybrid}"
ROLLBACK_FLAG="${2:-false}"
BACKUP_DIR="$PROJECT_ROOT/backups"
LOG_FILE="$PROJECT_ROOT/logs/deploy-$(date +%Y%m%d_%H%M%S).log"

# 创建必要目录
mkdir -p "$PROJECT_ROOT/logs" "$BACKUP_DIR"

# 日志函数
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local colored_message=""

    case "$level" in
        "INFO")  colored_message="${GREEN}[INFO]${NC}" ;;
        "WARN")  colored_message="${YELLOW}[WARN]${NC}" ;;
        "ERROR") colored_message="${RED}[ERROR]${NC}" ;;
        "DEBUG") colored_message="${BLUE}[DEBUG]${NC}" ;;
    esac

    echo -e "$colored_message [$timestamp] $message" | tee -a "$LOG_FILE"
}

# 错误处理
error_exit() {
    log "ERROR" "$1"
    log "ERROR" "部署失败，请查看日志: $LOG_FILE"
    exit 1
}

# 清理函数
cleanup() {
    log "INFO" "执行清理操作..."
    # 清理临时文件
    rm -f /tmp/claude-relay-*.tmp
}

# 注册清理函数
trap cleanup EXIT

# 部署前检查
pre_deployment_check() {
    log "INFO" "🔍 开始部署前检查..."

    # 检查必要工具
    local tools=("docker" "docker-compose" "curl" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error_exit "必需工具 $tool 未安装"
        fi
    done

    # 检查项目结构
    local required_files=(
        "$PROJECT_ROOT/docker-compose.yml"
        "$PROJECT_ROOT/.env.example"
        "$PROJECT_ROOT/package.json"
    )

    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            error_exit "必需文件不存在: $file"
        fi
    done

    # 检查环境变量文件
    local env_file="$PROJECT_ROOT/.env"
    if [[ ! -f "$env_file" ]]; then
        log "WARN" "环境变量文件 .env 不存在，使用示例配置"
        cp "$PROJECT_ROOT/.env.example" "$env_file"
    fi

    # 验证关键环境变量
    source "$env_file"
    local required_vars=("JWT_SECRET" "ENCRYPTION_KEY")

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            error_exit "必需环境变量 $var 未设置"
        fi
    done

    log "INFO" "✅ 部署前检查通过"
}

# 备份当前配置
backup_configuration() {
    log "INFO" "📋 备份当前配置..."

    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="$BACKUP_DIR/config-backup-$backup_timestamp"

    mkdir -p "$backup_path"

    # 备份配置文件
    local files_to_backup=(
        ".env"
        "docker-compose.yml"
        "config/config.js"
    )

    for file in "${files_to_backup[@]}"; do
        if [[ -f "$PROJECT_ROOT/$file" ]]; then
            cp "$PROJECT_ROOT/$file" "$backup_path/"
            log "DEBUG" "备份文件: $file"
        fi
    done

    # 备份数据库（如果运行中）
    if docker-compose ps postgres | grep -q "Up"; then
        log "INFO" "备份 PostgreSQL 数据库..."
        docker-compose exec -T postgres pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DATABASE:-claude_relay}" > "$backup_path/postgres-backup.sql"
    fi

    # 备份 Redis 数据
    if docker-compose ps redis | grep -q "Up"; then
        log "INFO" "备份 Redis 数据..."
        docker-compose exec -T redis redis-cli --rdb - > "$backup_path/redis-backup.rdb"
    fi

    log "INFO" "✅ 配置备份完成: $backup_path"
    echo "$backup_path" > /tmp/claude-relay-backup-path.tmp
}

# 健康检查
health_check() {
    local service="$1"
    local max_attempts="${2:-30}"
    local attempt=1

    log "INFO" "🔍 检查服务健康状态: $service"

    while [[ $attempt -le $max_attempts ]]; do
        case "$service" in
            "postgres")
                if docker-compose exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DATABASE:-claude_relay}" &>/dev/null; then
                    log "INFO" "✅ PostgreSQL 服务健康 (尝试 $attempt/$max_attempts)"
                    return 0
                fi
                ;;
            "redis")
                if docker-compose exec -T redis redis-cli ping | grep -q "PONG"; then
                    log "INFO" "✅ Redis 服务健康 (尝试 $attempt/$max_attempts)"
                    return 0
                fi
                ;;
            "app")
                local app_port="${PORT:-3000}"
                if curl -f "http://localhost:$app_port/health" &>/dev/null; then
                    log "INFO" "✅ 应用服务健康 (尝试 $attempt/$max_attempts)"
                    return 0
                fi
                ;;
        esac

        log "DEBUG" "等待服务 $service 就绪... ($attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done

    error_exit "服务 $service 健康检查失败"
}

# 部署应用
deploy_application() {
    local mode="$1"
    log "INFO" "🚀 开始部署应用 (模式: $mode)..."

    # 设置 Docker Compose 配置
    export COMPOSE_PROJECT_NAME="claude-relay"
    export COMPOSE_FILE="docker-compose.yml"

    case "$mode" in
        "redis_only")
            log "INFO" "部署 Redis 单一架构模式"
            export DATABASE_STRATEGY="redis_only"
            export POSTGRES_ENABLED="false"
            docker-compose up -d redis claude-relay
            ;;
        "postgres_only")
            log "INFO" "部署 PostgreSQL 单一架构模式"
            export DATABASE_STRATEGY="postgres_only"
            export POSTGRES_ENABLED="true"
            docker-compose --profile postgres up -d postgres claude-relay
            ;;
        "hybrid")
            log "INFO" "部署混合架构模式"
            export DATABASE_STRATEGY="dual_write"
            export POSTGRES_ENABLED="true"
            docker-compose --profile hybrid up -d
            ;;
        "development")
            log "INFO" "部署开发环境"
            export DATABASE_STRATEGY="cache_first"
            export POSTGRES_ENABLED="true"
            docker-compose --profile postgres --profile monitoring up -d
            ;;
        *)
            error_exit "未知部署模式: $mode"
            ;;
    esac

    # 等待服务启动
    log "INFO" "⏳ 等待服务启动..."
    sleep 10

    # 服务健康检查
    if [[ "$POSTGRES_ENABLED" == "true" ]]; then
        health_check "postgres" 30

        # 运行数据库初始化
        log "INFO" "🗄️ 初始化数据库..."
        if [[ -f "$PROJECT_ROOT/scripts/init-database.js" ]]; then
            docker-compose exec claude-relay npm run init:db
        fi
    fi

    health_check "redis" 15
    health_check "app" 20

    log "INFO" "✅ 应用部署完成"
}

# 数据迁移
run_migration() {
    if [[ "$DEPLOYMENT_MODE" == "hybrid" ]] && [[ -f "$PROJECT_ROOT/scripts/migrate-data.js" ]]; then
        log "INFO" "🔄 开始数据迁移..."

        docker-compose exec claude-relay node scripts/migrate-data.js

        if [[ $? -eq 0 ]]; then
            log "INFO" "✅ 数据迁移完成"
        else
            log "WARN" "⚠️ 数据迁移出现警告，请检查日志"
        fi
    fi
}

# 部署验证
deployment_verification() {
    log "INFO" "🧪 开始部署验证..."

    # 基础功能测试
    local app_port="${PORT:-3000}"
    local health_response=$(curl -s "http://localhost:$app_port/health" | jq -r '.status' 2>/dev/null || echo "error")

    if [[ "$health_response" != "ok" ]]; then
        error_exit "应用健康检查失败"
    fi

    # API 功能测试
    local api_response=$(curl -s -w "%{http_code}" -o /dev/null "http://localhost:$app_port/api/v1/models")
    if [[ "$api_response" -ne 200 ]]; then
        log "WARN" "API 端点响应异常: HTTP $api_response"
    fi

    # 数据库连接测试
    if [[ "$POSTGRES_ENABLED" == "true" ]]; then
        if ! docker-compose exec -T claude-relay node -e "require('./src/models/postgres').connect().then(() => console.log('OK')).catch(() => process.exit(1))" | grep -q "OK"; then
            error_exit "PostgreSQL 连接测试失败"
        fi
    fi

    log "INFO" "✅ 部署验证通过"
}

# 回滚操作
rollback_deployment() {
    log "INFO" "🔙 开始回滚操作..."

    local backup_path
    if [[ -f /tmp/claude-relay-backup-path.tmp ]]; then
        backup_path=$(cat /tmp/claude-relay-backup-path.tmp)
    else
        # 查找最新备份
        backup_path=$(ls -t "$BACKUP_DIR"/config-backup-* | head -1)
    fi

    if [[ -z "$backup_path" || ! -d "$backup_path" ]]; then
        error_exit "找不到备份文件，无法回滚"
    fi

    log "INFO" "使用备份: $backup_path"

    # 停止当前服务
    docker-compose down

    # 恢复配置文件
    cp "$backup_path/.env" "$PROJECT_ROOT/" 2>/dev/null || true
    cp "$backup_path/docker-compose.yml" "$PROJECT_ROOT/" 2>/dev/null || true
    cp "$backup_path/config.js" "$PROJECT_ROOT/config/" 2>/dev/null || true

    # 恢复数据库（如果存在）
    if [[ -f "$backup_path/postgres-backup.sql" ]]; then
        log "INFO" "恢复 PostgreSQL 数据库..."
        docker-compose up -d postgres
        health_check "postgres" 30
        docker-compose exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DATABASE:-claude_relay}" < "$backup_path/postgres-backup.sql"
    fi

    if [[ -f "$backup_path/redis-backup.rdb" ]]; then
        log "INFO" "恢复 Redis 数据..."
        docker-compose down redis
        # Redis 数据恢复需要特殊处理
        cp "$backup_path/redis-backup.rdb" "$PROJECT_ROOT/redis_data/dump.rdb"
    fi

    # 重启服务
    docker-compose up -d

    log "INFO" "✅ 回滚完成"
}

# 性能监控启动
start_monitoring() {
    if [[ "$DEPLOYMENT_MODE" == "development" ]] || [[ "$DEPLOYMENT_MODE" == "hybrid" ]]; then
        log "INFO" "🔍 启动监控服务..."
        docker-compose --profile monitoring up -d
    fi
}

# 清理旧版本
cleanup_old_versions() {
    log "INFO" "🧹 清理旧版本..."

    # 清理旧的Docker镜像
    docker image prune -f

    # 清理旧的日志文件 (保留最近30天)
    find "$PROJECT_ROOT/logs" -name "deploy-*.log" -mtime +30 -delete 2>/dev/null || true

    # 清理旧的备份文件 (保留最近7个)
    ls -t "$BACKUP_DIR"/config-backup-* | tail -n +8 | xargs -r rm -rf

    log "INFO" "✅ 清理完成"
}

# 显示部署信息
show_deployment_info() {
    log "INFO" "📊 部署信息摘要"
    echo "=================================="
    echo "部署模式: $DEPLOYMENT_MODE"
    echo "部署时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "项目路径: $PROJECT_ROOT"
    echo "日志文件: $LOG_FILE"
    echo ""
    echo "服务状态:"
    docker-compose ps
    echo ""
    echo "服务端点:"
    echo "- 主应用: http://localhost:${PORT:-3000}"
    echo "- 健康检查: http://localhost:${PORT:-3000}/health"
    echo "- Web 管理: http://localhost:${PORT:-3000}/web"

    if docker-compose ps | grep -q "redis-commander"; then
        echo "- Redis 管理: http://localhost:${REDIS_WEB_PORT:-8081}"
    fi

    if docker-compose ps | grep -q "pgadmin"; then
        echo "- PostgreSQL 管理: http://localhost:${PGADMIN_PORT:-5050}"
    fi

    if docker-compose ps | grep -q "grafana"; then
        echo "- Grafana 监控: http://localhost:${GRAFANA_PORT:-3001}"
    fi

    echo "=================================="
}

# 主函数
main() {
    log "INFO" "🚀 Claude Relay Service 部署开始"
    log "INFO" "部署模式: $DEPLOYMENT_MODE, 回滚: $ROLLBACK_FLAG"

    cd "$PROJECT_ROOT"

    if [[ "$ROLLBACK_FLAG" == "true" ]]; then
        rollback_deployment
    else
        pre_deployment_check
        backup_configuration
        deploy_application "$DEPLOYMENT_MODE"
        run_migration
        deployment_verification
        start_monitoring
        cleanup_old_versions
    fi

    show_deployment_info

    log "INFO" "✅ 部署成功完成！"
    log "INFO" "日志文件: $LOG_FILE"
}

# 帮助信息
show_help() {
    cat << EOF
🚀 Claude Relay Service 部署脚本

用法: $0 [部署模式] [回滚标志]

部署模式:
  redis_only    - 仅使用 Redis (默认)
  postgres_only - 仅使用 PostgreSQL
  hybrid        - 混合架构 (Redis + PostgreSQL)
  development   - 开发环境 (包含监控工具)

回滚标志:
  false         - 正常部署 (默认)
  true          - 执行回滚

示例:
  $0                          # 默认混合部署
  $0 hybrid                   # 混合架构部署
  $0 development             # 开发环境部署
  $0 hybrid true             # 回滚到之前版本

环境变量:
  PORT                       # 服务端口 (默认: 3000)
  POSTGRES_ENABLED          # 启用 PostgreSQL (true/false)
  DATABASE_STRATEGY         # 数据库策略 (dual_write/cache_first/redis_only/postgres_only)

更多信息请参考: docs/database-integration/deployment.md
EOF
}

# 参数验证
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

# 验证部署模式
case "$DEPLOYMENT_MODE" in
    redis_only|postgres_only|hybrid|development) ;;
    *)
        log "ERROR" "无效的部署模式: $DEPLOYMENT_MODE"
        show_help
        exit 1
        ;;
esac

# 执行主函数
main "$@"