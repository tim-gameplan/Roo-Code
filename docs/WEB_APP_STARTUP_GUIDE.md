# Web App Startup Guide - Getting Roo-Code Web Interface Working

**Date:** July 2, 2025  
**Branch:** `feature/production-deployment`  
**Status:** Ready for Local Development Setup

## 🎯 OVERVIEW

This guide provides step-by-step instructions to get the Roo-Code web application running locally. The system consists of:

1. **Production CCS Server** (Backend API) - `production-ccs/`
2. **Web UI React App** (Frontend) - `web-ui/`
3. **Database Infrastructure** (PostgreSQL + Redis) - `docker/`

## 📋 PREREQUISITES

### System Requirements

- **Node.js:** >= 18.0.0
- **npm/pnpm:** >= 8.0.0
- **Docker & Docker Compose:** Latest version
- **Git:** Latest version

### Verify Prerequisites

```bash
node --version    # Should be >= 18.0.0
npm --version     # Should be >= 8.0.0
docker --version  # Should be latest
docker-compose --version
```

## 🚀 STEP-BY-STEP STARTUP PROCESS

### Step 1: Database Infrastructure Setup

#### 1.1 Start Docker Services

```bash
# Navigate to project root
cd /Users/tim/gameplan/vibing/noo-code/Roo-Code

# Start PostgreSQL and Redis services
cd docker/development
docker-compose up -d

# Verify services are running
docker-compose ps
```

#### 1.2 Verify Database Connection

```bash
# Check PostgreSQL
docker exec -it development_postgres_1 psql -U roo_user -d roo_db -c "SELECT version();"

# Check Redis
docker exec -it development_redis_1 redis-cli ping
```

### Step 2: Production CCS Server Setup

#### 2.1 Install Dependencies

```bash
# Navigate to production-ccs directory
cd production-ccs

# Install dependencies
npm install
```

#### 2.2 Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env file with correct values
# Key settings:
# PORT=3001
# NODE_ENV=development
# DATABASE_URL=postgresql://roo_user:roo_password@localhost:5432/roo_db
# REDIS_URL=redis://localhost:6379
```

#### 2.3 Database Migration

```bash
# Run database migrations
npm run migrate

# Or manually run migrations if needed
psql -U roo_user -d roo_db -f ../docker/shared/database/migrations/001_initial_setup.sql
psql -U roo_user -d roo_db -f ../docker/shared/database/migrations/002_core_schema.sql
psql -U roo_user -d roo_db -f ../docker/shared/database/migrations/003_core_user_authentication.sql
psql -U roo_user -d roo_db -f ../docker/shared/database/migrations/004_conversation_message_schema.sql
psql -U roo_user -d roo_db -f ../docker/shared/database/migrations/005_file_sync_workspace_schema.sql
psql -U roo_user -d roo_db -f ../docker/shared/database/migrations/006_orchestration_schema.sql
```

#### 2.4 Build and Start CCS Server

```bash
# Build TypeScript
npm run build

# Start development server
npm run dev

# Server should start on http://localhost:3001
```

#### 2.5 Verify CCS Server

```bash
# Test health endpoint
curl http://localhost:3001/api/health

# Expected response: {"status":"ok","timestamp":"..."}
```

### Step 3: Web UI React App Setup

#### 3.1 Install Dependencies

```bash
# Navigate to web-ui directory
cd ../web-ui

# Install dependencies
npm install
```

#### 3.2 Environment Configuration

```bash
# Create environment file
cat > .env.local << EOF
VITE_API_BASE_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001
VITE_APP_NAME=Roo-Code Web Interface
EOF
```

#### 3.3 Start Web UI Development Server

```bash
# Start Vite development server
npm run dev

# Web UI should start on http://localhost:5173
```

#### 3.4 Alternative: Use Provided Script

```bash
# Use the provided startup script
chmod +x start-web-ui.sh
./start-web-ui.sh
```

### Step 4: Verification and Testing

#### 4.1 Access Web Application

1. **Open Browser:** Navigate to `http://localhost:5173`
2. **Login Screen:** You should see the Roo-Code login interface
3. **Test Authentication:** Try logging in (may need to create test user)

#### 4.2 Test API Connectivity

```bash
# Test from web UI console (F12 Developer Tools)
fetch('http://localhost:3001/api/health')
  .then(response => response.json())
  .then(data => console.log(data));
```

#### 4.3 Test WebSocket Connection

```bash
# Run WebSocket test
node ../test-websocket-connection.js
```

## 🔧 TROUBLESHOOTING

### Common Issues and Solutions

#### Issue 1: Database Connection Failed

```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database services
docker-compose down
docker-compose up -d

# Check logs
docker-compose logs postgres
```

#### Issue 2: CCS Server Won't Start

```bash
# Check TypeScript compilation
cd production-ccs
npm run typecheck

# Check for missing dependencies
npm install

# Check environment variables
cat .env
```

#### Issue 3: Web UI Build Errors

```bash
# Clear node_modules and reinstall
cd web-ui
rm -rf node_modules package-lock.json
npm install

# Check for TypeScript errors
npm run type-check
```

#### Issue 4: CORS Issues

- Ensure CCS server is configured for CORS
- Check that API_BASE_URL in web-ui matches CCS server URL
- Verify both services are running on expected ports

#### Issue 5: WebSocket Connection Failed

```bash
# Test WebSocket endpoint directly
wscat -c ws://localhost:3001

# Check CCS server WebSocket configuration
grep -r "websocket\|ws" production-ccs/src/
```

## 📊 EXPECTED RESULTS

### Successful Startup Indicators

#### 1. Database Services

```bash
$ docker-compose ps
NAME                    STATUS
development_postgres_1  Up
development_redis_1     Up
```

#### 2. CCS Server

```bash
$ npm run dev
[INFO] Server starting on port 3001
[INFO] Database connected successfully
[INFO] Redis connected successfully
[INFO] WebSocket server initialized
[INFO] Server ready at http://localhost:3001
```

#### 3. Web UI

```bash
$ npm run dev
VITE v5.0.0 ready in 1234 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

#### 4. Browser Access

- **URL:** `http://localhost:5173`
- **Expected:** Roo-Code login screen
- **Features:** Login form, responsive design, no console errors

## 🎯 NEXT STEPS AFTER STARTUP

### 1. Create Test User

```bash
# Use CCS API to create test user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"testpass123"}'
```

### 2. Test Core Features

- [ ] User authentication (login/logout)
- [ ] WebSocket connection
- [ ] Chat interface
- [ ] File operations
- [ ] Remote session management

### 3. Development Workflow

- [ ] Set up hot reloading for both frontend and backend
- [ ] Configure debugging in VS Code
- [ ] Set up testing environment
- [ ] Enable development logging

## 🚨 PRODUCTION CONSIDERATIONS

### Security Checklist

- [ ] Change default passwords
- [ ] Configure proper CORS origins
- [ ] Set up SSL/TLS certificates
- [ ] Enable rate limiting
- [ ] Configure proper authentication

### Performance Optimization

- [ ] Enable production builds
- [ ] Configure caching strategies
- [ ] Set up CDN for static assets
- [ ] Optimize database queries
- [ ] Configure connection pooling

## 📞 SUPPORT

### Quick Commands Reference

```bash
# Start everything
docker-compose -f docker/development/docker-compose.yml up -d
cd production-ccs && npm run dev &
cd web-ui && npm run dev &

# Stop everything
pkill -f "npm run dev"
docker-compose -f docker/development/docker-compose.yml down

# Reset everything
docker-compose down -v
docker-compose up -d
cd production-ccs && npm run build && npm run dev &
cd web-ui && npm run dev &
```

### Log Locations

- **CCS Server:** Console output + `production-ccs/logs/`
- **Web UI:** Browser console + Vite terminal
- **Database:** `docker-compose logs postgres`
- **Redis:** `docker-compose logs redis`

---

**Status:** ✅ Ready for Local Development  
**Last Updated:** July 2, 2025  
**Next Review:** After successful startup verification
