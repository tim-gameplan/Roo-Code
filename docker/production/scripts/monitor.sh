#!/bin/bash
set -e

# Production Monitoring Script
# Monitors the health and performance of production services

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"
LOG_FILE="/var/log/roo-cloud/monitor.log"
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEMORY=85
ALERT_THRESHOLD_DISK=90

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "${BLUE}${message}${NC}"
    echo "$message" >> "$LOG_FILE" 2>/dev/null || true
}

error() {
    local message="[ERROR] $1"
    echo -e "${RED}${message}${NC}" >&2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE" 2>/dev/null || true
}

success() {
    local message="[SUCCESS] $1"
    echo -e "${GREEN}${message}${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE" 2>/dev/null || true
}

warning() {
    local message="[WARNING] $1"
    echo -e "${YELLOW}${message}${NC}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" >> "$LOG_FILE" 2>/dev/null || true
}

# Function to check container status
check_container_status() {
    log "🔍 Checking container status..."
    
    local containers=(
        "roo-cloud-postgres"
        "roo-cloud-redis"
    )
    
    local all_healthy=true
    
    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$container.*Up"; then
            local status=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep "$container" | awk '{print $2}')
            success "✅ $container: $status"
        else
            error "❌ $container: Not running"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        success "✅ All containers are running"
    else
        error "❌ Some containers are not running"
        return 1
    fi
}

# Function to check resource usage
check_resource_usage() {
    log "📊 Checking resource usage..."
    
    # Check system resources
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    local memory_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    local disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    log "💻 System Resources:"
    log "   • CPU Usage: ${cpu_usage}%"
    log "   • Memory Usage: ${memory_usage}%"
    log "   • Disk Usage: ${disk_usage}%"
    
    # Check thresholds
    if (( $(echo "$cpu_usage > $ALERT_THRESHOLD_CPU" | bc -l) )); then
        warning "⚠️  High CPU usage: ${cpu_usage}%"
    fi
    
    if (( $(echo "$memory_usage > $ALERT_THRESHOLD_MEMORY" | bc -l) )); then
        warning "⚠️  High memory usage: ${memory_usage}%"
    fi
    
    if [ "$disk_usage" -gt "$ALERT_THRESHOLD_DISK" ]; then
        warning "⚠️  High disk usage: ${disk_usage}%"
    fi
    
    # Check container resources
    log "🐳 Container Resources:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" | grep -E "(roo-cloud-postgres|roo-cloud-redis)" || true
}

# Function to check service health
check_service_health() {
    log "🏥 Checking service health..."
    
    # PostgreSQL health check
    if docker exec roo-cloud-postgres /usr/local/bin/health-check.sh > /dev/null 2>&1; then
        success "✅ PostgreSQL health check passed"
    else
        error "❌ PostgreSQL health check failed"
        return 1
    fi
    
    # Redis health check
    if docker exec roo-cloud-redis /usr/local/bin/health-check.sh > /dev/null 2>&1; then
        success "✅ Redis health check passed"
    else
        error "❌ Redis health check failed"
        return 1
    fi
}

# Function to check logs for errors
check_logs() {
    log "📋 Checking recent logs for errors..."
    
    local containers=(
        "roo-cloud-postgres"
        "roo-cloud-redis"
    )
    
    for container in "${containers[@]}"; do
        local error_count=$(docker logs --since="1h" "$container" 2>&1 | grep -i "error\|fatal\|exception" | wc -l)
        
        if [ "$error_count" -gt 0 ]; then
            warning "⚠️  $container: $error_count errors in the last hour"
            
            # Show recent errors
            log "Recent errors from $container:"
            docker logs --since="1h" "$container" 2>&1 | grep -i "error\|fatal\|exception" | tail -5 | while read -r line; do
                log "   $line"
            done
        else
            success "✅ $container: No errors in the last hour"
        fi
    done
}

# Function to check backup status
check_backup_status() {
    log "💾 Checking backup status..."
    
    local backup_dir="/var/lib/roo-cloud/backups"
    
    if [ -d "$backup_dir" ]; then
        local latest_postgres_backup=$(find "$backup_dir" -name "roo_cloud_backup_*.sql.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
        local latest_redis_backup=$(find "$backup_dir" -name "redis_backup_*.rdb.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
        
        if [ -n "$latest_postgres_backup" ]; then
            local postgres_age=$(( ($(date +%s) - $(stat -c %Y "$latest_postgres_backup")) / 3600 ))
            if [ "$postgres_age" -lt 24 ]; then
                success "✅ PostgreSQL backup: ${postgres_age}h old"
            else
                warning "⚠️  PostgreSQL backup: ${postgres_age}h old (>24h)"
            fi
        else
            warning "⚠️  No PostgreSQL backups found"
        fi
        
        if [ -n "$latest_redis_backup" ]; then
            local redis_age=$(( ($(date +%s) - $(stat -c %Y "$latest_redis_backup")) / 3600 ))
            if [ "$redis_age" -lt 24 ]; then
                success "✅ Redis backup: ${redis_age}h old"
            else
                warning "⚠️  Redis backup: ${redis_age}h old (>24h)"
            fi
        else
            warning "⚠️  No Redis backups found"
        fi
    else
        warning "⚠️  Backup directory not found: $backup_dir"
    fi
}

# Function to check network connectivity
check_network() {
    log "🌐 Checking network connectivity..."
    
    # Check if containers can communicate
    if docker exec roo-cloud-postgres pg_isready -h postgres -p 5432 > /dev/null 2>&1; then
        success "✅ PostgreSQL network connectivity"
    else
        error "❌ PostgreSQL network connectivity failed"
    fi
    
    if docker exec roo-cloud-redis redis-cli -h redis ping > /dev/null 2>&1; then
        success "✅ Redis network connectivity"
    else
        error "❌ Redis network connectivity failed"
    fi
}

# Function to generate monitoring report
generate_report() {
    log "📊 Generating monitoring report..."
    
    local report_file="/var/log/roo-cloud/monitor-report-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "system": {
    "cpu_usage": "$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')",
    "memory_usage": "$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')",
    "disk_usage": "$(df / | awk 'NR==2 {print $5}' | sed 's/%//')"
  },
  "containers": {
    "postgres": {
      "status": "$(docker ps --format "{{.Status}}" --filter "name=roo-cloud-postgres")",
      "health": "$(docker exec roo-cloud-postgres /usr/local/bin/health-check.sh > /dev/null 2>&1 && echo "healthy" || echo "unhealthy")"
    },
    "redis": {
      "status": "$(docker ps --format "{{.Status}}" --filter "name=roo-cloud-redis")",
      "health": "$(docker exec roo-cloud-redis /usr/local/bin/health-check.sh > /dev/null 2>&1 && echo "healthy" || echo "unhealthy")"
    }
  }
}
EOF
    
    log "📄 Report saved to: $report_file"
}

# Function to send alerts (if configured)
send_alerts() {
    local message="$1"
    local severity="$2"
    
    # Send to Slack if configured
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -s -X POST "$SLACK_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"text\": \"🚨 Roo-Cloud Alert [$severity]\",
                \"attachments\": [{
                    \"color\": \"$([ "$severity" = "critical" ] && echo "danger" || echo "warning")\",
                    \"text\": \"$message\"
                }]
            }" > /dev/null 2>&1 || true
    fi
    
    # Send to Discord if configured
    if [ -n "$DISCORD_WEBHOOK_URL" ]; then
        curl -s -X POST "$DISCORD_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"content\": \"🚨 **Roo-Cloud Alert [$severity]**\n\`\`\`$message\`\`\`\"
            }" > /dev/null 2>&1 || true
    fi
}

# Main monitoring function
main() {
    log "🔍 Starting production monitoring check..."
    
    # Create log directory if it doesn't exist
    mkdir -p "$(dirname "$LOG_FILE")"
    
    local exit_code=0
    
    # Run all checks
    check_container_status || exit_code=1
    check_resource_usage
    check_service_health || exit_code=1
    check_logs
    check_backup_status
    check_network || exit_code=1
    
    # Generate report
    generate_report
    
    # Send alerts if there are issues
    if [ $exit_code -ne 0 ]; then
        local alert_message="Production monitoring detected issues. Check logs for details."
        send_alerts "$alert_message" "warning"
        warning "⚠️  Monitoring completed with issues"
    else
        success "✅ All monitoring checks passed"
    fi
    
    log "📊 Monitoring check completed"
    return $exit_code
}

# Handle script arguments
case "${1:-}" in
    "status")
        check_container_status
        ;;
    "resources")
        check_resource_usage
        ;;
    "health")
        check_service_health
        ;;
    "logs")
        check_logs
        ;;
    "backup")
        check_backup_status
        ;;
    "network")
        check_network
        ;;
    "report")
        generate_report
        ;;
    *)
        main
        ;;
esac
