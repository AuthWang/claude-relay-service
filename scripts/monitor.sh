#!/bin/bash

# =================================================================
# Claude Relay Service - 健康检查和监控脚本
# =================================================================
#
# 功能特性：
# - 实时服务状态监控
# - 健康检查和性能指标
# - 自动异常检测和告警
# - 资源使用统计
# - 容器状态监控
# - 数据库连接检查
# - API 响应时间监控
# - 日志分析和错误统计
#
# 使用方法：
#   ./scripts/monitor.sh [OPTIONS] COMMAND
#
# 命令：
#   status     : 显示服务状态概览
#   health     : 执行健康检查
#   watch      : 实时监控模式
#   metrics    : 显示性能指标
#   logs       : 查看服务日志
#   analyze    : 分析服务性能
#   alert      : 检查告警条件
#   report     : 生成监控报告
#
# 选项：
#   --interval SECONDS  : 监控刷新间隔（默认：5）
#   --duration MINUTES  : 监控持续时间（默认：无限）
#   --format FORMAT     : 输出格式（text|json|html）
#   --output FILE       : 输出到文件
#   --threshold PERCENT : 告警阈值（默认：80）
#   --verbose           : 显示详细信息
#   --no-color          : 禁用颜色输出
#   --help              : 显示帮助信息
#
# 示例：
#   ./scripts/monitor.sh status
#   ./scripts/monitor.sh watch --interval 10
#   ./scripts/monitor.sh metrics --format json
#   ./scripts/monitor.sh alert --threshold 90
#

set -euo pipefail

# =================================================================
# 全局变量和配置
# =================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# 默认配置
DEFAULT_INTERVAL=5
DEFAULT_THRESHOLD=80
DEFAULT_FORMAT="text"
DEFAULT_LOG_LINES=100

# 运行时变量
COMMAND=""
MONITOR_INTERVAL="$DEFAULT_INTERVAL"
MONITOR_DURATION=""
OUTPUT_FORMAT="$DEFAULT_FORMAT"
OUTPUT_FILE=""
ALERT_THRESHOLD="$DEFAULT_THRESHOLD"
VERBOSE=false
NO_COLOR=false
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 颜色配置
if [[ "$NO_COLOR" == false ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    PURPLE='\033[0;35m'
    CYAN='\033[0;36m'
    WHITE='\033[1;37m'
    GRAY='\033[0;37m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    PURPLE=''
    CYAN=''
    WHITE=''
    GRAY=''
    NC=''
fi

# 状态图标
ICON_HEALTHY="✅"
ICON_WARNING="⚠️"
ICON_ERROR="❌"
ICON_INFO="ℹ️"
ICON_UP="🟢"
ICON_DOWN="🔴"
ICON_UNKNOWN="❓"

# =================================================================
# 工具函数
# =================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")

    case "$level" in
        "ERROR")   echo -e "${RED}[ERROR]${NC} [$timestamp] $message" >&2 ;;
        "WARN")    echo -e "${YELLOW}[WARN]${NC}  [$timestamp] $message" >&2 ;;
        "INFO")    echo -e "${GREEN}[INFO]${NC}  [$timestamp] $message" ;;
        "DEBUG")   [[ "$VERBOSE" == true ]] && echo -e "${BLUE}[DEBUG]${NC} [$timestamp] $message" ;;
        *)         echo "[$timestamp] $message" ;;
    esac
}

print_header() {
    local title="$1"
    local width=80
    local padding=$(( (width - ${#title} - 2) / 2 ))

    echo -e "${CYAN}$(printf '=%.0s' $(seq 1 $width))${NC}"
    echo -e "${CYAN}$(printf '%*s' $padding)${WHITE} $title ${CYAN}$(printf '%*s' $padding)${NC}"
    echo -e "${CYAN}$(printf '=%.0s' $(seq 1 $width))${NC}"
    echo ""
}

print_section() {
    local title="$1"
    echo -e "${PURPLE}▶ $title${NC}"
    echo -e "${GRAY}$(printf -- '-%.0s' $(seq 1 60))${NC}"
}

format_bytes() {
    local bytes="$1"
    local units=("B" "KB" "MB" "GB" "TB")
    local unit=0

    while [[ $bytes -gt 1024 && $unit -lt 4 ]]; do
        bytes=$((bytes / 1024))
        unit=$((unit + 1))
    done

    echo "${bytes}${units[$unit]}"
}

format_percentage() {
    local value="$1"
    local threshold="${2:-$ALERT_THRESHOLD}"

    if (( $(echo "$value >= $threshold" | bc -l) )); then
        echo -e "${RED}${value}%${NC}"
    elif (( $(echo "$value >= $(echo "$threshold * 0.8" | bc -l)" | bc -l) )); then
        echo -e "${YELLOW}${value}%${NC}"
    else
        echo -e "${GREEN}${value}%${NC}"
    fi
}

get_service_status() {
    local service="$1"
    local container_name="claude-relay-$service"

    if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
        echo "running"
    elif docker ps -a --format "table {{.Names}}" | grep -q "$container_name"; then
        echo "stopped"
    else
        echo "not_found"
    fi
}

get_container_stats() {
    local service="$1"
    local container_name="claude-relay-$service"

    if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
        docker stats "$container_name" --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" | tail -n 1
    else
        echo "N/A	N/A	N/A	N/A	N/A"
    fi
}

check_http_endpoint() {
    local url="$1"
    local timeout="${2:-10}"

    local start_time=$(date +%s.%N)
    local http_code

    if http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null); then
        local end_time=$(date +%s.%N)
        local response_time=$(echo "$end_time - $start_time" | bc -l)
        response_time=$(printf "%.3f" "$response_time")

        if [[ "$http_code" == "200" ]]; then
            echo "healthy,$response_time"
        else
            echo "unhealthy,$response_time"
        fi
    else
        echo "error,0"
    fi
}

get_database_stats() {
    local db_type="$1"

    case "$db_type" in
        "redis")
            if docker exec claude-relay-redis redis-cli ping > /dev/null 2>&1; then
                local info=$(docker exec claude-relay-redis redis-cli info memory 2>/dev/null | grep -E "(used_memory:|used_memory_human:)")
                local used_memory=$(echo "$info" | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r')
                echo "connected,$used_memory"
            else
                echo "disconnected,N/A"
            fi
            ;;
        "postgres")
            if docker exec claude-relay-postgres pg_isready -U "${POSTGRES_USER:-postgres}" > /dev/null 2>&1; then
                local size=$(docker exec claude-relay-postgres psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DATABASE:-claude_relay}" -t -c "SELECT pg_size_pretty(pg_database_size('${POSTGRES_DATABASE:-claude_relay}'));" 2>/dev/null | xargs)
                echo "connected,$size"
            else
                echo "disconnected,N/A"
            fi
            ;;
        *)
            echo "unknown,N/A"
            ;;
    esac
}

# =================================================================
# 监控命令实现
# =================================================================

cmd_status() {
    print_header "Claude Relay Service 状态概览"

    # 检查环境配置
    if [[ -f ".env" ]]; then
        source .env
    fi

    # 服务状态检查
    print_section "服务状态"

    local services=("app" "redis")
    if [[ "${POSTGRES_ENABLED:-false}" == "true" ]]; then
        services+=("postgres")
    fi

    printf "%-15s %-10s %-15s %-15s %-15s\n" "服务" "状态" "CPU使用率" "内存使用" "网络I/O"
    printf "%-15s %-10s %-15s %-15s %-15s\n" "----" "----" "--------" "-------" "-------"

    for service in "${services[@]}"; do
        local status=$(get_service_status "$service")
        local stats=$(get_container_stats "$service")

        local cpu=$(echo "$stats" | awk '{print $1}')
        local memory=$(echo "$stats" | awk '{print $2}')
        local network=$(echo "$stats" | awk '{print $4}')

        local status_icon
        case "$status" in
            "running") status_icon="${ICON_UP}" ;;
            "stopped") status_icon="${ICON_DOWN}" ;;
            *) status_icon="${ICON_UNKNOWN}" ;;
        esac

        printf "%-15s %s%-8s %-15s %-15s %-15s\n" \
            "$service" "$status_icon" "$status" "$cpu" "$memory" "$network"
    done

    echo ""

    # API 健康检查
    print_section "API 健康检查"

    local base_url="http://localhost:${PORT:-3000}"
    local endpoints=("/health" "/api/v1/models")

    printf "%-25s %-10s %-15s\n" "端点" "状态" "响应时间"
    printf "%-25s %-10s %-15s\n" "----" "----" "--------"

    for endpoint in "${endpoints[@]}"; do
        local result=$(check_http_endpoint "$base_url$endpoint")
        local status=$(echo "$result" | cut -d, -f1)
        local response_time=$(echo "$result" | cut -d, -f2)

        local status_icon
        case "$status" in
            "healthy") status_icon="${ICON_HEALTHY}" ;;
            "unhealthy") status_icon="${ICON_WARNING}" ;;
            "error") status_icon="${ICON_ERROR}" ;;
        esac

        printf "%-25s %s%-8s %ss\n" \
            "$endpoint" "$status_icon" "$status" "$response_time"
    done

    echo ""

    # 数据库状态
    print_section "数据库状态"

    printf "%-15s %-10s %-15s\n" "数据库" "状态" "大小"
    printf "%-15s %-10s %-15s\n" "------" "----" "----"

    local redis_stats=$(get_database_stats "redis")
    local redis_status=$(echo "$redis_stats" | cut -d, -f1)
    local redis_size=$(echo "$redis_stats" | cut -d, -f2)

    local redis_icon
    case "$redis_status" in
        "connected") redis_icon="${ICON_UP}" ;;
        *) redis_icon="${ICON_DOWN}" ;;
    esac

    printf "%-15s %s%-8s %-15s\n" "Redis" "$redis_icon" "$redis_status" "$redis_size"

    if [[ "${POSTGRES_ENABLED:-false}" == "true" ]]; then
        local pg_stats=$(get_database_stats "postgres")
        local pg_status=$(echo "$pg_stats" | cut -d, -f1)
        local pg_size=$(echo "$pg_stats" | cut -d, -f2)

        local pg_icon
        case "$pg_status" in
            "connected") pg_icon="${ICON_UP}" ;;
            *) pg_icon="${ICON_DOWN}" ;;
        esac

        printf "%-15s %s%-8s %-15s\n" "PostgreSQL" "$pg_icon" "$pg_status" "$pg_size"
    fi

    echo ""

    # 系统资源使用
    print_section "系统资源使用"

    if command -v df > /dev/null; then
        local disk_usage=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
        printf "磁盘使用率: %s\n" "$(format_percentage "$disk_usage")"
    fi

    if command -v free > /dev/null; then
        local mem_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
        printf "内存使用率: %s\n" "$(format_percentage "$mem_usage")"
    fi

    echo ""
}

cmd_health() {
    print_header "健康检查详细报告"

    local overall_health="healthy"
    local issues=()

    # 容器健康检查
    print_section "容器健康检查"

    local services=("app" "redis")
    if [[ "${POSTGRES_ENABLED:-false}" == "true" ]]; then
        services+=("postgres")
    fi

    for service in "${services[@]}"; do
        local status=$(get_service_status "$service")
        printf "%-15s: " "$service"

        case "$status" in
            "running")
                echo -e "${GREEN}${ICON_HEALTHY} 运行正常${NC}"
                ;;
            "stopped")
                echo -e "${RED}${ICON_ERROR} 服务已停止${NC}"
                overall_health="unhealthy"
                issues+=("$service 服务未运行")
                ;;
            "not_found")
                echo -e "${RED}${ICON_ERROR} 容器不存在${NC}"
                overall_health="unhealthy"
                issues+=("$service 容器不存在")
                ;;
        esac
    done

    echo ""

    # 数据库连接检查
    print_section "数据库连接检查"

    # Redis 检查
    printf "%-15s: " "Redis"
    if docker exec claude-relay-redis redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}${ICON_HEALTHY} 连接正常${NC}"
    else
        echo -e "${RED}${ICON_ERROR} 连接失败${NC}"
        overall_health="unhealthy"
        issues+=("Redis 连接失败")
    fi

    # PostgreSQL 检查
    if [[ "${POSTGRES_ENABLED:-false}" == "true" ]]; then
        printf "%-15s: " "PostgreSQL"
        if docker exec claude-relay-postgres pg_isready -U "${POSTGRES_USER:-postgres}" > /dev/null 2>&1; then
            echo -e "${GREEN}${ICON_HEALTHY} 连接正常${NC}"
        else
            echo -e "${RED}${ICON_ERROR} 连接失败${NC}"
            overall_health="unhealthy"
            issues+=("PostgreSQL 连接失败")
        fi
    fi

    echo ""

    # API 端点检查
    print_section "API 端点检查"

    local base_url="http://localhost:${PORT:-3000}"
    local critical_endpoints=("/health" "/api/v1/models")

    for endpoint in "${critical_endpoints[@]}"; do
        printf "%-25s: " "$endpoint"
        local result=$(check_http_endpoint "$base_url$endpoint")
        local status=$(echo "$result" | cut -d, -f1)
        local response_time=$(echo "$result" | cut -d, -f2)

        case "$status" in
            "healthy")
                echo -e "${GREEN}${ICON_HEALTHY} 正常 (${response_time}s)${NC}"
                ;;
            "unhealthy")
                echo -e "${YELLOW}${ICON_WARNING} 异常响应 (${response_time}s)${NC}"
                overall_health="degraded"
                issues+=("$endpoint 返回异常状态码")
                ;;
            "error")
                echo -e "${RED}${ICON_ERROR} 连接失败${NC}"
                overall_health="unhealthy"
                issues+=("$endpoint 无法访问")
                ;;
        esac
    done

    echo ""

    # 应用级健康检查
    print_section "应用级健康检查"

    printf "%-25s: " "数据库初始化"
    if [[ -f "scripts/database-manager.js" ]]; then
        if timeout 30 node scripts/database-manager.js health > /dev/null 2>&1; then
            echo -e "${GREEN}${ICON_HEALTHY} 正常${NC}"
        else
            echo -e "${RED}${ICON_ERROR} 失败${NC}"
            overall_health="unhealthy"
            issues+=("数据库初始化检查失败")
        fi
    else
        echo -e "${YELLOW}${ICON_WARNING} 跳过（脚本不存在）${NC}"
    fi

    echo ""

    # 健康检查总结
    print_section "健康检查总结"

    printf "总体状态: "
    case "$overall_health" in
        "healthy")
            echo -e "${GREEN}${ICON_HEALTHY} 健康${NC}"
            ;;
        "degraded")
            echo -e "${YELLOW}${ICON_WARNING} 降级${NC}"
            ;;
        "unhealthy")
            echo -e "${RED}${ICON_ERROR} 不健康${NC}"
            ;;
    esac

    if [[ ${#issues[@]} -gt 0 ]]; then
        echo ""
        echo "发现的问题:"
        for issue in "${issues[@]}"; do
            echo -e "  ${RED}${ICON_ERROR}${NC} $issue"
        done
        echo ""
        echo "建议检查日志获取更多信息:"
        echo "  docker-compose logs claude-relay"
    fi

    echo ""
}

cmd_watch() {
    print_header "实时监控模式"

    log "INFO" "启动实时监控（间隔: ${MONITOR_INTERVAL}s）"
    log "INFO" "按 Ctrl+C 退出监控"

    local start_time=$(date +%s)
    local iteration=0

    while true; do
        iteration=$((iteration + 1))
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        # 检查监控持续时间
        if [[ -n "$MONITOR_DURATION" ]]; then
            local duration_seconds=$((MONITOR_DURATION * 60))
            if [[ $elapsed -ge $duration_seconds ]]; then
                log "INFO" "监控时间到达，退出监控"
                break
            fi
        fi

        # 清屏并显示状态
        clear
        echo -e "${CYAN}Claude Relay Service 实时监控${NC} - 第 $iteration 次更新 (运行时间: ${elapsed}s)"
        echo -e "${GRAY}$(date)${NC}"
        echo ""

        # 显示核心指标
        cmd_status

        # 显示最近的错误日志
        if docker ps --format "table {{.Names}}" | grep -q "claude-relay-app"; then
            print_section "最近日志 (最后 5 行)"
            docker logs claude-relay-app --tail 5 2>/dev/null | while read line; do
                if echo "$line" | grep -qi "error"; then
                    echo -e "${RED}$line${NC}"
                elif echo "$line" | grep -qi "warn"; then
                    echo -e "${YELLOW}$line${NC}"
                else
                    echo -e "${GRAY}$line${NC}"
                fi
            done
            echo ""
        fi

        sleep "$MONITOR_INTERVAL"
    done
}

cmd_metrics() {
    print_header "性能指标详细报告"

    # 容器性能指标
    print_section "容器性能指标"

    local services=("app" "redis")
    if [[ "${POSTGRES_ENABLED:-false}" == "true" ]]; then
        services+=("postgres")
    fi

    for service in "${services[@]}"; do
        echo -e "${PURPLE}$service 容器:${NC}"

        if docker ps --format "table {{.Names}}" | grep -q "claude-relay-$service"; then
            # 获取详细统计信息
            local stats=$(docker stats "claude-relay-$service" --no-stream --format "{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}")

            local cpu=$(echo "$stats" | cut -f1)
            local memory=$(echo "$stats" | cut -f2)
            local mem_percent=$(echo "$stats" | cut -f3)
            local network=$(echo "$stats" | cut -f4)
            local block_io=$(echo "$stats" | cut -f5)
            local pids=$(echo "$stats" | cut -f6)

            echo "  CPU 使用率:     $cpu"
            echo "  内存使用:       $memory"
            echo "  内存使用率:     $mem_percent"
            echo "  网络 I/O:       $network"
            echo "  磁盘 I/O:       $block_io"
            echo "  进程数:         $pids"
        else
            echo "  状态: 容器未运行"
        fi
        echo ""
    done

    # 应用性能指标
    print_section "应用性能指标"

    if [[ -f "scripts/database-manager.js" ]]; then
        echo "数据库性能指标:"
        timeout 30 node scripts/database-manager.js metrics 2>/dev/null || echo "  无法获取数据库指标"
        echo ""
    fi

    # API 性能测试
    print_section "API 响应性能"

    local base_url="http://localhost:${PORT:-3000}"
    local test_endpoints=("/health" "/api/v1/models")

    echo "端点响应时间测试 (10次平均):"
    for endpoint in "${test_endpoints[@]}"; do
        printf "  %-20s: " "$endpoint"

        local total_time=0
        local successful_requests=0

        for i in {1..10}; do
            local result=$(check_http_endpoint "$base_url$endpoint" 5)
            local status=$(echo "$result" | cut -d, -f1)
            local response_time=$(echo "$result" | cut -d, -f2)

            if [[ "$status" == "healthy" ]]; then
                total_time=$(echo "$total_time + $response_time" | bc -l)
                successful_requests=$((successful_requests + 1))
            fi
        done

        if [[ $successful_requests -gt 0 ]]; then
            local avg_time=$(echo "scale=3; $total_time / $successful_requests" | bc -l)
            echo "${avg_time}s (${successful_requests}/10 成功)"
        else
            echo "失败"
        fi
    done

    echo ""
}

cmd_logs() {
    print_header "服务日志分析"

    local services=("app" "redis")
    if [[ "${POSTGRES_ENABLED:-false}" == "true" ]]; then
        services+=("postgres")
    fi

    for service in "${services[@]}"; do
        print_section "$service 服务日志"

        if docker ps --format "table {{.Names}}" | grep -q "claude-relay-$service"; then
            echo "最近 $DEFAULT_LOG_LINES 行日志:"
            docker logs "claude-relay-$service" --tail "$DEFAULT_LOG_LINES" 2>&1 | while read line; do
                if echo "$line" | grep -qi "error"; then
                    echo -e "${RED}$line${NC}"
                elif echo "$line" | grep -qi "warn"; then
                    echo -e "${YELLOW}$line${NC}"
                elif echo "$line" | grep -qi "info"; then
                    echo -e "${GREEN}$line${NC}"
                else
                    echo -e "${GRAY}$line${NC}"
                fi
            done
        else
            echo "容器未运行"
        fi
        echo ""
    done

    # 错误统计
    print_section "错误统计（最近 24 小时）"

    if docker ps --format "table {{.Names}}" | grep -q "claude-relay-app"; then
        local since_time=$(date -d "24 hours ago" '+%Y-%m-%dT%H:%M:%S')
        local error_count=$(docker logs claude-relay-app --since "$since_time" 2>&1 | grep -i "error" | wc -l)
        local warn_count=$(docker logs claude-relay-app --since "$since_time" 2>&1 | grep -i "warn" | wc -l)

        echo "错误数量: $error_count"
        echo "警告数量: $warn_count"

        if [[ $error_count -gt 0 ]]; then
            echo ""
            echo "最近错误示例:"
            docker logs claude-relay-app --since "$since_time" 2>&1 | grep -i "error" | tail -5 | while read line; do
                echo -e "${RED}  $line${NC}"
            done
        fi
    fi

    echo ""
}

cmd_alert() {
    print_header "告警检查"

    local alerts=()

    # CPU 使用率检查
    print_section "资源使用率检查"

    local services=("app" "redis")
    if [[ "${POSTGRES_ENABLED:-false}" == "true" ]]; then
        services+=("postgres")
    fi

    for service in "${services[@]}"; do
        if docker ps --format "table {{.Names}}" | grep -q "claude-relay-$service"; then
            local cpu_usage=$(docker stats "claude-relay-$service" --no-stream --format "{{.CPUPerc}}" | sed 's/%//')
            local mem_usage=$(docker stats "claude-relay-$service" --no-stream --format "{{.MemPerc}}" | sed 's/%//')

            printf "%-15s CPU: %s%% | 内存: %s%%\n" "$service" "$cpu_usage" "$mem_usage"

            if (( $(echo "$cpu_usage >= $ALERT_THRESHOLD" | bc -l) )); then
                alerts+=("$service CPU 使用率过高: ${cpu_usage}%")
            fi

            if (( $(echo "$mem_usage >= $ALERT_THRESHOLD" | bc -l) )); then
                alerts+=("$service 内存使用率过高: ${mem_usage}%")
            fi
        fi
    done

    echo ""

    # API 响应时间检查
    print_section "API 响应时间检查"

    local base_url="http://localhost:${PORT:-3000}"
    local result=$(check_http_endpoint "$base_url/health")
    local status=$(echo "$result" | cut -d, -f1)
    local response_time=$(echo "$result" | cut -d, -f2)

    printf "健康检查端点: %s (%ss)\n" "$status" "$response_time"

    if [[ "$status" != "healthy" ]]; then
        alerts+=("健康检查端点异常: $status")
    fi

    if (( $(echo "$response_time > 5.0" | bc -l) )); then
        alerts+=("API 响应时间过长: ${response_time}s")
    fi

    echo ""

    # 磁盘空间检查
    print_section "磁盘空间检查"

    if command -v df > /dev/null; then
        local disk_usage=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
        printf "磁盘使用率: %s%%\n" "$disk_usage"

        if [[ $disk_usage -ge $ALERT_THRESHOLD ]]; then
            alerts+=("磁盘使用率过高: ${disk_usage}%")
        fi
    fi

    echo ""

    # 告警汇总
    print_section "告警汇总"

    if [[ ${#alerts[@]} -eq 0 ]]; then
        echo -e "${GREEN}${ICON_HEALTHY} 未发现告警条件${NC}"
    else
        echo -e "${RED}${ICON_ERROR} 发现 ${#alerts[@]} 个告警:${NC}"
        for alert in "${alerts[@]}"; do
            echo -e "  ${RED}${ICON_WARNING}${NC} $alert"
        done

        # 可以在这里添加告警通知逻辑
        # send_notification "${alerts[@]}"
    fi

    echo ""
}

cmd_report() {
    print_header "监控报告生成"

    local report_file="monitoring_report_${TIMESTAMP}.txt"
    if [[ -n "$OUTPUT_FILE" ]]; then
        report_file="$OUTPUT_FILE"
    fi

    log "INFO" "生成监控报告: $report_file"

    {
        echo "Claude Relay Service 监控报告"
        echo "生成时间: $(date)"
        echo "========================================"
        echo ""

        echo "# 服务状态概览"
        cmd_status

        echo ""
        echo "# 健康检查详情"
        cmd_health

        echo ""
        echo "# 性能指标"
        cmd_metrics

        echo ""
        echo "# 告警检查"
        cmd_alert

    } > "$report_file"

    log "INFO" "报告生成完成: $report_file"
}

# =================================================================
# 参数解析和帮助函数
# =================================================================

show_help() {
    cat << EOF
Claude Relay Service - 健康检查和监控脚本

使用方法:
  $0 [OPTIONS] COMMAND

命令:
  status      显示服务状态概览
  health      执行健康检查
  watch       实时监控模式
  metrics     显示性能指标
  logs        查看服务日志
  analyze     分析服务性能
  alert       检查告警条件
  report      生成监控报告

选项:
  --interval SECONDS   监控刷新间隔（默认：5）
  --duration MINUTES   监控持续时间（默认：无限）
  --format FORMAT      输出格式（text|json|html）
  --output FILE        输出到文件
  --threshold PERCENT  告警阈值（默认：80）
  --verbose            显示详细信息
  --no-color           禁用颜色输出
  --help               显示此帮助信息

示例:
  $0 status
  $0 watch --interval 10
  $0 metrics --format json
  $0 alert --threshold 90
  $0 report --output /tmp/report.txt

更多信息请参考项目文档。
EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --interval)
                MONITOR_INTERVAL="$2"
                shift 2
                ;;
            --duration)
                MONITOR_DURATION="$2"
                shift 2
                ;;
            --format)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            --output)
                OUTPUT_FILE="$2"
                shift 2
                ;;
            --threshold)
                ALERT_THRESHOLD="$2"
                shift 2
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --no-color)
                NO_COLOR=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            status|health|watch|metrics|logs|analyze|alert|report)
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
        log "ERROR" "必须指定监控命令"
        log "ERROR" "使用 --help 查看帮助信息"
        exit 1
    fi
}

# =================================================================
# 主函数
# =================================================================

main() {
    parse_arguments "$@"

    # 检查基本要求
    if ! command -v docker > /dev/null; then
        log "ERROR" "Docker 未安装或不在 PATH 中"
        exit 1
    fi

    if ! command -v docker-compose > /dev/null; then
        log "ERROR" "Docker Compose 未安装或不在 PATH 中"
        exit 1
    fi

    # 加载环境配置
    if [[ -f ".env" ]]; then
        source .env
    fi

    # 执行监控命令
    case "$COMMAND" in
        "status")   cmd_status ;;
        "health")   cmd_health ;;
        "watch")    cmd_watch ;;
        "metrics")  cmd_metrics ;;
        "logs")     cmd_logs ;;
        "analyze")  cmd_metrics ;;  # analyze 是 metrics 的别名
        "alert")    cmd_alert ;;
        "report")   cmd_report ;;
        *)
            log "ERROR" "未知命令: $COMMAND"
            exit 1
            ;;
    esac
}

# =================================================================
# 错误处理和脚本入口
# =================================================================

trap 'log "ERROR" "监控脚本执行中断"; exit 1' INT TERM

# 确保在正确的目录中运行
if [[ ! -f "package.json" ]] || [[ ! -f "docker-compose.yml" ]]; then
    log "ERROR" "请在 Claude Relay Service 项目根目录中运行此脚本"
    exit 1
fi

# 执行主函数
main "$@"