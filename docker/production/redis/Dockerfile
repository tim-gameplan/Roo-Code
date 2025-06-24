FROM redis:7-alpine

# Install additional tools for production
RUN apk add --no-cache \
    curl \
    bash \
    && rm -rf /var/cache/apk/*

# Create non-root user for Redis
RUN addgroup -g 999 redis_prod && \
    adduser -D -u 999 -G redis_prod redis_prod

# Create necessary directories
RUN mkdir -p /var/log/redis /data && \
    chown -R redis_prod:redis_prod /var/log/redis /data

# Copy production configuration
COPY config/redis.conf /etc/redis/redis.conf

# Copy scripts
COPY scripts/health-check.sh /usr/local/bin/
COPY scripts/backup.sh /usr/local/bin/

# Set proper permissions
RUN chmod +x /usr/local/bin/health-check.sh && \
    chmod +x /usr/local/bin/backup.sh

# Switch to non-root user
USER redis_prod

# Expose Redis port
EXPOSE 6379

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Start Redis with custom configuration
CMD ["redis-server", "/etc/redis/redis.conf"]
