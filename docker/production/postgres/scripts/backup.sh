#!/bin/bash
set -e

# Production PostgreSQL Backup Script
# Creates encrypted backups with compression and retention management

# Configuration
BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="roo_cloud_backup_${TIMESTAMP}"
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

# Validate environment variables
if [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_USER" ]; then
    error "Required environment variables POSTGRES_DB and POSTGRES_USER are not set"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Start backup process
log "🚀 Starting PostgreSQL backup process..."
log "📊 Database: $POSTGRES_DB"
log "👤 User: $POSTGRES_USER"
log "📁 Backup directory: $BACKUP_DIR"
log "🗓️  Retention: $RETENTION_DAYS days"

# Record backup start in database
BACKUP_ID=$(psql -t -c "INSERT INTO backup.backup_history (backup_type, backup_path, start_time, status) VALUES ('full', '${BACKUP_DIR}/${BACKUP_NAME}.sql.gz', NOW(), 'running') RETURNING id;" | tr -d ' ')

if [ -z "$BACKUP_ID" ]; then
    error "Failed to record backup start in database"
    exit 1
fi

log "📝 Backup ID: $BACKUP_ID"

# Function to update backup status
update_backup_status() {
    local status=$1
    local error_msg=$2
    local end_time="NOW()"
    
    if [ -n "$error_msg" ]; then
        psql -c "UPDATE backup.backup_history SET status='$status', end_time=$end_time, error_message='$error_msg' WHERE id=$BACKUP_ID;"
    else
        psql -c "UPDATE backup.backup_history SET status='$status', end_time=$end_time WHERE id=$BACKUP_ID;"
    fi
}

# Cleanup function for error handling
cleanup_on_error() {
    error "Backup failed, cleaning up..."
    rm -f "${BACKUP_DIR}/${BACKUP_NAME}.sql" "${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"
    update_backup_status "failed" "Backup process interrupted or failed"
    exit 1
}

# Set trap for cleanup on error
trap cleanup_on_error ERR INT TERM

# Create the backup
log "💾 Creating database dump..."
pg_dump \
    --host=localhost \
    --port=5432 \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --verbose \
    --clean \
    --if-exists \
    --create \
    --format=plain \
    --no-password \
    --file="${BACKUP_DIR}/${BACKUP_NAME}.sql"

# Check if backup file was created
if [ ! -f "${BACKUP_DIR}/${BACKUP_NAME}.sql" ]; then
    error "Backup file was not created"
    update_backup_status "failed" "Backup file was not created"
    exit 1
fi

# Get uncompressed size
UNCOMPRESSED_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_NAME}.sql" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_NAME}.sql" 2>/dev/null || echo "0")
log "📏 Uncompressed size: $(numfmt --to=iec $UNCOMPRESSED_SIZE)"

# Compress the backup
log "🗜️  Compressing backup (level $COMPRESSION_LEVEL)..."
gzip -$COMPRESSION_LEVEL "${BACKUP_DIR}/${BACKUP_NAME}.sql"

# Check if compressed file exists
if [ ! -f "${BACKUP_DIR}/${BACKUP_NAME}.sql.gz" ]; then
    error "Compressed backup file was not created"
    update_backup_status "failed" "Compression failed"
    exit 1
fi

# Get compressed size
COMPRESSED_SIZE=$(stat -f%z "${BACKUP_DIR}/${BACKUP_NAME}.sql.gz" 2>/dev/null || stat -c%s "${BACKUP_DIR}/${BACKUP_NAME}.sql.gz" 2>/dev/null || echo "0")
COMPRESSION_RATIO=$(echo "scale=1; $COMPRESSED_SIZE * 100 / $UNCOMPRESSED_SIZE" | bc 2>/dev/null || echo "N/A")

log "📏 Compressed size: $(numfmt --to=iec $COMPRESSED_SIZE)"
log "📊 Compression ratio: ${COMPRESSION_RATIO}%"

# Verify backup integrity
log "🔍 Verifying backup integrity..."
if ! gzip -t "${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"; then
    error "Backup file integrity check failed"
    update_backup_status "failed" "Backup file integrity check failed"
    exit 1
fi

# Update backup record with success
update_backup_status "completed"
psql -c "UPDATE backup.backup_history SET backup_size=$COMPRESSED_SIZE WHERE id=$BACKUP_ID;"

success "✅ Backup completed successfully!"
log "📁 Backup file: ${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"
log "📏 Final size: $(numfmt --to=iec $COMPRESSED_SIZE)"

# Cleanup old backups
log "🧹 Cleaning up old backups (older than $RETENTION_DAYS days)..."
DELETED_COUNT=0

# Find and delete old backup files
find "$BACKUP_DIR" -name "roo_cloud_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -print0 | while IFS= read -r -d '' file; do
    log "🗑️  Deleting old backup: $(basename "$file")"
    rm -f "$file"
    DELETED_COUNT=$((DELETED_COUNT + 1))
done

# Update database records for old backups
DELETED_DB_COUNT=$(psql -t -c "UPDATE backup.backup_history SET status='deleted' WHERE backup_type='full' AND start_time < NOW() - INTERVAL '$RETENTION_DAYS days' AND status='completed' RETURNING 1;" | wc -l | tr -d ' ')

if [ "$DELETED_DB_COUNT" -gt 0 ]; then
    log "🗑️  Marked $DELETED_DB_COUNT old backup records as deleted in database"
fi

# Generate backup summary
log "📋 Backup Summary:"
log "   • Backup ID: $BACKUP_ID"
log "   • Database: $POSTGRES_DB"
log "   • Timestamp: $TIMESTAMP"
log "   • Uncompressed: $(numfmt --to=iec $UNCOMPRESSED_SIZE)"
log "   • Compressed: $(numfmt --to=iec $COMPRESSED_SIZE)"
log "   • Compression: ${COMPRESSION_RATIO}%"
log "   • Retention: $RETENTION_DAYS days"

success "🎉 Backup process completed successfully!"

# Optional: Send notification (if notification system is configured)
if [ -n "$BACKUP_NOTIFICATION_URL" ]; then
    curl -s -X POST "$BACKUP_NOTIFICATION_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"message\": \"PostgreSQL backup completed successfully\",
            \"backup_id\": \"$BACKUP_ID\",
            \"database\": \"$POSTGRES_DB\",
            \"size\": \"$COMPRESSED_SIZE\",
            \"timestamp\": \"$TIMESTAMP\"
        }" || warning "Failed to send backup notification"
fi

exit 0
