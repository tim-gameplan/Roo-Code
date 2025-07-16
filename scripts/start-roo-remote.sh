#!/bin/bash

# Roo-Code Mobile Remote Access - Simplified & Reliable
# Single service approach focusing on POC Remote UI only

set -e  # Exit on any error

echo "📱 Roo-Code Mobile Remote Access"
echo "==============================="
echo "🎯 Simple, reliable, single-service approach"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_header() { echo -e "${BOLD}$1${NC}"; }

# Configuration
SERVICE_NAME="POC Remote UI"
SERVICE_PORT=8081
SERVICE_DIR="poc-remote-ui/ccs"
PID_FILE="/tmp/roo-remote-ui.pid"
LOG_FILE="/tmp/roo-remote-ui.log"

# Check if we're in the right directory
if [ ! -d "$SERVICE_DIR" ]; then
    print_error "Please run this script from the Roo-Code project root directory"
    print_error "Expected to find: $SERVICE_DIR"
    exit 1
fi

# Function to wait for port to be free
wait_for_port_free() {
    local port=$1
    local timeout=30
    local count=0
    
    print_status "Ensuring port $port is free..."
    
    while lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; do
        if [ $count -ge $timeout ]; then
            print_error "Port $port is still occupied after ${timeout}s timeout"
            return 1
        fi
        echo -n "."
        sleep 1
        count=$((count + 1))
    done
    
    if [ $count -gt 0 ]; then
        echo ""  # New line after dots
    fi
    print_success "Port $port is free ✓"
}

# Function to wait for service to be ready
wait_for_service_ready() {
    local url=$1
    local timeout=30
    local count=0
    
    print_status "Waiting for service to be ready..."
    
    while ! curl -s "$url" >/dev/null 2>&1; do
        if [ $count -ge $timeout ]; then
            print_error "Service failed to start after ${timeout}s timeout"
            return 1
        fi
        echo -n "."
        sleep 1
        count=$((count + 1))
    done
    
    echo ""  # New line after dots
    print_success "Service is responding ✓"
}

# Function to check if service is already running
check_running_service() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            print_warning "Service is already running (PID: $pid)"
            echo ""
            echo "🔍 Current status:"
            curl -s "http://localhost:$SERVICE_PORT/status" | python3 -m json.tool 2>/dev/null || echo "Status check failed"
            echo ""
            echo "To restart the service:"
            echo "  1. Run: ./scripts/stop-roo-remote.sh"
            echo "  2. Then run this script again"
            echo ""
            return 0
        else
            # PID file exists but process is dead, clean it up
            rm -f "$PID_FILE"
        fi
    fi
    return 1
}

# Function to forcefully clean up port
force_cleanup_port() {
    local port=$1
    print_warning "Force cleaning port $port..."
    
    # Kill any process using the port
    local pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo $pids | xargs kill -TERM 2>/dev/null || true
        sleep 3
        
        # Force kill if still running
        local remaining_pids=$(lsof -ti :$port 2>/dev/null || true)
        if [ -n "$remaining_pids" ]; then
            echo $remaining_pids | xargs kill -9 2>/dev/null || true
            sleep 2
        fi
    fi
}

# Main execution starts here
print_header "🚀 Starting Roo-Code Mobile Remote Access"

# Check if service is already running
if check_running_service; then
    exit 0
fi

# Cleanup any existing processes on our port
if lsof -Pi :$SERVICE_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    force_cleanup_port $SERVICE_PORT
fi

# Wait for port to be completely free
if ! wait_for_port_free $SERVICE_PORT; then
    print_error "Unable to free port $SERVICE_PORT"
    exit 1
fi

# Navigate to service directory
print_status "Preparing $SERVICE_NAME..."
cd "$SERVICE_DIR"

# Check and install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install || {
        print_error "Failed to install dependencies"
        exit 1
    }
    print_success "Dependencies installed ✓"
else
    print_success "Dependencies already installed ✓"
fi

# Start the service
print_status "Starting $SERVICE_NAME on port $SERVICE_PORT..."

# Clear old log
> "$LOG_FILE"

# Start service in background and capture PID
npm start > "$LOG_FILE" 2>&1 &
SERVICE_PID=$!

# Store PID for management
echo $SERVICE_PID > "$PID_FILE"

print_success "$SERVICE_NAME started (PID: $SERVICE_PID)"

# Wait for service to be ready
if ! wait_for_service_ready "http://localhost:$SERVICE_PORT/health"; then
    print_error "Service failed to start properly"
    
    # Show last few lines of log for debugging
    echo ""
    print_error "Last lines from log file:"
    tail -10 "$LOG_FILE" 2>/dev/null || echo "No log available"
    
    # Clean up
    kill $SERVICE_PID 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
fi

# Verify connection to VSCode extension
print_status "Checking connection to VSCode extension..."
sleep 2

IPC_STATUS=$(curl -s "http://localhost:$SERVICE_PORT/status" | grep -o '"ipcConnected":[^,]*' | cut -d':' -f2 2>/dev/null || echo "false")

if [ "$IPC_STATUS" = "true" ]; then
    print_success "Connected to VSCode Extension ✅"
else
    print_warning "VSCode Extension connection not detected"
    print_warning "Make sure the Roo extension is running in VSCode"
fi

# Get local IP address for mobile access
print_status "Detecting network configuration..."
LOCAL_IP=$(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' 2>/dev/null || echo "Unable to detect")

# Success message
echo ""
print_header "🎉 Roo-Code Mobile Remote Access is Ready!"
echo "==========================================="
echo ""
echo "📱 Access URLs:"
echo "   Local:    http://localhost:$SERVICE_PORT"
if [ "$LOCAL_IP" != "Unable to detect" ]; then
    echo "   Mobile:   http://$LOCAL_IP:$SERVICE_PORT"
    echo "   Network:  http://$LOCAL_IP:$SERVICE_PORT"
else
    echo "   Mobile:   http://[YOUR_IP]:$SERVICE_PORT"
    echo ""
    echo "💡 To find your IP address:"
    echo "   macOS: ifconfig | grep 'inet ' | grep -v 127.0.0.1"
    echo "   Linux: ip addr show | grep 'inet ' | grep -v 127.0.0.1"
fi
echo ""
echo "🔍 Service endpoints:"
echo "   Status:   http://localhost:$SERVICE_PORT/status"
echo "   Health:   http://localhost:$SERVICE_PORT/health"
echo ""
echo "📊 Service management:"
echo "   Stop:     ./scripts/stop-roo-remote.sh"
echo "   Restart:  ./scripts/stop-roo-remote.sh && ./scripts/start-roo-remote.sh"
echo "   Logs:     tail -f $LOG_FILE"
echo "   PID:      cat $PID_FILE"
echo ""
echo "🎯 What you can do:"
echo "   • Open the URL on your phone's browser"
echo "   • Type messages to control Roo-Code"
echo "   • Messages appear instantly in VSCode"
echo "   • Control your coding environment remotely"
echo ""

if [ "$IPC_STATUS" = "true" ]; then
    print_success "✅ Ready for mobile coding! Open the URL on your phone."
else
    print_warning "⚠️  Start the Roo extension in VSCode, then refresh the mobile page."
fi

echo ""
print_success "🚀 Single-service architecture = No more port conflicts!"