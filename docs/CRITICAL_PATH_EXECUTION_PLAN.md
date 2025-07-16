# CRITICAL PATH EXECUTION PLAN

**Date:** January 4, 2025  
**Status:** 🚨 **IMMEDIATE EXECUTION REQUIRED**  
**Priority:** CRITICAL - System Restoration  
**Estimated Duration:** 12 hours (Phase 1)

## 🎯 EXECUTION OVERVIEW

This plan provides step-by-step instructions to restore Roo-Code system functionality. Each step includes validation criteria and rollback procedures to ensure safe execution.

## 📋 PRE-EXECUTION CHECKLIST

### **PREREQUISITES**

- [ ] **System Access:** Terminal access to development environment
- [ ] **Docker Running:** Docker daemon active and responsive
- [ ] **Backup Created:** Current system state documented
- [ ] **Team Notification:** Development team aware of maintenance window
- [ ] **Rollback Plan:** Recovery procedures prepared

### **TOOLS REQUIRED**

- [ ] **Terminal/Command Line:** For executing commands
- [ ] **Docker CLI:** For container management
- [ ] **Process Monitor:** For service status checking (lsof, ps)
- [ ] **Web Browser:** For service validation
- [ ] **Text Editor:** For configuration updates

## 🚨 PHASE 1: IMMEDIATE SYSTEM RESTORATION

### **STEP 1.1: PORT CONFLICT RESOLUTION** ⏱️ 30 minutes

#### **Objective:** Free port 8081 for POC Remote UI

#### **Actions:**

```bash
# 1. Identify Redis Commander container
docker ps | grep redis-commander

# 2. Stop Redis Commander container
docker stop roo-code-redis-commander-dev

# 3. Verify port 8081 is free
lsof -i :8081

# 4. Remove container if needed
docker rm roo-code-redis-commander-dev
```

#### **Validation:**

- [ ] No process listening on port 8081
- [ ] Redis Commander container stopped
- [ ] No error messages in terminal

#### **Rollback:**

```bash
# If issues occur, restart Redis Commander
docker run -d --name roo-code-redis-commander-dev -p 8081:8081 rediscommander/redis-commander:latest
```

---

### **STEP 1.2: POC REMOTE UI STARTUP** ⏱️ 15 minutes

#### **Objective:** Start POC Remote UI on port 8081

#### **Actions:**

```bash
# 1. Navigate to POC Remote UI directory
cd poc-remote-ui/ccs

# 2. Install dependencies if needed
npm install

# 3. Start POC Remote UI server
node server.js
```

#### **Validation:**

- [ ] Server starts without errors
- [ ] Port 8081 shows as listening
- [ ] HTTP response from http://localhost:8081
- [ ] No error messages in console

#### **Expected Output:**

```
POC Remote UI Server running on port 8081
WebSocket server initialized
Ready to accept connections
```

#### **Rollback:**

```bash
# Stop the server with Ctrl+C
# Check for any hanging processes
lsof -i :8081
kill -9 <PID if needed>
```

---

### **STEP 1.3: REDIS COMMANDER RELOCATION** ⏱️ 15 minutes

#### **Objective:** Start Redis Commander on port 8082

#### **Actions:**

```bash
# 1. Start Redis Commander on new port
docker run -d --name roo-code-redis-commander-dev -p 8082:8081 rediscommander/redis-commander:latest

# 2. Verify container is running
docker ps | grep redis-commander

# 3. Test Redis Commander access
curl -I http://localhost:8082
```

#### **Validation:**

- [ ] Container starts successfully
- [ ] Port 8082 shows as listening
- [ ] HTTP response from http://localhost:8082
- [ ] Redis Commander UI loads in browser

#### **Rollback:**

```bash
# Stop and remove container if issues
docker stop roo-code-redis-commander-dev
docker rm roo-code-redis-commander-dev
```

---

### **STEP 1.4: SERVICE HEALTH VALIDATION** ⏱️ 45 minutes

#### **Objective:** Verify all core services are operational

#### **Actions:**

**1. Production CCS Server Check:**

```bash
# Check if server is running
lsof -i :3001

# Test health endpoint
curl http://localhost:3001/health

# Check server logs
cd production-ccs
npm run logs
```

**2. Web UI Check:**

```bash
# Check if Vite server is running
lsof -i :5173

# Test Web UI access
curl -I http://localhost:5173

# Check for build errors
cd web-ui
npm run build
```

**3. Database Connectivity:**

```bash
# Start database if not running
cd docker/development
docker-compose up -d postgres redis

# Test database connection
docker exec -it roo-code-postgres-dev psql -U postgres -d roo_code -c "SELECT 1;"
```

#### **Validation:**

- [ ] Production CCS Server responds on port 3001
- [ ] Web UI loads on port 5173
- [ ] POC Remote UI accessible on port 8081
- [ ] Redis Commander available on port 8082
- [ ] Database accepts connections
- [ ] No error messages in any service logs

---

### **STEP 1.5: BASIC INTEGRATION TESTING** ⏱️ 60 minutes

#### **Objective:** Verify end-to-end system functionality

#### **Actions:**

**1. WebSocket Communication Test:**

```bash
# Create test script
cat > test-websocket.js << 'EOF'
const WebSocket = require('ws');

// Test CCS Server WebSocket
const ws = new WebSocket('ws://localhost:3001');
ws.on('open', () => {
    console.log('✅ WebSocket connection established');
    ws.send(JSON.stringify({ type: 'ping' }));
});
ws.on('message', (data) => {
    console.log('✅ WebSocket message received:', data.toString());
    ws.close();
});
ws.on('error', (error) => {
    console.log('❌ WebSocket error:', error);
});
EOF

# Run WebSocket test
node test-websocket.js
```

**2. API Endpoint Testing:**

```bash
# Test health endpoints
curl -s http://localhost:3001/health | jq '.'
curl -s http://localhost:3001/api/status | jq '.'

# Test authentication endpoint
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

**3. Cross-Service Communication:**

```bash
# Test POC Remote UI to CCS Server
curl -X POST http://localhost:8081/api/connect \
  -H "Content-Type: application/json" \
  -d '{"server":"http://localhost:3001"}'
```

#### **Validation:**

- [ ] WebSocket connections establish successfully
- [ ] API endpoints respond with valid JSON
- [ ] Authentication system functional
- [ ] Cross-service communication works
- [ ] No timeout or connection errors

---

### **STEP 1.6: DOCUMENTATION UPDATE** ⏱️ 30 minutes

#### **Objective:** Update port registry and documentation

#### **Actions:**

**1. Update Port Registry:**

```bash
# Edit port registry file
cat > docs/ROO_CODE_PORT_REGISTRY_CORRECTED.md << 'EOF'
# ROO-CODE PORT REGISTRY (CORRECTED)

## ACTIVE SERVICES
| Port | Service | Status | URL |
|------|---------|--------|-----|
| 3001 | Production CCS Server | ✅ Active | http://localhost:3001 |
| 5173 | Web UI React (Vite) | ✅ Active | http://localhost:5173 |
| 8081 | POC Remote UI | ✅ Active | http://localhost:8081 |
| 8082 | Redis Commander | ✅ Active | http://localhost:8082 |

## DATABASE SERVICES
| Port | Service | Status | Connection |
|------|---------|--------|------------|
| 5432 | PostgreSQL | ✅ Active | Docker container |
| 6379 | Redis | ✅ Active | Docker container |

Last Updated: January 4, 2025
EOF
```

**2. Update Operational Status:**

```bash
# Update status dashboard
# (This will be done programmatically in the next step)
```

#### **Validation:**

- [ ] Port registry reflects actual system state
- [ ] All service URLs are correct
- [ ] Documentation timestamp updated
- [ ] No conflicting information

---

## 🔍 VALIDATION PROCEDURES

### **COMPREHENSIVE SYSTEM CHECK**

**Execute this validation script after completing all steps:**

```bash
#!/bin/bash
# System Validation Script

echo "🔍 SYSTEM VALIDATION STARTING..."

# Check all required ports
echo "📊 PORT STATUS:"
for port in 3001 5173 8081 8082; do
    if lsof -i :$port > /dev/null 2>&1; then
        echo "✅ Port $port: ACTIVE"
    else
        echo "❌ Port $port: INACTIVE"
    fi
done

# Test HTTP endpoints
echo "🌐 HTTP ENDPOINT STATUS:"
for url in "http://localhost:3001/health" "http://localhost:5173" "http://localhost:8081" "http://localhost:8082"; do
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|302"; then
        echo "✅ $url: RESPONDING"
    else
        echo "❌ $url: NOT RESPONDING"
    fi
done

# Check Docker containers
echo "🐳 DOCKER CONTAINER STATUS:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "🔍 SYSTEM VALIDATION COMPLETE"
```

### **SUCCESS CRITERIA**

**System is considered operational when:**

- [ ] All 4 core services respond to HTTP requests
- [ ] No port conflicts detected
- [ ] WebSocket connections establish successfully
- [ ] Database connections work
- [ ] No critical errors in any service logs

## 🚨 EMERGENCY PROCEDURES

### **IMMEDIATE ROLLBACK**

**If critical issues occur during execution:**

```bash
#!/bin/bash
# Emergency Rollback Script

echo "🚨 EMERGENCY ROLLBACK INITIATED"

# Stop all services
pkill -f "node server.js"
docker stop roo-code-redis-commander-dev
docker stop roo-code-postgres-dev
docker stop roo-code-redis-dev

# Restore original Redis Commander
docker run -d --name roo-code-redis-commander-dev -p 8081:8081 rediscommander/redis-commander:latest

echo "🔄 ROLLBACK COMPLETE - SYSTEM RESTORED TO PREVIOUS STATE"
```

### **ESCALATION CONTACTS**

**Critical Issues:**

- **System Administrator:** Immediate Slack notification
- **DevOps Team:** GitHub issue with "critical" label
- **Development Team:** Emergency team meeting

## 📊 PROGRESS TRACKING

### **EXECUTION LOG**

| Step                           | Status     | Start Time | End Time | Notes |
| ------------------------------ | ---------- | ---------- | -------- | ----- |
| 1.1 Port Conflict Resolution   | ⏳ Pending |            |          |       |
| 1.2 POC Remote UI Startup      | ⏳ Pending |            |          |       |
| 1.3 Redis Commander Relocation | ⏳ Pending |            |          |       |
| 1.4 Service Health Validation  | ⏳ Pending |            |          |       |
| 1.5 Basic Integration Testing  | ⏳ Pending |            |          |       |
| 1.6 Documentation Update       | ⏳ Pending |            |          |       |

### **STATUS INDICATORS**

- ⏳ **Pending:** Not started
- 🔄 **In Progress:** Currently executing
- ✅ **Complete:** Successfully finished
- ❌ **Failed:** Requires attention
- 🔄 **Rolled Back:** Reverted due to issues

## 🎯 NEXT STEPS

**After successful completion of Phase 1:**

1. **Update Operational Status Dashboard**
2. **Execute Phase 2: Monitoring Implementation**
3. **Begin comprehensive integration testing**
4. **Implement automated health checks**
5. **Create service orchestration scripts**

---

**🚨 CRITICAL:** This plan must be executed immediately to restore system functionality. Any deviations or issues should be documented and escalated immediately.

**📞 SUPPORT:** For assistance during execution, refer to the emergency procedures section above.
