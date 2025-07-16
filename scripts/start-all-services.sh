#!/bin/bash

# Roo-Code Complete System Startup Script
# Starts all remote UI services in the correct order

set -e  # Exit on any error

echo "🚀 Starting Roo-Code Complete Remote UI System"
echo "==============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "production-ccs" ] || [ ! -d "web-ui" ] || [ ! -d "poc-remote-ui" ]; then
    print_error "Please run this script from the Roo-Code project root directory"
    exit 1
fi

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1
    
    print_status "Waiting for $name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            print_success "$name is ready ✓"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$name failed to start after $max_attempts attempts"
    return 1
}

# Function to start service in background
start_service() {
    local dir=$1
    local command=$2
    local service_name=$3
    local port=$4
    
    print_status "Starting $service_name..."
    
    cd "$dir"
    eval "$command" &
    local pid=$!
    cd - >/dev/null
    
    # Store PID for cleanup
    echo $pid >> /tmp/roo-code-pids.txt
    
    print_success "$service_name started (PID: $pid)"
    return $pid
}

# Create PID file for tracking services
echo "# Roo-Code Service PIDs - $(date)" > /tmp/roo-code-pids.txt

print_status "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js >= 18.0.0"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2)
print_success "Node.js version $NODE_VERSION ✓"

# Check for port conflicts and stop conflicting services if needed
print_status "Checking port availability..."

if check_port 8081; then
    print_warning "Port 8081 is in use. Attempting to free it..."
    pkill -f "8081" || true
    sleep 2
fi

if check_port 3001; then
    print_warning "Port 3001 is in use. Attempting to free it..."
    pkill -f "3001" || true
    sleep 2
fi

if check_port 5173; then
    print_warning "Port 5173 is in use. Attempting to free it..."
    pkill -f "5173" || true
    sleep 2
fi

print_success "Port availability checked ✓"

# Phase 1: Start POC Remote UI (Primary Interface)
print_status "Phase 1: Starting POC Remote UI..."
start_service "poc-remote-ui/ccs" "npm start" "POC Remote UI" 8081

# Wait for POC Remote UI to be ready
if ! wait_for_service "http://localhost:8081/health" "POC Remote UI"; then
    print_error "Failed to start POC Remote UI"
    exit 1
fi

# Phase 2: Start Production CCS Server
print_status "Phase 2: Starting Production CCS Server..."

# Ensure dependencies are installed
if [ ! -d "production-ccs/node_modules" ]; then
    print_status "Installing Production CCS dependencies..."
    cd production-ccs
    npm install
    cd ..
fi

start_service "production-ccs" "npm run dev" "Production CCS Server" 3001

# Wait for Production CCS to be ready
if ! wait_for_service "http://localhost:3001/health" "Production CCS Server"; then
    print_error "Failed to start Production CCS Server"
    exit 1
fi

# Phase 3: Start Web UI (if possible)
print_status "Phase 3: Starting Web UI React Application..."

# Ensure dependencies are installed
if [ ! -d "web-ui/node_modules" ]; then
    print_status "Installing Web UI dependencies..."
    cd web-ui
    npm install
    cd ..
fi

# Try to start Web UI
cd web-ui
timeout 30s npm run dev &
WEB_UI_PID=$!
cd ..
echo $WEB_UI_PID >> /tmp/roo-code-pids.txt

# Check if Web UI started successfully (optional, since POC is primary)
sleep 5
if check_port 5173; then
    print_success "Web UI React Application started (PID: $WEB_UI_PID) ✓"
    WEB_UI_STATUS="✅ Running"
else
    print_warning "Web UI failed to start, but POC Remote UI is working"
    WEB_UI_STATUS="⚠️ Not Running (POC UI available)"
fi

# Final system status
echo ""
echo "🎉 Roo-Code Remote UI System Status"
echo "=================================="
echo ""
echo "📱 Primary Remote Interface:"
echo "   POC Remote UI:    http://localhost:8081    ✅ Running"
echo "   Status:           http://localhost:8081/status"
echo "   Health:           http://localhost:8081/health"
echo ""
echo "🔧 Backend Services:"
echo "   Production CCS:   http://localhost:3001    ✅ Running"
echo "   API Health:       http://localhost:3001/health"
echo ""
echo "🌐 Advanced Interface:"
echo "   Web UI React:     http://localhost:5173    $WEB_UI_STATUS"
echo ""
echo "📊 Service Management:"
echo "   PIDs stored in:   /tmp/roo-code-pids.txt"
echo "   Stop all:         ./scripts/stop-all-services.sh"
echo ""

# Test end-to-end functionality
print_status "Testing end-to-end functionality..."

# Test POC Remote UI
if curl -s http://localhost:8081/status | grep -q '"ipcConnected":true'; then
    print_success "POC Remote UI ↔ VSCode Extension connection ✓"
else
    print_warning "POC Remote UI connection to VSCode Extension needs attention"
fi

# Test Production CCS
if curl -s http://localhost:3001/health | grep -q '"status":"healthy"'; then
    print_success "Production CCS Server health ✓"
else
    print_warning "Production CCS Server health check failed"
fi

echo ""
print_success "🚀 System Ready! You can now access Roo-Code remotely from any device!"
echo ""
echo "📱 To use from your phone:"
echo "   1. Open browser on your mobile device"
echo "   2. Navigate to: http://[YOUR_IP]:8081"
echo "   3. Type messages to interact with Roo-Code"
echo "   4. Messages will appear in your VSCode extension"
echo ""
echo "🔗 Replace [YOUR_IP] with your computer's IP address"
echo "   Find it with: ifconfig | grep inet"
echo ""
print_success "Enjoy coding remotely! 🎉"