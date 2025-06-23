#!/bin/bash
set -e

# Production PostgreSQL Health Check Script
# Comprehensive health monitoring for production database

# Configuration
MAX_CONNECTIONS_THRESHOLD=80  # Alert if connections > 80% of max
DISK_USAGE_THRESHOLD=85       # Alert if disk usage > 85%
RESPONSE_TIME_THRESHOLD=1000  # Alert if response time > 1000ms

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
    log "🔌 Checking database connectivity..."
    
    local start_time=$(date +%s%3N)
    
    if pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -q; then
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        
        if [ $response_time -gt $RESPONSE_TIME_THRESHOLD ]; then
            warning "Database response time is slow: ${response_time}ms (threshold: ${RESPONSE_TIME_THRESHOLD}ms)"
        else
            success "Database is responding (${response_time}ms)"
        fi
    else
        error "Database is not responding to connection attempts"
        return 1
    fi
}

# Function to check database version and basic info
check_database_info() {
    log "📊 Checking database information..."
    
    local version=$(psql -t -c "SELECT version();" 2>/dev/null | head -1 | xargs)
    if [ -n "$version" ]; then
        success "Database version: $version"
    else
        error "Unable to retrieve database version"
        return 1
    fi
    
    local uptime=$(psql -t -c "SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::int;" 2>/dev/null | xargs)
    if [ -n "$uptime" ]; then
        local uptime_hours=$((uptime / 3600))
        local uptime_minutes=$(((uptime % 3600) / 60))
        success "Database uptime: ${uptime_hours}h ${uptime_minutes}m"
    else
        warning "Unable to retrieve database uptime"
    fi
}

# Function to check connection usage
check_connections() {
    log "👥 Checking connection usage..."
    
    local max_connections=$(psql -t -c "SHOW max_connections;" 2>/dev/null | xargs)
    local current_connections=$(psql -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | xargs)
    
    if [ -n "$max_connections" ] && [ -n "$current_connections" ]; then
        local usage_percent=$((current_connections * 100 / max_connections))
        
        if [ $usage_percent -gt $MAX_CONNECTIONS_THRESHOLD ]; then
            warning "High connection usage: ${current_connections}/${max_connections} (${usage_percent}%)"
        else
            success "Connection usage: ${current_connections}/${max_connections} (${usage_percent}%)"
        fi
    else
        warning "Unable to retrieve connection information"
    fi
}

# Function to check disk usage
check_disk_usage() {
    log "💾 Checking disk usage..."
    
    local db_size=$(psql -t -c "SELECT pg_size_pretty(pg_database_size('${POSTGRES_DB:-postgres}'));" 2>/dev/null | xargs)
    if [ -n "$db_size" ]; then
        success "Database size: $db_size"
    else
        warning "Unable to retrieve database size"
    fi
    
    # Check filesystem usage
    local disk_usage=$(df /var/lib/postgresql/data 2>/dev/null | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ -n "$disk_usage" ]; then
        if [ $disk_usage -gt $DISK_USAGE_THRESHOLD ]; then
            warning "High disk usage: ${disk_usage}% (threshold: ${DISK_USAGE_THRESHOLD}%)"
        else
            success "Disk usage: ${disk_usage}%"
        fi
    else
        warning "Unable to retrieve disk usage information"
    fi
}

# Function to check replication status (if applicable)
check_replication() {
    log "🔄 Checking replication status..."
    
    local is_replica=$(psql -t -c "SELECT pg_is_in_recovery();" 2>/dev/null | xargs)
    
    if [ "$is_replica" = "t" ]; then
        local lag=$(psql -t -c "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()));" 2>/dev/null | xargs)
        if [ -n "$lag" ]; then
            local lag_seconds=$(echo "$lag" | cut -d. -f1)
            if [ $lag_seconds -gt 60 ]; then
                warning "Replication lag is high: ${lag_seconds} seconds"
            else
                success "Replication lag: ${lag_seconds} seconds"
            fi
        else
            warning "Unable to determine replication lag"
        fi
    else
        success "Database is primary (not a replica)"
    fi
}

# Function to check for long-running queries
check_long_queries() {
    log "⏱️  Checking for long-running queries..."
    
    local long_queries=$(psql -t -c "
        SELECT count(*) 
        FROM pg_stat_activity 
        WHERE state = 'active' 
        AND query_start < now() - interval '5 minutes'
        AND query NOT LIKE '%pg_stat_activity%';" 2>/dev/null | xargs)
    
    if [ -n "$long_queries" ] && [ $long_queries -gt 0 ]; then
        warning "Found $long_queries long-running queries (>5 minutes)"
    else
        success "No long-running queries detected"
    fi
}

# Function to check table statistics
check_table_stats() {
    log "📈 Checking table statistics..."
    
    local table_count=$(psql -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
    if [ -n "$table_count" ]; then
        success "Public tables: $table_count"
    else
        warning "Unable to retrieve table count"
    fi
    
    # Check for tables that need vacuum
    local vacuum_needed=$(psql -t -c "
        SELECT count(*) 
        FROM pg_stat_user_tables 
        WHERE n_dead_tup > 1000;" 2>/dev/null | xargs)
    
    if [ -n "$vacuum_needed" ] && [ $vacuum_needed -gt 0 ]; then
        warning "$vacuum_needed tables may need VACUUM (>1000 dead tuples)"
    else
        success "Table maintenance appears up to date"
    fi
}

# Function to check backup status
check_backup_status() {
    log "💾 Checking backup status..."
    
    # Check if backup schema exists
    local backup_schema_exists=$(psql -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'backup');" 2>/dev/null | xargs)
    
    if [ "$backup_schema_exists" = "t" ]; then
        local last_backup=$(psql -t -c "
            SELECT EXTRACT(EPOCH FROM (now() - max(start_time)))::int 
            FROM backup.backup_history 
            WHERE backup_type = 'full' 
            AND status = 'completed';" 2>/dev/null | xargs)
        
        if [ -n "$last_backup" ]; then
            local hours_since_backup=$((last_backup / 3600))
            if [ $hours_since_backup -gt 24 ]; then
                warning "Last successful backup was ${hours_since_backup} hours ago"
            else
                success "Last backup: ${hours_since_backup} hours ago"
            fi
        else
            warning "No successful backups found in history"
        fi
    else
        warning "Backup tracking schema not found"
    fi
}

# Function to record health metrics
record_metrics() {
    log "📊 Recording health metrics..."
    
    # Check if monitoring schema exists
    local monitoring_exists=$(psql -t -c "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'monitoring');" 2>/dev/null | xargs)
    
    if [ "$monitoring_exists" = "t" ]; then
        # Record basic metrics
        psql -c "
            INSERT INTO monitoring.performance_metrics (metric_name, metric_value, tags) VALUES
            ('health_check_status', CASE WHEN '$HEALTH_STATUS' = 'healthy' THEN 1 WHEN '$HEALTH_STATUS' = 'degraded' THEN 0.5 ELSE 0 END, '{\"type\": \"health\"}'),
            ('connection_count', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'), '{\"type\": \"connections\"}'),
            ('database_size_bytes', (SELECT pg_database_size('${POSTGRES_DB:-postgres}')), '{\"type\": \"storage\"}');" 2>/dev/null || warning "Unable to record metrics"
    fi
}

# Main health check execution
main() {
    log "🏥 Starting PostgreSQL health check..."
    
    # Run all health checks
    check_connectivity || exit 1
    check_database_info
    check_connections
    check_disk_usage
    check_replication
    check_long_queries
    check_table_stats
    check_backup_status
    record_metrics
    
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
            success "✅ Database health check passed"
            exit 0
            ;;
        "degraded")
            warning "⚠️  Database health check completed with warnings"
            exit 0
            ;;
        "unhealthy")
            error "❌ Database health check failed"
            exit 1
            ;;
    esac
}

# Run the health check
main "$@"
