#!/bin/bash
set -e

# Production PostgreSQL Restore Script
# Restores database from compressed backup files with safety checks

# Configuration
BACKUP_DIR="/backups"
RESTORE_DB_SUFFIX="_restore_$(date +%Y%m%d_%H%M%S)"

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

# Usage function
usage() {
    echo "Usage: $0 [OPTIONS] <backup_file>"
    echo ""
    echo "Options:"
    echo "  -f, --force           Force restore without confirmation"
    echo "  -t, --test           Test restore to temporary database"
    echo "  -d, --database NAME  Target database name (default: \$POSTGRES_DB)"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 roo_cloud_backup_20241223_120000.sql.gz"
    echo "  $0 --test roo_cloud_backup_20241223_120000.sql.gz"
    echo "  $0 --force --database roo_cloud_test backup.sql.gz"
    exit 1
}

# Parse command line arguments
FORCE=false
TEST_MODE=false
TARGET_DB=""
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE=true
            shift
            ;;
        -t|--test)
            TEST_MODE=true
            shift
            ;;
        -d|--database)
            TARGET_DB="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        -*)
            error "Unknown option $1"
            usage
            ;;
        *)
            if [ -z "$BACKUP_FILE" ]; then
                BACKUP_FILE="$1"
            else
                error "Multiple backup files specified"
                usage
            fi
            shift
            ;;
    esac
done

# Validate arguments
if [ -z "$BACKUP_FILE" ]; then
    error "Backup file not specified"
    usage
fi

# Set target database
if [ -z "$TARGET_DB" ]; then
    if [ "$TEST_MODE" = true ]; then
        TARGET_DB="${POSTGRES_DB}${RESTORE_DB_SUFFIX}"
    else
        TARGET_DB="$POSTGRES_DB"
    fi
fi

# Validate environment variables
if [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_USER" ]; then
    error "Required environment variables POSTGRES_DB and POSTGRES_USER are not set"
    exit 1
fi

# Check if backup file exists
BACKUP_PATH=""
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_PATH="$BACKUP_FILE"
elif [ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
    BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"
else
    error "Backup file not found: $BACKUP_FILE"
    error "Searched in current directory and $BACKUP_DIR"
    exit 1
fi

log "🚀 Starting PostgreSQL restore process..."
log "📁 Backup file: $BACKUP_PATH"
log "📊 Target database: $TARGET_DB"
log "🧪 Test mode: $TEST_MODE"
log "⚡ Force mode: $FORCE"

# Verify backup file integrity
log "🔍 Verifying backup file integrity..."
if [[ "$BACKUP_PATH" == *.gz ]]; then
    if ! gzip -t "$BACKUP_PATH"; then
        error "Backup file integrity check failed"
        exit 1
    fi
    success "✅ Backup file integrity verified"
else
    log "ℹ️  Backup file is not compressed, skipping integrity check"
fi

# Get backup file size
BACKUP_SIZE=$(stat -f%z "$BACKUP_PATH" 2>/dev/null || stat -c%s "$BACKUP_PATH" 2>/dev/null || echo "0")
log "📏 Backup file size: $(numfmt --to=iec $BACKUP_SIZE)"

# Safety confirmation (unless force mode or test mode)
if [ "$FORCE" = false ] && [ "$TEST_MODE" = false ]; then
    warning "⚠️  This will REPLACE the existing database: $TARGET_DB"
    warning "⚠️  All current data will be LOST!"
    echo ""
    read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirmation
    if [ "$confirmation" != "yes" ]; then
        log "Restore cancelled by user"
        exit 0
    fi
fi

# Record restore start in database (if not in test mode and target DB exists)
RESTORE_ID=""
if [ "$TEST_MODE" = false ]; then
    RESTORE_ID=$(psql -t -c "INSERT INTO backup.backup_history (backup_type, backup_path, start_time, status) VALUES ('restore', '$BACKUP_PATH', NOW(), 'running') RETURNING id;" 2>/dev/null | tr -d ' ' || echo "")
    if [ -n "$RESTORE_ID" ]; then
        log "📝 Restore ID: $RESTORE_ID"
    fi
fi

# Function to update restore status
update_restore_status() {
    local status=$1
    local error_msg=$2
    
    if [ -n "$RESTORE_ID" ]; then
        if [ -n "$error_msg" ]; then
            psql -c "UPDATE backup.backup_history SET status='$status', end_time=NOW(), error_message='$error_msg' WHERE id=$RESTORE_ID;" 2>/dev/null || true
        else
            psql -c "UPDATE backup.backup_history SET status='$status', end_time=NOW() WHERE id=$RESTORE_ID;" 2>/dev/null || true
        fi
    fi
}

# Cleanup function for error handling
cleanup_on_error() {
    error "Restore failed, cleaning up..."
    
    # Remove temporary database if in test mode
    if [ "$TEST_MODE" = true ]; then
        log "🧹 Cleaning up test database: $TARGET_DB"
        psql -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" 2>/dev/null || true
    fi
    
    update_restore_status "failed" "Restore process interrupted or failed"
    exit 1
}

# Set trap for cleanup on error
trap cleanup_on_error ERR INT TERM

# Create target database if in test mode
if [ "$TEST_MODE" = true ]; then
    log "🧪 Creating test database: $TARGET_DB"
    psql -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";"
    psql -c "CREATE DATABASE \"$TARGET_DB\";"
fi

# Perform the restore
log "💾 Starting database restore..."

if [[ "$BACKUP_PATH" == *.gz ]]; then
    log "🗜️  Decompressing and restoring from compressed backup..."
    gunzip -c "$BACKUP_PATH" | psql --username="$POSTGRES_USER" --dbname="$TARGET_DB" --quiet
else
    log "📄 Restoring from uncompressed backup..."
    psql --username="$POSTGRES_USER" --dbname="$TARGET_DB" --quiet -f "$BACKUP_PATH"
fi

# Verify restore success
log "🔍 Verifying restore success..."

# Check if we can connect to the restored database
if ! psql --username="$POSTGRES_USER" --dbname="$TARGET_DB" -c "SELECT 1;" > /dev/null 2>&1; then
    error "Cannot connect to restored database"
    cleanup_on_error
fi

# Get table count as a basic verification
TABLE_COUNT=$(psql --username="$POSTGRES_USER" --dbname="$TARGET_DB" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
log "📊 Restored tables count: $TABLE_COUNT"

# Update restore record with success
update_restore_status "completed"

success "✅ Database restore completed successfully!"
log "📊 Target database: $TARGET_DB"
log "📏 Backup size: $(numfmt --to=iec $BACKUP_SIZE)"
log "📊 Tables restored: $TABLE_COUNT"

# Test mode specific actions
if [ "$TEST_MODE" = true ]; then
    log "🧪 Test restore completed. Database created: $TARGET_DB"
    log "🔍 You can now verify the restored data manually"
    log "🧹 To clean up the test database, run:"
    log "   psql -c \"DROP DATABASE \\\"$TARGET_DB\\\";\""
else
    log "🎉 Production restore completed successfully!"
    
    # Run a basic health check
    log "🏥 Running post-restore health check..."
    if psql --username="$POSTGRES_USER" --dbname="$TARGET_DB" -c "SELECT version();" > /dev/null 2>&1; then
        success "✅ Database health check passed"
    else
        warning "⚠️  Database health check failed"
    fi
fi

# Generate restore summary
log "📋 Restore Summary:"
log "   • Target Database: $TARGET_DB"
log "   • Backup File: $(basename "$BACKUP_PATH")"
log "   • Backup Size: $(numfmt --to=iec $BACKUP_SIZE)"
log "   • Tables Count: $TABLE_COUNT"
log "   • Test Mode: $TEST_MODE"
log "   • Restore ID: ${RESTORE_ID:-N/A}"

success "🎉 Restore process completed successfully!"

exit 0
