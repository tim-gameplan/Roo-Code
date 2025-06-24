# TASK-007.0: Docker Infrastructure Setup

**Parent Task**: TASK-007 (Database Integration & Synchronization)  
**Priority**: Critical  
**Status**: Planning  
**Estimated Duration**: 3 days  
**Dependencies**: None

---

## 🎯 **Objective**

Create comprehensive Docker infrastructure for PostgreSQL and Redis deployment supporting both development and production environments with clean project organization that maintains the project's neat and clean structure.

## 📋 **Overview**

This subtask establishes the containerized infrastructure foundation by implementing:

- **Clean Project Organization**: Dedicated `/docker/` directory structure
- **Development Environment**: One-command setup with hot reloading
- **Production Environment**: Security-hardened containers with monitoring
- **Database Containers**: Optimized PostgreSQL and Redis configurations
- **Deployment Automation**: Scripts for easy setup and management

## 🏗️ **Project Structure Strategy**

### **Clean Organization Approach**

```
/Roo-Code/
├── docker/                          # NEW: All Docker infrastructure
│   ├── development/                 # Development environment
│   │   ├── docker-compose.yml       # Main dev compose file
│   │   ├── postgres/                # PostgreSQL dev config
│   │   │   ├── Dockerfile
│   │   │   ├── init/                # Schema initialization
│   │   │   └── config/              # PostgreSQL configuration
│   │   ├── redis/                   # Redis dev config
│   │   │   ├── Dockerfile
│   │   │   └── config/              # Redis configuration
│   │   └── scripts/                 # Development scripts
│   │       ├── start-dev.sh
│   │       ├── stop-dev.sh
│   │       └── reset-db.sh
│   ├── production/                  # Production environment
│   │   ├── docker-compose.yml       # Production compose file
│   │   ├── postgres/                # Production PostgreSQL
│   │   ├── redis/                   # Production Redis
│   │   └── scripts/                 # Production scripts
│   ├── shared/                      # Shared configurations
│   │   ├── database/                # Database schemas & migrations
│   │   │   ├── migrations/
│   │   │   ├── seeds/
│   │   │   └── schemas/
│   │   └── monitoring/              # Health checks & monitoring
│   └── README.md                    # Docker setup guide
├── production-ccs/                  # Existing - no changes
└── docs/deployment/                 # NEW: Deployment documentation
    ├── docker-setup.md
    ├── local-development.md
    └── production-deployment.md
```

### **Benefits of This Structure**

1. **Separation of Concerns**: Docker infrastructure isolated from application code
2. **Environment Clarity**: Clear dev/prod separation
3. **Reusability**: Shared components between environments
4. **Maintainability**: Easy to find and modify Docker configurations
5. **Documentation**: Centralized deployment documentation

---

## 🔧 **TASK-007.0.1: Project Structure & Development Environment**

### **Objective**

Create clean Docker project structure and development environment setup.

### **Duration**: 1 day

### **Priority**: Critical

### **Deliverables**

#### **1. Directory Structure Creation**

```bash
# Create the complete Docker infrastructure
mkdir -p docker/{development,production,shared}
mkdir -p docker/development/{postgres,redis,scripts}
mkdir -p docker/production/{postgres,redis,scripts}
mkdir -p docker/shared/{database,monitoring}
mkdir -p docker/shared/database/{migrations,seeds,schemas}
mkdir -p docs/deployment
```

#### **2. Development Docker Compose**

```yaml
# docker/development/docker-compose.yml
version: "3.8"
services:
    postgres:
        build: ./postgres
        environment:
            POSTGRES_DB: roo_cloud_dev
            POSTGRES_USER: roo_dev
            POSTGRES_PASSWORD: dev_password
        ports:
            - "5432:5432"
        volumes:
            - postgres_dev_data:/var/lib/postgresql/data
            - ../shared/database/init:/docker-entrypoint-initdb.d
            - ../shared/database/migrations:/migrations
        healthcheck:
            test: ["CMD-SHELL", "pg_isready -U roo_dev -d roo_cloud_dev"]
            interval: 10s
            timeout: 5s
            retries: 5

    redis:
        build: ./redis
        ports:
            - "6379:6379"
        volumes:
            - redis_dev_data:/data
        command: redis-server --appendonly yes --notify-keyspace-events Ex
        healthcheck:
            test: ["CMD", "redis-cli", "ping"]
            interval: 10s
            timeout: 3s
            retries: 3

    roo-cloud-service:
        build:
            context: ../../production-ccs
            dockerfile: Dockerfile.dev
        ports:
            - "3001:3001"
            - "9229:9229" # Debug port
        environment:
            - NODE_ENV=development
            - DATABASE_URL=postgresql://roo_dev:dev_password@postgres:5432/roo_cloud_dev
            - REDIS_URL=redis://redis:6379
            - DEBUG=roo:*
        depends_on:
            postgres:
                condition: service_healthy
            redis:
                condition: service_healthy
        volumes:
            - ../../production-ccs:/app
            - /app/node_modules
        command: npm run dev

volumes:
    postgres_dev_data:
    redis_dev_data:
```

#### **3. Development Scripts**

```bash
#!/bin/bash
# docker/development/scripts/start-dev.sh

echo "🚀 Starting Roo Cloud Development Environment"

# Navigate to development directory
cd "$(dirname "$0")/.."

# Start all services
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
docker-compose exec postgres pg_isready -U roo_dev -d roo_cloud_dev
docker-compose exec redis redis-cli ping

echo "✅ Development environment is ready!"
echo "📊 PostgreSQL: localhost:5432"
echo "🔴 Redis: localhost:6379"
echo "🌐 Roo Cloud Service: localhost:3001"
```

### **Acceptance Criteria**

- [ ] Clean Docker project structure created
- [ ] Development environment with hot reloading
- [ ] PostgreSQL accessible on localhost:5432
- [ ] Redis accessible on localhost:6379
- [ ] Health checks for all services
- [ ] One-command development setup

---

## 🔧 **TASK-007.0.2: Database Container Configuration**

### **Objective**

Configure optimized PostgreSQL and Redis containers with initialization, performance tuning, and monitoring.

### **Duration**: 1 day

### **Priority**: High

### **Deliverables**

#### **1. PostgreSQL Container**

```dockerfile
# docker/development/postgres/Dockerfile
FROM postgres:15-alpine

# Install additional extensions
RUN apk add --no-cache postgresql-contrib

# Copy custom configuration
COPY config/postgresql.conf /etc/postgresql/postgresql.conf
COPY config/pg_hba.conf /etc/postgresql/pg_hba.conf

# Copy initialization scripts
COPY init/ /docker-entrypoint-initdb.d/

# Set custom configuration
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
```

#### **2. PostgreSQL Configuration**

```conf
# docker/development/postgres/config/postgresql.conf
# Performance tuning for development
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging for development
log_statement = 'all'
log_duration = on
log_min_duration_statement = 100ms

# Connection settings
max_connections = 100
```

#### **3. Redis Container**

```dockerfile
# docker/development/redis/Dockerfile
FROM redis:7-alpine

# Copy custom configuration
COPY config/redis.conf /usr/local/etc/redis/redis.conf

# Create data directory
RUN mkdir -p /data

# Set permissions
RUN chown redis:redis /data

CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
```

#### **4. Redis Configuration**

```conf
# docker/development/redis/config/redis.conf
# Persistence
appendonly yes
appendfsync everysec
save 900 1
save 300 10
save 60 10000

# Memory management
maxmemory 512mb
maxmemory-policy allkeys-lru

# Pub/Sub for real-time features
notify-keyspace-events Ex

# Security (development)
requirepass dev_redis_password

# Logging
loglevel notice
```

### **Acceptance Criteria**

- [ ] Optimized PostgreSQL configuration for development
- [ ] Redis configured with persistence and pub/sub
- [ ] Database initialization scripts working
- [ ] Performance monitoring enabled
- [ ] Health checks implemented

---

## 🔧 **TASK-007.0.3: Production Environment & Deployment**

### **Objective**

Create production-ready Docker configuration with security hardening, monitoring, and deployment scripts.

### **Duration**: 1 day

### **Priority**: Medium

### **Deliverables**

#### **1. Production Docker Compose**

```yaml
# docker/production/docker-compose.yml
version: "3.8"
services:
    postgres:
        build: ./postgres
        environment:
            POSTGRES_DB: ${POSTGRES_DB}
            POSTGRES_USER: ${POSTGRES_USER}
            POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
        volumes:
            - postgres_prod_data:/var/lib/postgresql/data
            - ../shared/database/backups:/backups
            - ../shared/database/migrations:/migrations
        restart: unless-stopped
        healthcheck:
            test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
            interval: 30s
            timeout: 10s
            retries: 3
        networks:
            - roo_network

    redis:
        build: ./redis
        environment:
            REDIS_PASSWORD: ${REDIS_PASSWORD}
        volumes:
            - redis_prod_data:/data
        restart: unless-stopped
        healthcheck:
            test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
            interval: 30s
            timeout: 5s
            retries: 3
        networks:
            - roo_network

    roo-cloud-service:
        build:
            context: ../../production-ccs
            dockerfile: Dockerfile.prod
        environment:
            - NODE_ENV=production
            - DATABASE_URL=${DATABASE_URL}
            - REDIS_URL=${REDIS_URL}
        depends_on:
            postgres:
                condition: service_healthy
            redis:
                condition: service_healthy
        restart: unless-stopped
        networks:
            - roo_network
        ports:
            - "3001:3001"

volumes:
    postgres_prod_data:
    redis_prod_data:

networks:
    roo_network:
        driver: bridge
```

#### **2. Deployment Scripts**

```bash
#!/bin/bash
# docker/production/scripts/deploy.sh

set -e

echo "🚀 Starting Roo Cloud Service Production Deployment"

# Load environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | xargs)
else
    echo "❌ .env.production file not found"
    exit 1
fi

# Build and start services
echo "📦 Building containers..."
docker-compose -f docker-compose.yml build

echo "🔄 Starting services..."
docker-compose -f docker-compose.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
docker-compose -f docker-compose.yml exec postgres pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}
docker-compose -f docker-compose.yml exec redis redis-cli -a ${REDIS_PASSWORD} ping

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose -f docker-compose.yml exec roo-cloud-service npm run migrate

echo "✅ Deployment completed successfully!"
```

### **Acceptance Criteria**

- [ ] Production-optimized container configurations
- [ ] Environment variable configuration
- [ ] Security hardening applied
- [ ] Automated deployment scripts
- [ ] Backup and recovery procedures
- [ ] Monitoring and logging setup

---

## 📋 **Implementation Timeline**

### **Day 1: Project Structure & Development Environment**

- **Morning**: Create directory structure and development Docker Compose
- **Afternoon**: Set up PostgreSQL and Redis development containers
- **Evening**: Create development scripts and test one-command setup

### **Day 2: Database Container Configuration**

- **Morning**: Configure PostgreSQL with performance tuning and extensions
- **Afternoon**: Configure Redis with persistence and pub/sub
- **Evening**: Add health checks and monitoring

### **Day 3: Production Environment & Deployment**

- **Morning**: Create production Docker Compose with security hardening
- **Afternoon**: Create deployment and management scripts
- **Evening**: Add backup procedures and documentation

---

## 🎯 **Success Metrics**

### **Development Environment**

- [ ] `docker-compose up` starts complete development stack in <60 seconds
- [ ] PostgreSQL accessible and ready for connections
- [ ] Redis accessible with pub/sub functionality
- [ ] Hot reloading works for application development
- [ ] Health checks pass for all services

### **Production Environment**

- [ ] Production deployment completes successfully
- [ ] All services restart automatically on failure
- [ ] Environment variables properly configured
- [ ] Security hardening measures applied
- [ ] Monitoring and logging functional

### **Project Organization**

- [ ] Clean separation of Docker infrastructure
- [ ] No Docker files in application directories
- [ ] Clear documentation and setup instructions
- [ ] Easy to understand and maintain structure

---

## 📚 **Documentation Deliverables**

### **Docker Setup Guide** (`docker/README.md`)

- Overview of Docker infrastructure
- Quick start instructions
- Development vs production differences
- Troubleshooting common issues

### **Local Development Guide** (`docs/deployment/local-development.md`)

- Step-by-step setup instructions
- Development workflow
- Database management
- Debugging and logging

### **Production Deployment Guide** (`docs/deployment/production-deployment.md`)

- Production deployment procedures
- Environment configuration
- Security considerations
- Backup and recovery

---

## 🔗 **Integration Points**

### **With Existing Systems**

- **production-ccs**: Dockerfiles for development and production
- **Database Migrations**: Integration with existing migration system
- **Environment Configuration**: Consistent with existing .env patterns

### **With Future Tasks**

- **TASK-007.1**: Database schema initialization
- **TASK-007.2**: Synchronization engine database connections
- **TASK-007.3**: Cloud coordination service deployment

---

**Task Created**: June 22, 2025  
**Last Updated**: June 22, 2025  
**Status**: Planning  
**Next Review**: Daily during implementation
