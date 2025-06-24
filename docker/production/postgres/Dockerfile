FROM postgres:15-alpine

# Install additional extensions and security tools
RUN apk add --no-cache \
    postgresql-contrib \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user for PostgreSQL
RUN addgroup -g 999 postgres_prod && \
    adduser -D -u 999 -G postgres_prod postgres_prod

# Create necessary directories
RUN mkdir -p /var/log/postgresql /backups /migrations && \
    chown -R postgres_prod:postgres_prod /var/log/postgresql /backups /migrations

# Copy production configuration
COPY config/postgresql.conf /etc/postgresql/postgresql.conf
COPY config/pg_hba.conf /etc/postgresql/pg_hba.conf

# Copy initialization and backup scripts
COPY scripts/init-prod.sh /docker-entrypoint-initdb.d/
COPY scripts/backup.sh /usr/local/bin/
COPY scripts/restore.sh /usr/local/bin/

# Set proper permissions
RUN chmod +x /docker-entrypoint-initdb.d/init-prod.sh && \
    chmod +x /usr/local/bin/backup.sh && \
    chmod +x /usr/local/bin/restore.sh

# Create health check script
COPY scripts/health-check.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/health-check.sh

# Switch to non-root user
USER postgres_prod

# Expose PostgreSQL port
EXPOSE 5432

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Start PostgreSQL with custom configuration
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
