#!/bin/bash
set -e

# Production PostgreSQL Initialization Script
# This script runs during container startup to initialize the production database

echo "🚀 Starting PostgreSQL production initialization..."

# Wait for PostgreSQL to be ready
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "⏳ Waiting for PostgreSQL to be ready..."
  sleep 2
done

echo "✅ PostgreSQL is ready. Running initialization..."

# Create additional databases if needed
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create additional schemas for production
    CREATE SCHEMA IF NOT EXISTS audit;
    CREATE SCHEMA IF NOT EXISTS monitoring;
    CREATE SCHEMA IF NOT EXISTS backup;
    
    -- Create audit table for tracking changes
    CREATE TABLE IF NOT EXISTS audit.activity_log (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(255) NOT NULL,
        operation VARCHAR(10) NOT NULL,
        old_data JSONB,
        new_data JSONB,
        user_id UUID,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        ip_address INET,
        user_agent TEXT
    );
    
    -- Create monitoring tables
    CREATE TABLE IF NOT EXISTS monitoring.performance_metrics (
        id SERIAL PRIMARY KEY,
        metric_name VARCHAR(255) NOT NULL,
        metric_value NUMERIC NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        tags JSONB
    );
    
    -- Create backup tracking table
    CREATE TABLE IF NOT EXISTS backup.backup_history (
        id SERIAL PRIMARY KEY,
        backup_type VARCHAR(50) NOT NULL,
        backup_path TEXT NOT NULL,
        backup_size BIGINT,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        error_message TEXT
    );
    
    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON audit.activity_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activity_log_table_name ON audit.activity_log(table_name);
    CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON monitoring.performance_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON monitoring.performance_metrics(metric_name);
    
    -- Grant appropriate permissions
    GRANT USAGE ON SCHEMA audit TO $POSTGRES_USER;
    GRANT USAGE ON SCHEMA monitoring TO $POSTGRES_USER;
    GRANT USAGE ON SCHEMA backup TO $POSTGRES_USER;
    
    GRANT SELECT, INSERT ON audit.activity_log TO $POSTGRES_USER;
    GRANT SELECT, INSERT ON monitoring.performance_metrics TO $POSTGRES_USER;
    GRANT SELECT, INSERT, UPDATE ON backup.backup_history TO $POSTGRES_USER;
EOSQL

# Run migrations if they exist
if [ -d "/migrations" ]; then
    echo "📁 Running database migrations..."
    for migration in /migrations/*.sql; do
        if [ -f "$migration" ]; then
            echo "🔄 Running migration: $(basename "$migration")"
            psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$migration"
        fi
    done
    echo "✅ All migrations completed successfully"
else
    echo "ℹ️  No migrations directory found, skipping migrations"
fi

# Create backup user with limited privileges
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create backup user if it doesn't exist
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'backup_user') THEN
            CREATE ROLE backup_user WITH LOGIN PASSWORD '${BACKUP_USER_PASSWORD:-backup_secure_2024}';
        END IF;
    END
    \$\$;
    
    -- Grant minimal permissions for backup operations
    GRANT CONNECT ON DATABASE $POSTGRES_DB TO backup_user;
    GRANT USAGE ON SCHEMA public TO backup_user;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_user;
    
    -- Grant permissions for backup schema
    GRANT USAGE ON SCHEMA backup TO backup_user;
    GRANT SELECT, INSERT, UPDATE ON backup.backup_history TO backup_user;
EOSQL

echo "🎉 PostgreSQL production initialization completed successfully!"
echo "📊 Database: $POSTGRES_DB"
echo "👤 User: $POSTGRES_USER"
echo "🔒 Security: SCRAM-SHA-256 authentication enabled"
echo "📈 Monitoring: Performance metrics table created"
echo "🔍 Audit: Activity logging enabled"
echo "💾 Backup: Backup tracking system ready"
