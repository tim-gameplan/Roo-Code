# 🚀 Roo-Code User Guide: How to Use the CCS System

**Date:** July 2, 2025  
**Status:** Production Ready  
**Server:** http://localhost:3001

## 📋 QUICK START

### ✅ System Status Check

First, verify the system is running:

```bash
curl http://localhost:3001/health
```

### 🌐 Available URLs and Endpoints

The Roo-Code Central Communication Server (CCS) is currently running on **http://localhost:3001** and provides the following endpoints:

## 🔗 PRIMARY ENDPOINTS

### 1. **API Documentation**

```
GET http://localhost:3001/api
```

**Purpose:** View all available endpoints and system information  
**Example:**

```bash
curl http://localhost:3001/api | jq .
```

### 2. **Health Monitoring**

```
GET http://localhost:3001/health          # Basic health check
GET http://localhost:3001/health/detailed # Detailed system status
GET http://localhost:3001/health/metrics  # Performance metrics
```

### 3. **Remote Session Management**

```
GET http://localhost:3001/remote/:sessionId        # Get session info
GET http://localhost:3001/remote/:sessionId/status # Session status
POST http://localhost:3001/remote/:sessionId/connect    # Connect to session
POST http://localhost:3001/remote/:sessionId/disconnect # Disconnect
```

**Example Usage:**

```bash
# Test remote endpoint
curl http://localhost:3001/remote/test-session

# Check session status
curl http://localhost:3001/remote/my-session/status
```

### 4. **Authentication API**

```
POST http://localhost:3001/api/v1/auth/register      # Register new user
POST http://localhost:3001/api/v1/auth/login         # User login
POST http://localhost:3001/api/v1/auth/refresh       # Refresh token
POST http://localhost:3001/api/v1/auth/logout        # User logout
GET  http://localhost:3001/api/v1/auth/profile       # Get user profile
PUT  http://localhost:3001/api/v1/auth/profile       # Update profile
POST http://localhost:3001/api/v1/auth/change-password # Change password
```

### 5. **User Management**

```
GET    http://localhost:3001/api/v1/users           # List users
POST   http://localhost:3001/api/v1/users           # Create user
GET    http://localhost:3001/api/v1/users/:id       # Get user
PUT    http://localhost:3001/api/v1/users/:id       # Update user
DELETE http://localhost:3001/api/v1/users/:id       # Delete user
```

### 6. **Conversation Management**

```
GET  http://localhost:3001/api/v1/conversations     # List conversations
POST http://localhost:3001/api/v1/conversations     # Create conversation
GET  http://localhost:3001/api/v1/conversations/:id # Get conversation
PUT  http://localhost:3001/api/v1/conversations/:id # Update conversation
```

### 7. **Message Management**

```
GET  http://localhost:3001/api/v1/conversations/:id/messages # List messages
POST http://localhost:3001/api/v1/conversations/:id/messages # Send message
GET  http://localhost:3001/api/v1/messages/:id               # Get message
PUT  http://localhost:3001/api/v1/messages/:id               # Update message
```

## 🛠️ HOW TO USE THE SYSTEM

### Method 1: Direct API Calls (Current)

Since there's no web interface yet, you interact with the system via HTTP requests:

#### **Basic Health Check:**

```bash
curl -X GET http://localhost:3001/health
```

#### **Get System Information:**

```bash
curl -X GET http://localhost:3001/api | jq .
```

#### **Test Remote Session:**

```bash
curl -X GET http://localhost:3001/remote/my-test-session
```

#### **Register a New User:**

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "securepassword123"
  }'
```

#### **Login:**

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "securepassword123"
  }'
```

### Method 2: WebSocket Connection (Real-time)

For real-time communication:

```bash
# WebSocket endpoint (requires upgrade)
ws://localhost:3001/ws
```

### Method 3: VSCode Extension Integration

The system is designed to work with the Roo-Code VSCode extension:

1. **Install the Extension:** Load the Roo-Code extension in VSCode
2. **Configure Connection:** Point to `http://localhost:3001`
3. **Start Remote Session:** Use extension commands to connect

## 📱 PRACTICAL USAGE SCENARIOS

### Scenario 1: Cross-Device Development

```bash
# Start a remote session from your laptop
curl -X POST http://localhost:3001/remote/laptop-session/connect \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "laptop-001", "capabilities": ["code-editing", "terminal"]}'

# Connect from your tablet
curl -X POST http://localhost:3001/remote/laptop-session/connect \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "tablet-001", "capabilities": ["ui-display", "touch-input"]}'
```

### Scenario 2: Team Collaboration

```bash
# Create a conversation for your team
curl -X POST http://localhost:3001/api/v1/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Project Alpha Discussion",
    "participants": ["user1", "user2", "user3"]
  }'
```

### Scenario 3: System Monitoring

```bash
# Check detailed system health
curl http://localhost:3001/health/detailed | jq .

# Get performance metrics
curl http://localhost:3001/health/metrics | jq .
```

## 🔧 TESTING THE SYSTEM

### Quick Test Script

```bash
#!/bin/bash
echo "Testing Roo-Code CCS System..."

# Test basic connectivity
echo "1. Testing basic health..."
curl -s http://localhost:3001/health

echo -e "\n2. Testing API documentation..."
curl -s http://localhost:3001/api | jq .name

echo -e "\n3. Testing remote endpoint..."
curl -s http://localhost:3001/remote/test-session | jq .message

echo -e "\n✅ All tests completed!"
```

## 🌐 WEB INTERFACE STATUS

**Current Status:** No web interface available yet  
**Access Method:** API endpoints only  
**Future Plans:** Web dashboard in development

### What's Missing:

- Web-based dashboard
- Visual session management
- Browser-based remote UI
- Graphical user interface

### What's Available:

- ✅ Full REST API
- ✅ WebSocket support
- ✅ Authentication system
- ✅ Remote session management
- ✅ Cross-device communication
- ✅ Real-time messaging

## 🚀 NEXT STEPS

### For Developers:

1. Use the API endpoints directly with curl/Postman
2. Integrate with the VSCode extension
3. Build custom clients using the REST API

### For End Users:

1. Wait for web interface development
2. Use VSCode extension for code editing
3. Access via mobile apps (when available)

### For System Administrators:

1. Monitor via `/health` endpoints
2. Check logs in production-ccs directory
3. Use Docker containers for deployment

## 📞 SUPPORT

- **Documentation:** `/docs` directory
- **API Reference:** `GET http://localhost:3001/api`
- **Health Status:** `GET http://localhost:3001/health`
- **GitHub Issues:** [Roo-Code Repository](https://github.com/tim-gameplan/Roo-Code)

## 🎯 SUMMARY

**The Roo-Code CCS is currently a backend API server that:**

- ✅ Runs on http://localhost:3001
- ✅ Provides REST API endpoints
- ✅ Supports WebSocket connections
- ✅ Handles authentication and user management
- ✅ Manages remote sessions and cross-device communication
- ❌ Does not have a web interface yet

**To use it:** Make HTTP requests to the API endpoints or integrate with the VSCode extension.
