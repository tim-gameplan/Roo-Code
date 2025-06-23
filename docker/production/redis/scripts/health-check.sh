#!/bin/bash
set -e

# Production Redis Health Check Script
# Comprehensive health monitoring for production Redis

# Configuration
MEMORY_USAGE_THRESHOLD=80     # Alert if memory usage > 80%
RESPONSE_TIME_THRESHOLD=100   # Alert if response time > 100ms
SLOW_LOG_THRESHOLD=10         # Alert if slow log has > 10 entries

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Health check status
HEALTH_STATUS="healthy"
HEALTH_ISSUES=()

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    HEALTH_STATUS="unhealthy"
    HEALTH_ISSUES+=("$1")
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    if [ "$HEALTH_STATUS" = "healthy" ]; then
        HEALTH_STATUS="degraded"
    fi
    HEALTH_ISSUES+=("$1")
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

# Function to check basic connectivity
check_connectivity() {
    log "🔌 Checking Redis connectivity..."
    
    local start_time=$(date +%s%3N)
    
    if [ -n "$REDIS_PASSWORD" ]; then
        if redis-cli -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
            local end_time=$(date +%s%3N)
            local response_time=$((end_time - start_time))
            
            if [ $response_time -gt $RESPONSE_TIME_THRESHOLD ]; then
                warning "Redis response time is slow: ${response_time}ms (threshold: ${RESPONSE_TIME_THRESHOLD}ms)"
            else
                success "Redis is responding (${response_time}ms)"
            fi
        else
            error "Redis is not responding to ping"
            return 1
        fi
    else
        if redis-cli ping > /dev/null 2>&1; then
            local end_time=$(date +%s%3N)
            local response_time=$((end_time - start_time))
            
            if [ $response_time -gt $RESPONSE_TIME_THRESHOLD ]; then
                warning "Redis response time is slow: ${response_time}ms (threshold: ${RESPONSE_TIME_THRESHOLD}ms)"
            else
                success "Redis is responding (${response_time}ms)"
            fi
        else
            error "Redis is not responding to ping"
            return 1
        fi
    fi
}

# Function to execute Redis commands
redis_cmd() {
    if [ -n "$REDIS_PASSWORD" ]; then
        redis-cli -a "$REDIS_PASSWORD" "$@" 2>/dev/null
    else
        redis-cli "$@" 2>/dev/null
    fi
}

# Function to check Redis info
check_redis_info() {
    log "📊 Checking Redis information..."
    
    local version=$(redis_cmd INFO server | grep "redis_version:" | cut -d: -f2 | tr -d '\r')
    if [ -n "$version" ]; then
        success "Redis version: $version"
    else
        error "Unable to retrieve Redis version"
        return 1
    fi
    
    local uptime=$(redis_cmd INFO server | grep "uptime_in_seconds:" | cut -d: -f2 | tr -d '\r')
    if [ -n "$uptime" ]; then
        local uptime_hours=$((uptime / 3600))
        local uptime_minutes=$(((uptime % 3600) / 60))
        success "Redis uptime: ${uptime_hours}h ${uptime_minutes}m"
    else
        warning "Unable to retrieve Redis uptime"
    fi
}

# Function to check memory usage
check_memory_usage() {
    log "💾 Checking memory usage..."
    
    local used_memory=$(redis_cmd INFO memory | grep "used_memory:" | cut -d: -f2 | tr -d '\r')
    local max_memory=$(redis_cmd CONFIG GET maxmemory | tail -1)
    
    if [ -n "$used_memory" ] && [ -n "$max_memory" ] && [ "$max_memory" != "0" ]; then
        local usage_percent=$((used_memory * 100 / max_memory))
        
        if [ $usage_percent -gt $MEMORY_USAGE_THRESHOLD ]; then
            warning "High memory usage: ${usage_percent}% (threshold: ${MEMORY_USAGE_THRESHOLD}%)"
        else
            success "Memory usage: ${usage_percent}%"
        fi
        
        local used_memory_human=$(redis_cmd INFO memory | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r')
        success "Memory used: $used_memory_human"
    else
        warning "Unable to retrieve memory usage information"
    fi
}

# Function to check connected clients
check_clients() {
    log "👥 Checking connected clients..."
    
    local connected_clients=$(redis_cmd INFO clients | grep "connected_clients:" | cut -d: -f2 | tr -d '\r')
    local max_clients=$(redis_cmd CONFIG GET maxclients | tail -1)
    
    if [ -n "$connected_clients" ] && [ -n "$max_clients" ]; then
        local usage_percent=$((connected_clients * 100 / max_clients))
        
        if [ $usage_percent -gt 80 ]; then
            warning "High client connection usage: ${connected_clients}/${max_clients} (${usage_percent}%)"
        else
            success "Connected clients: ${connected_clients}/${max_clients} (${usage_percent}%)"
        fi
    else
        warning "Unable to retrieve client connection information"
    fi
}

# Function to check keyspace
check_keyspace() {
    log "🔑 Checking keyspace information..."
    
    local keyspace_info=$(redis_cmd INFO keyspace)
    if [ -n "$keyspace_info" ]; then
        local db_count=$(echo "$keyspace_info" | grep -c "db[0-9]" || echo "0")
        if [ $db_count -gt 0 ]; then
            success "Active databases: $db_count"
            
            # Check each database
            echo "$keyspace_info" | grep "db[0-9]" | while read -r line; do
                local db_name=$(echo "$line" | cut -d: -f1)
                local keys=$(echo "$line" | cut -d: -f2 | grep -o "keys=[0-9]*" | cut -d= -f2)
                success "  $db_name: $keys keys"
            done
        else
            success "No active databases with keys"
        fi
    else
        warning "Unable to retrieve keyspace information"
    fi
}

# Function to check persistence
check_persistence() {
    log "💾 Checking persistence status..."
    
    # Check RDB status
    local rdb_last_save=$(redis_cmd LASTSAVE 2>/dev/null)
    if [ -n "$rdb_last_save" ]; then
        local current_time=$(date +%s)
        local time_since_save=$((current_time - rdb_last_save))
        local hours_since_save=$((time_since_save / 3600))
        
        if [ $hours_since_save -gt 24 ]; then
            warning "RDB: Last save was ${hours_since_save} hours ago"
        else
            success "RDB: Last save was ${hours_since_save} hours ago"
        fi
    else
        warning "Unable to retrieve RDB save information"
    fi
    
    # Check AOF status
    local aof_enabled=$(redis_cmd CONFIG GET appendonly | tail -1)
    if [ "$aof_enabled" = "yes" ]; then
        success "AOF: Enabled"
        
        local aof_size=$(redis_cmd INFO persistence | grep "aof_current_size:" | cut -d: -f2 | tr -d '\r')
        if [ -n "$aof_size" ]; then
            local aof_size_mb=$((aof_size / 1024 / 1024))
            success "AOF: Current size ${aof_size_mb}MB"
        fi
    else
        success "AOF: Disabled"
    fi
}

# Function to check slow log
check_slow_log() {
    log "🐌 Checking slow log..."
    
    local slow_log_count=$(redis_cmd SLOWLOG LEN 2>/dev/null)
    if [ -n "$slow_log_count" ]; then
        if [ $slow_log_count -gt $SLOW_LOG_THRESHOLD ]; then
            warning "Slow log has $slow_log_count entries (threshold: $SLOW_LOG_THRESHOLD)"
        else
            success "Slow log entries: $slow_log_count"
        fi
    else
        warning "Unable to retrieve slow log information"
    fi
}

# Function to check replication
check_replication() {
    log "🔄 Checking replication status..."
    
    local role=$(redis_cmd INFO replication | grep "role:" | cut -d: -f2 | tr -d '\r')
    if [ -n "$role" ]; then
        success "Role: $role"
        
        if [ "$role" = "master" ]; then
            local connected_slaves=$(redis_cmd INFO replication | grep "connected_slaves:" | cut -d: -f2 | tr -d '\r')
            success "Connected slaves: ${connected_slaves:-0}"
        elif [ "$role" = "slave" ]; then
            local master_link_status=$(redis_cmd INFO replication | grep "master_link_status:" | cut -d: -f2 | tr -d '\r')
            if [ "$master_link_status" = "up" ]; then
                success "Master link: up"
            else
                warning "Master link: $master_link_status"
            fi
        fi
    else
        warning "Unable to retrieve replication information"
    fi
}

# Main health check execution
main() {
    log "🏥 Starting Redis health check..."
    
    # Run all health checks
    check_connectivity || exit 1
    check_redis_info
    check_memory_usage
    check_clients
    check_keyspace
    check_persistence
    check_slow_log
    check_replication
    
    # Generate summary
    log "📋 Health Check Summary:"
    log "   • Status: $HEALTH_STATUS"
    log "   • Issues found: ${#HEALTH_ISSUES[@]}"
    
    if [ ${#HEALTH_ISSUES[@]} -gt 0 ]; then
        log "   • Issues:"
        for issue in "${HEALTH_ISSUES[@]}"; do
            log "     - $issue"
        done
    fi
    
    # Set exit code based on health status
    case $HEALTH_STATUS in
        "healthy")
            success "✅ Redis health check passed"
            exit 0
            ;;
        "degraded")
            warning "⚠️  Redis health check completed with warnings"
            exit 0
            ;;
        "unhealthy")
            error "❌ Redis health check failed"
            exit 1
            ;;
    esac
}

# Run the health check
main "$@"
