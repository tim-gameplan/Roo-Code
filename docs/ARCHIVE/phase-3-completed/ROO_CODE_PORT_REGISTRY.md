# Roo-Code System Port Registry

**Date:** January 3, 2025  
**Status:** ✅ **STANDARDIZED & ACTIVE**  
**Version:** 1.0.0  
**Authority:** Official Roo-Code Development Team

## 🎯 OFFICIAL PORT ALLOCATION

This document serves as the **single source of truth** for all port assignments in the Roo-Code ecosystem. All services, documentation, and scripts must adhere to these port assignments.

### 📋 PRODUCTION SERVICES (3000-3099)

| Service                     | Port | Status      | URL                             | Purpose                |
| --------------------------- | ---- | ----------- | ------------------------------- | ---------------------- |
| **Production CCS Server**   | 3001 | ✅ Active   | `http://localhost:3001`         | Main production server |
| **Production WebSocket**    | 3002 | 🔄 Reserved | `ws://localhost:3002`           | WebSocket connections  |
| **Production Health Check** | 3003 | 🔄 Reserved | `http://localhost:3003/health`  | Health monitoring      |
| **Production Metrics**      | 3004 | 🔄 Reserved | `http://localhost:3004/metrics` | Performance metrics    |

### 🛠️ DEVELOPMENT SERVICES (5000-5199, 8081-8099)

| Service                 | Port | Status      | URL                     | Purpose                    |
| ----------------------- | ---- | ----------- | ----------------------- | -------------------------- |
| **Web UI React (Vite)** | 5173 | ✅ Active   | `http://localhost:5173` | React development server   |
| **POC Remote UI**       | 8081 | ✅ Active   | `http://localhost:8081` | Proof of concept remote UI |
| **Development API**     | 5001 | 🔄 Reserved | `http://localhost:5001` | Development API server     |
| **Hot Reload Server**   | 5002 | 🔄 Reserved | `http://localhost:5002` | Development hot reload     |

### 🧪 TESTING SERVICES (3100-3199)

| Service               | Port | Status      | URL                     | Purpose                 |
| --------------------- | ---- | ----------- | ----------------------- | ----------------------- |
| **Test Server**       | 3100 | 🔄 Reserved | `http://localhost:3100` | Main test server        |
| **Integration Tests** | 3101 | 🔄 Reserved | `http://localhost:3101` | Integration test runner |
| **Load Testing**      | 3102 | 🔄 Reserved | `http://localhost:3102` | Performance testing     |
| **E2E Testing**       | 3103 | 🔄 Reserved | `http://localhost:3103` | End-to-end tests        |

### 🗄️ DATABASE SERVICES (5400-5499)

| Service               | Port | Status      | URL                           | Purpose              |
| --------------------- | ---- | ----------- | ----------------------------- | -------------------- |
| **PostgreSQL (Dev)**  | 5432 | ✅ Active   | `postgresql://localhost:5432` | Development database |
| **PostgreSQL (Test)** | 5433 | 🔄 Reserved | `postgresql://localhost:5433` | Testing database     |
| **PostgreSQL (Prod)** | 5434 | 🔄 Reserved | `postgresql://localhost:5434` | Production database  |

### 🔄 CACHE SERVICES (6300-6399)

| Service          | Port | Status      | URL                      | Purpose           |
| ---------------- | ---- | ----------- | ------------------------ | ----------------- |
| **Redis (Dev)**  | 6379 | ✅ Active   | `redis://localhost:6379` | Development cache |
| **Redis (Test)** | 6380 | 🔄 Reserved | `redis://localhost:6380` | Testing cache     |
| **Redis (Prod)** | 6381 | 🔄 Reserved | `redis://localhost:6381` | Production cache  |

### 🐳 DOCKER SERVICES (8080-8099)

| Service             | Port | Status      | URL                     | Purpose                  |
| ------------------- | ---- | ----------- | ----------------------- | ------------------------ |
| **Redis Commander** | 8080 | ✅ Active   | `http://localhost:8080` | Redis web interface      |
| **pgAdmin**         | 8082 | 🔄 Reserved | `http://localhost:8082` | PostgreSQL web interface |
| **Docker Registry** | 8083 | 🔄 Reserved | `http://localhost:8083` | Local Docker registry    |

## 🚫 FORBIDDEN PORTS

These ports are **NEVER** to be used by Roo-Code services:

- **Port 3000**: Reserved for external services
- **Port 8080**: Used by Docker Redis Commander
- **Port 80/443**: System reserved
- **Port 22**: SSH reserved
- **Port 25**: SMTP reserved

## 📝 PORT ASSIGNMENT RULES

### 1. Production Services (3000-3099)

- **3001-3010**: Core production services
- **3011-3020**: Production APIs
- **3021-3030**: Production WebSockets
- **3031-3099**: Production utilities

### 2. Development Services (5000-5199, 8081-8099)

- **5000-5099**: Development servers
- **5100-5199**: Development tools
- **8081-8099**: Development UIs

### 3. Testing Services (3100-3199)

- **3100-3120**: Test runners
- **3121-3140**: Test utilities
- **3141-3199**: Test environments

### 4. Database Services (5400-5499)

- **5432**: PostgreSQL default
- **5433-5439**: PostgreSQL instances
- **5440-5499**: Other databases

### 5. Cache Services (6300-6399)

- **6379**: Redis default
- **6380-6389**: Redis instances
- **6390-6399**: Other cache services

## 🔧 CONFIGURATION FILES

### Environment Variables

```bash
# Production
PRODUCTION_CCS_PORT=3001
PRODUCTION_WS_PORT=3002
PRODUCTION_HEALTH_PORT=3003

# Development
WEB_UI_PORT=5173
POC_REMOTE_UI_PORT=8081
DEV_API_PORT=5001

# Testing
TEST_SERVER_PORT=3100
INTEGRATION_TEST_PORT=3101

# Database
POSTGRES_DEV_PORT=5432
POSTGRES_TEST_PORT=5433
POSTGRES_PROD_PORT=5434

# Cache
REDIS_DEV_PORT=6379
REDIS_TEST_PORT=6380
REDIS_PROD_PORT=6381
```

### Docker Compose Ports

```yaml
services:
    production-ccs:
        ports:
            - "3001:3001"

    web-ui:
        ports:
            - "5173:5173"

    poc-remote-ui:
        ports:
            - "8081:8081"

    postgres-dev:
        ports:
            - "5432:5432"

    redis-dev:
        ports:
            - "6379:6379"

    redis-commander:
        ports:
            - "8080:8080"
```

## 📚 AFFECTED FILES

### Configuration Files

- `production-ccs/.env`
- `production-ccs/src/config/index.ts`
- `web-ui/vite.config.ts`
- `poc-remote-ui/ccs/server.js`
- `docker/development/docker-compose.yml`
- `docker/production/docker-compose.yml`

### Scripts

- `scripts/start-web-app.sh`
- `scripts/stop-web-app.sh`
- `poc-remote-ui/scripts/start-poc.sh`
- `poc-remote-ui/scripts/test-poc.sh`
- `scripts/test-automation/start-phase-3-3-testing.sh`

### Documentation

- `docs/WEB_APP_STARTUP_GUIDE.md`
- `docs/REMOTE_ACCESS_SETUP_GUIDE.md`
- `docs/ROO_CODE_USER_GUIDE.md`
- All testing documentation files

### Testing Files

- `docs/testing/task-1-3-remote-ui-framework-test-automation.js`
- `docs/testing/phase-3-3-1/end-to-end-integration-test-automation.js`
- All phase testing automation scripts

## 🔍 PORT CONFLICT DETECTION

### Check for Conflicts

```bash
# Check if port is in use
lsof -i :PORT_NUMBER

# Check all Roo-Code ports
for port in 3001 5173 8081 5432 6379 8080; do
  echo "Port $port:"
  lsof -i :$port
done
```

### Kill Conflicting Processes

```bash
# Kill specific port
sudo kill -9 $(lsof -t -i:PORT_NUMBER)

# Kill all node processes (use with caution)
pkill -f "node"
```

## ✅ VALIDATION CHECKLIST

### Before Starting Services

- [ ] Check port availability with `lsof -i :PORT`
- [ ] Verify no conflicts with external services
- [ ] Confirm environment variables are set
- [ ] Validate Docker port mappings

### After Port Changes

- [ ] Update all configuration files
- [ ] Update all documentation references
- [ ] Update all testing scripts
- [ ] Run comprehensive system tests
- [ ] Verify all services accessible

## 🚀 QUICK START COMMANDS

### Start All Services

```bash
# Production
cd production-ccs && npm start  # Port 3001

# Web UI
cd web-ui && npm run dev        # Port 5173

# POC Remote UI
cd poc-remote-ui/ccs && node server.js  # Port 8081

# Docker Services
docker-compose -f docker/development/docker-compose.yml up -d
```

### Verify All Services

```bash
# Check service health
curl http://localhost:3001/health  # Production CCS
curl http://localhost:5173         # Web UI
curl http://localhost:8081/health  # POC Remote UI
curl http://localhost:8080         # Redis Commander
```

## 📞 SUPPORT

### Port Registry Maintenance

- **Owner**: Roo-Code Development Team
- **Last Updated**: January 3, 2025
- **Next Review**: February 1, 2025

### Reporting Issues

- Port conflicts: Create GitHub issue with `port-conflict` label
- New port requests: Create GitHub issue with `port-request` label
- Documentation updates: Create PR with updated registry

---

**⚠️ IMPORTANT**: This registry is the authoritative source for all port assignments. Any deviations must be approved and documented here first.

**🔒 COMMITMENT**: All team members agree to use only these assigned ports and update this registry before making any changes.
