#!/bin/bash
set -e

# Production Redis Backup Script
# Creates backups of Redis data with compression and retention management

# Configuration
BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="redis_backup_${TIMESTAMP}"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
COMPRESSION_LEVEL=${BACKUP_COMPRESSION_LEVEL:-6}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to execute Redis commands
redis_cmd() {
    if [ -n "$REDIS_PASSWORD" ]; then
        redis-cli -a "$REDIS_PASSWORD" "$@" 2>/dev/null
    else
        redis-cli "$@" 2>/dev/null
    fi
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Start backup process
log "🚀 Starting Redis backup process..."
log "📁 Backup directory: $BACKUP_DIR"
log "🗓️  Retention: $RETENTION_DAYS days"

# Check Redis connectivity
log "🔌 Checking Redis connectivity..."
if ! redis_cmd ping > /dev/null 2>&1; then
    error "Cannot connect to Redis server"
    exit 1
fi
success "✅ Connected to Redis server"

# Get Redis info
REDIS_VERSION=$(redis_cmd INFO server | grep "redis_version:" | cut -d: -f2 | tr -d '\r')
USED_MEMORY=$(redis_cmd INFO memory | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r')
KEYSPACE_INFO=$(redis_cmd INFO keyspace)

log "📊 Redis version: $REDIS_VERSION"
log "💾 Memory used: $USED_MEMORY"

# Count total keys across all databases
TOTAL_KEYS=0
if [ -n "$KEYSPACE_INFO" ]; then
    while IFS= read -r line; do
        if [[ $line == db*:* ]]; then
            KEYS=$(echo "$line" | grep -o "keys=[0-9]*" | cut -d= -f2)
            TOTAL_KEYS=$((TOTAL_KEYS + KEYS))
        fi
    done <<< "$KEYSPACE_INFO"
fi
log "🔑 Total keys: $TOTAL_KEYS"

# Cleanup function for error handling
cleanup_on_error() {
    error "Backup failed, cleaning up..."
    rm -f "${BACKUP_DIR}/${BACKUP_NAME}.rdb" "${BACKUP_DIR}/${BACKUP_NAME}.rdb.gz"
    exit 1
}

# Set trap for cleanup on error
trap cleanup_on_error ERR INT TERM

# Create RDB backup using BGSAVE
log "💾 Creating RDB backup..."
redis_cmd BGSAVE

# Wait for background save to complete
log "⏳ Waiting for background save to complete..."
while [ "$(redis_cmd LASTSAVE)" = "$(redis_cmd LASTSAVE)" ]; do
    if redis_cmd INFO persistence | grep -q "rdb_bgsave_in_progress:0"; then
        break
    fi
    sleep 1
done

# Get the RDB file location
RDB_FILE="/data/dump.rdb"
if [ ! -f "$RDB_FILE" ]; then
    error "RDB file not found at $RDB_FILE"
    exit 1
fi

# Copy RDB file to backup location
log "📁 Copying RDB file to backup location..."
cp "$RDB_FILE" "${BACKUP_DIR}/${BACKUP_NAME}.rdb"

# Check if backup file was created
if [ ! -f "${BACKUP_DIR}/${BACKUP_NAME}.rdb" ]; then
    error "Backup file was not created"
    exit 1
fi

# Get uncompressed size
UNCOMPRESSED_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_NAME}.rdb" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_NAME}.rdb" 2>/dev/null || echo "0")
log "📏 Uncompressed size: $(numfmt --to=iec $UNCOMPRESSED_SIZE)"

# Compress the backup
log "🗜️  Compressing backup (level $COMPRESSION_LEVEL)..."
gzip -$COMPRESSION_LEVEL "${BACKUP_DIR}/${BACKUP_NAME}.rdb"

# Check if compressed file exists
if [ ! -f "${BACKUP_DIR}/${BACKUP_NAME}.rdb.gz" ]; then
    error "Compressed backup file was not created"
    exit 1
fi

# Get compressed size
COMPRESSED_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_NAME}.rdb.gz" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_NAME}.rdb.gz" 2>/dev/null || echo "0")
COMPRESSION_RATIO=$(echo "scale=1; $COMPRESSED_SIZE * 100 / $UNCOMPRESSED_SIZE" | bc 2>/dev/null || echo "N/A")

log "📏 Compressed size: $(numfmt --to=iec $COMPRESSED_SIZE)"
log "📊 Compression ratio: ${COMPRESSION_RATIO}%"

# Verify backup integrity
log "🔍 Verifying backup integrity..."
if ! gzip -t "${BACKUP_DIR}/${BACKUP_NAME}.rdb.gz"; then
    error "Backup file integrity check failed"
    exit 1
fi

success "✅ Backup completed successfully!"
log "📁 Backup file: ${BACKUP_DIR}/${BACKUP_NAME}.rdb.gz"
log "📏 Final size: $(numfmt --to=iec $COMPRESSED_SIZE)"

# Create AOF backup if enabled
AOF_ENABLED=$(redis_cmd CONFIG GET appendonly | tail -1)
if [ "$AOF_ENABLED" = "yes" ]; then
    log "📝 Creating AOF backup..."
    
    AOF_FILE="/data/appendonly.aof"
    if [ -f "$AOF_FILE" ]; then
        cp "$AOF_FILE" "${BACKUP_DIR}/${BACKUP_NAME}.aof"
        
        # Compress AOF backup
        gzip -$COMPRESSION_LEVEL "${BACKUP_DIR}/${BACKUP_NAME}.aof"
        
        AOF_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_NAME}.aof.gz" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_NAME}.aof.gz" 2>/dev/null || echo "0")
        log "📝 AOF backup size: $(numfmt --to=iec $AOF_SIZE)"
        success "✅ AOF backup completed"
    else
        warning "⚠️  AOF file not found, skipping AOF backup"
    fi
fi

# Create backup metadata
log "📋 Creating backup metadata..."
cat > "${BACKUP_DIR}/${BACKUP_NAME}.meta" << EOF
{
  "timestamp": "$TIMESTAMP",
  "redis_version": "$REDIS_VERSION",
  "total_keys": $TOTAL_KEYS,
  "used_memory": "$USED_MEMORY",
  "uncompressed_size": $UNCOMPRESSED_SIZE,
  "compressed_size": $COMPRESSED_SIZE,
  "compression_ratio": "$COMPRESSION_RATIO",
  "aof_enabled": "$AOF_ENABLED",
  "backup_type": "full"
}
EOF

# Cleanup old backups
log "🧹 Cleaning up old backups (older than $RETENTION_DAYS days)..."
DELETED_COUNT=0

# Find and delete old backup files
find "$BACKUP_DIR" -name "redis_backup_*.rdb.gz" -type f -mtime +$RETENTION_DAYS -print0 | while IFS= read -r -d '' file; do
    log "🗑️  Deleting old backup: $(basename "$file")"
    rm -f "$file"
    
    # Also delete associated files
    BASE_NAME=$(basename "$file" .rdb.gz)
    rm -f "${BACKUP_DIR}/${BASE_NAME}.aof.gz"
    rm -f "${BACKUP_DIR}/${BASE_NAME}.meta"
    
    DELETED_COUNT=$((DELETED_COUNT + 1))
done

if [ $DELETED_COUNT -gt 0 ]; then
    log "🗑️  Deleted $DELETED_COUNT old backup sets"
fi

# Generate backup summary
log "📋 Backup Summary:"
log "   • Timestamp: $TIMESTAMP"
log "   • Redis Version: $REDIS_VERSION"
log "   • Total Keys: $TOTAL_KEYS"
log "   • Memory Used: $USED_MEMORY"
log "   • Uncompressed: $(numfmt --to=iec $UNCOMPRESSED_SIZE)"
log "   • Compressed: $(numfmt --to=iec $COMPRESSED_SIZE)"
log "   • Compression: ${COMPRESSION_RATIO}%"
log "   • AOF Enabled: $AOF_ENABLED"
log "   • Retention: $RETENTION_DAYS days"

success "🎉 Redis backup process completed successfully!"

# Optional: Send notification (if notification system is configured)
if [ -n "$BACKUP_NOTIFICATION_URL" ]; then
    curl -s -X POST "$BACKUP_NOTIFICATION_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"message\": \"Redis backup completed successfully\",
            \"timestamp\": \"$TIMESTAMP\",
            \"redis_version\": \"$REDIS_VERSION\",
            \"total_keys\": $TOTAL_KEYS,
            \"size\": \"$COMPRESSED_SIZE\"
        }" || warning "Failed to send backup notification"
fi

exit 0
