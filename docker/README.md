# Roo-Code Docker Infrastructure

This directory contains the complete Docker infrastructure for the Roo-Code project, providing containerized development and production environments.

## 📁 Directory Structure

```
docker/
├── development/           # Development environment
│   ├── docker-compose.yml # Main development compose file
│   ├── postgres/          # PostgreSQL configuration
│   │   └── postgresql.conf
│   ├── redis/             # Redis configuration
│   │   └── redis.conf
│   └── scripts/           # Development scripts
│       ├── start-dev.sh   # Start development environment
│       └── stop-dev.sh    # Stop development environment
├── production/            # Production environment (future)
│   ├── postgres/          # Production PostgreSQL config
│   ├── redis/             # Production Redis config
│   └── scripts/           # Production scripts
└── shared/                # Shared resources
    ├── database/          # Database files
    │   ├── migrations/    # Database migrations
    │   ├── schemas/       # Database schemas
    │   └── seeds/         # Database seed data
    └── monitoring/        # Monitoring configurations
```

## 🚀 Quick Start

### Prerequisites

- Docker Desktop installed and running
- Docker Compose available
- At least 4GB RAM available for containers

### Start Development Environment

```bash
# Navigate to development scripts
cd docker/development/scripts

# Start all services
./start-dev.sh
```

### Stop Development Environment

```bash
# Stop services (preserve data)
./stop-dev.sh

# Stop and remove all data
./stop-dev.sh --volumes

# Complete cleanup (remove data and images)
./stop-dev.sh --clean
```

## 🔧 Development Services

The development environment includes:

### PostgreSQL Database

- **Host**: `localhost:5432`
- **Database**: `roo_code_dev`
- **Username**: `roo_dev`
- **Password**: `dev_password_2024`
- **Features**: Optimized for development, enhanced logging

### Redis Cache

- **Host**: `localhost:6379`
- **Authentication**: None (development only)
- **Features**: Persistence enabled, monitoring configured

### PgAdmin (Database Management)

- **URL**: http://localhost:8080
- **Email**: `dev@roo-code.local`
- **Password**: `dev_admin_2024`
- **Features**: Pre-configured server connection

### Redis Commander (Redis Management)

- **URL**: http://localhost:8081
- **Username**: `dev`
- **Password**: `dev_redis_2024`
- **Features**: Real-time Redis monitoring

## 📊 Service Health Monitoring

All services include health checks:

- **PostgreSQL**: Connection test every 10 seconds
- **Redis**: Ping test every 10 seconds
- **PgAdmin**: HTTP health check
- **Redis Commander**: HTTP health check

## 🔍 Useful Commands

### View Service Status

```bash
cd docker/development
docker-compose ps
```

### View Service Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Restart Individual Service

```bash
docker-compose restart postgres
docker-compose restart redis
```

### Access Service Containers

```bash
# PostgreSQL shell
docker-compose exec postgres psql -U roo_dev -d roo_code_dev

# Redis CLI
docker-compose exec redis redis-cli
```

## 🗄️ Database Management

### Migrations

Place SQL migration files in `shared/database/migrations/`:

- Files are automatically executed on container startup
- Use numbered prefixes for ordering: `001_initial.sql`, `002_users.sql`

### Schemas

Place schema definitions in `shared/database/schemas/`:

- Table definitions
- Index definitions
- Function definitions

### Seed Data

Place seed data in `shared/database/seeds/`:

- Development test data
- Reference data
- Sample records

## 🔒 Security Notes

### Development Environment

- **No authentication** on Redis (development only)
- **Simple passwords** for database access
- **Open network access** for containers
- **Debug logging** enabled

### Production Environment

- Strong authentication required
- Encrypted connections
- Network isolation
- Audit logging enabled

## 🚨 Troubleshooting

### Port Conflicts

If ports are already in use:

```bash
# Check what's using the ports
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :8080  # PgAdmin
lsof -i :8081  # Redis Commander
```

### Container Issues

```bash
# View container status
docker-compose ps

# Restart problematic service
docker-compose restart <service_name>

# View detailed logs
docker-compose logs <service_name>
```

### Data Persistence Issues

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect roo-code-postgres-dev-data

# Remove volumes (WARNING: deletes all data)
docker-compose down -v
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Check available disk space
docker system df

# Clean up unused resources
docker system prune
```

## 📈 Performance Optimization

### PostgreSQL

- Shared buffers: 256MB
- Work memory: 4MB
- Effective cache size: 4GB
- Connection limit: 100

### Redis

- Max memory: 256MB
- Memory policy: allkeys-lru
- Persistence: RDB + AOF
- Connection limit: 10,000

## 🔄 Backup and Recovery

### Database Backup

```bash
# Create backup
docker-compose exec postgres pg_dump -U roo_dev roo_code_dev > backup.sql

# Restore backup
docker-compose exec -T postgres psql -U roo_dev -d roo_code_dev < backup.sql
```

### Redis Backup

```bash
# Create backup
docker-compose exec redis redis-cli BGSAVE

# Copy backup file
docker cp $(docker-compose ps -q redis):/data/dump.rdb ./redis-backup.rdb
```

## 🚀 Next Steps

1. **Start the development environment**: `./docker/development/scripts/start-dev.sh`
2. **Connect your application** to the databases
3. **Add database migrations** to `shared/database/migrations/`
4. **Configure your application** to use the connection details above

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [PgAdmin Documentation](https://www.pgadmin.org/docs/)

---

**Happy Development! 🎯**
