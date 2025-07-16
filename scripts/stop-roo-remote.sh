#!/bin/bash

# Roo-Code Mobile Remote Access - Stop Script
# Gracefully stops the POC Remote UI service

echo "🛑 Stopping Roo-Code Mobile Remote Access"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
SERVICE_PORT=8081
PID_FILE="/tmp/roo-remote-ui.pid"
LOG_FILE="/tmp/roo-remote-ui.log"

# Function to stop service by PID
stop_by_pid() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        
        if kill -0 "$pid" 2>/dev/null; then
            print_status "Stopping service (PID: $pid)..."
            
            # Graceful shutdown
            kill -TERM "$pid" 2>/dev/null
            
            # Wait up to 10 seconds for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                echo -n "."
                sleep 1
                count=$((count + 1))
            done
            
            if [ $count -gt 0 ]; then
                echo ""  # New line after dots
            fi
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                print_warning "Forcing shutdown..."
                kill -9 "$pid" 2>/dev/null || true
                sleep 1
            fi
            
            # Verify it's stopped
            if ! kill -0 "$pid" 2>/dev/null; then
                print_success "Service stopped ✓"
            else
                print_error "Failed to stop service"
                return 1
            fi
        else
            print_status "Service was not running (stale PID file)"
        fi
        
        # Clean up PID file
        rm -f "$PID_FILE"
    else
        print_status "No PID file found"
    fi
}

# Function to stop by port (backup method)
stop_by_port() {
    local pids=$(lsof -ti :$SERVICE_PORT 2>/dev/null || true)
    
    if [ -n "$pids" ]; then
        print_status "Found processes on port $SERVICE_PORT..."
        
        # Graceful shutdown
        echo $pids | xargs kill -TERM 2>/dev/null || true
        sleep 3
        
        # Force kill if needed
        local remaining_pids=$(lsof -ti :$SERVICE_PORT 2>/dev/null || true)
        if [ -n "$remaining_pids" ]; then
            print_warning "Force stopping remaining processes..."
            echo $remaining_pids | xargs kill -9 2>/dev/null || true
            sleep 1
        fi
        
        print_success "Port $SERVICE_PORT cleared ✓"
    fi
}

# Function to stop related Node.js processes
stop_related_processes() {
    print_status "Cleaning up related processes..."
    
    # Stop any remaining POC remote processes
    local poc_pids=$(pgrep -f "poc.*server.js" 2>/dev/null || true)
    if [ -n "$poc_pids" ]; then
        echo $poc_pids | xargs kill -TERM 2>/dev/null || true
        sleep 2
        
        # Force kill if needed
        local remaining_poc=$(pgrep -f "poc.*server.js" 2>/dev/null || true)
        if [ -n "$remaining_poc" ]; then
            echo $remaining_poc | xargs kill -9 2>/dev/null || true
        fi
    fi
    
    # Stop any npm processes related to port 8081
    local npm_pids=$(pgrep -f "npm.*start" | xargs ps -o pid,command | grep -i "8081\|poc\|remote" | awk '{print $1}' 2>/dev/null || true)
    if [ -n "$npm_pids" ]; then
        echo $npm_pids | xargs kill -TERM 2>/dev/null || true
        sleep 2
    fi
}

# Main execution
print_status "Stopping Roo-Code Mobile Remote Access service..."

# Method 1: Stop by PID file
stop_by_pid

# Method 2: Stop by port (backup)
stop_by_port

# Method 3: Clean up any related processes
stop_related_processes

# Final verification
print_status "Verifying service is stopped..."

if lsof -Pi :$SERVICE_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_error "Port $SERVICE_PORT is still in use"
    
    # Show what's using it
    echo ""
    print_status "Processes still using port $SERVICE_PORT:"
    lsof -i :$SERVICE_PORT
    
    exit 1
else
    print_success "Port $SERVICE_PORT is free ✓"
fi

# Clean up log file if it's large
if [ -f "$LOG_FILE" ] && [ $(wc -c < "$LOG_FILE") -gt 1048576 ]; then
    print_status "Rotating large log file..."
    mv "$LOG_FILE" "${LOG_FILE}.old"
    print_success "Log rotated ✓"
fi

echo ""
print_success "🎯 Roo-Code Mobile Remote Access stopped successfully!"
echo ""
echo "📱 Service is now offline"
echo "🚀 To restart: ./scripts/start-roo-remote.sh"
echo ""

# Show final status
print_status "System status:"
echo "   • Port $SERVICE_PORT: Available"
echo "   • VSCode Extension: Still running"
echo "   • Remote Access: Offline"
echo ""
print_success "✅ Clean shutdown complete"