#!/bin/bash

# Roo-Code Complete System Stop Script
# Stops all remote UI services gracefully

echo "🛑 Stopping Roo-Code Remote UI System"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to stop service by port
stop_by_port() {
    local port=$1
    local service_name=$2
    
    local pids=$(lsof -ti :$port 2>/dev/null)
    
    if [ -n "$pids" ]; then
        print_status "Stopping $service_name (port $port)..."
        echo $pids | xargs kill -TERM 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        local remaining_pids=$(lsof -ti :$port 2>/dev/null)
        if [ -n "$remaining_pids" ]; then
            print_warning "Force stopping $service_name..."
            echo $remaining_pids | xargs kill -9 2>/dev/null || true
        fi
        
        print_success "$service_name stopped ✓"
    else
        print_status "$service_name was not running"
    fi
}

# Function to stop services by name pattern
stop_by_pattern() {
    local pattern=$1
    local service_name=$2
    
    local pids=$(pgrep -f "$pattern" 2>/dev/null)
    
    if [ -n "$pids" ]; then
        print_status "Stopping $service_name processes..."
        echo $pids | xargs kill -TERM 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        local remaining_pids=$(pgrep -f "$pattern" 2>/dev/null)
        if [ -n "$remaining_pids" ]; then
            print_warning "Force stopping $service_name..."
            echo $remaining_pids | xargs kill -9 2>/dev/null || true
        fi
        
        print_success "$service_name processes stopped ✓"
    fi
}

# Stop services by port (primary method)
stop_by_port 8081 "POC Remote UI"
stop_by_port 3001 "Production CCS Server"
stop_by_port 5173 "Web UI React"

# Stop any remaining Node.js processes related to our services
print_status "Stopping remaining service processes..."

stop_by_pattern "server.js" "POC CCS Server"
stop_by_pattern "npm.*dev" "Development Servers"
stop_by_pattern "vite" "Vite Dev Server"
stop_by_pattern "ts-node-dev" "TypeScript Dev Server"

# Clean up PID file if it exists
if [ -f "/tmp/roo-code-pids.txt" ]; then
    print_status "Cleaning up PID tracking file..."
    
    # Try to stop processes listed in PID file
    while IFS= read -r pid; do
        if [[ "$pid" =~ ^[0-9]+$ ]]; then
            if kill -0 "$pid" 2>/dev/null; then
                kill -TERM "$pid" 2>/dev/null || true
            fi
        fi
    done < /tmp/roo-code-pids.txt
    
    rm -f /tmp/roo-code-pids.txt
    print_success "PID file cleaned up ✓"
fi

# Final verification
echo ""
print_status "Verifying all services are stopped..."

services_stopped=true

for port in 8081 3001 5173; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port $port is still in use"
        services_stopped=false
    fi
done

if $services_stopped; then
    print_success "All Roo-Code remote UI services stopped successfully ✓"
else
    print_warning "Some services may still be running. Check manually if needed:"
    echo "   lsof -i :8081 -i :3001 -i :5173"
fi

echo ""
echo "📱 Remote UI services stopped"
echo "🔧 VSCode Extension remains running"
echo "🚀 To restart: ./scripts/start-all-services.sh"
echo ""
print_success "System shutdown complete! ✅"