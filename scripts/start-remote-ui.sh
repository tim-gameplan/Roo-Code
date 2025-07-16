#!/bin/bash

# Roo-Code Remote UI Quick Start Script
# Starts the essential POC Remote UI for mobile access

set -e

echo "📱 Starting Roo-Code Remote UI for Mobile Access"
echo "=============================================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Check if we're in the right directory
if [ ! -d "poc-remote-ui" ]; then
    echo "Error: Please run this script from the Roo-Code project root directory"
    exit 1
fi

# Stop any existing services on port 8081
if lsof -Pi :8081 -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_warning "Stopping existing service on port 8081..."
    pkill -f "8081" || true
    sleep 2
fi

# Start POC Remote UI
print_status "Starting POC Remote UI..."
cd poc-remote-ui/ccs

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
fi

# Start the server
npm start &
POC_PID=$!

# Wait for service to be ready
print_status "Waiting for service to be ready..."
sleep 5

# Test if it's working
if curl -s http://localhost:8081/health >/dev/null 2>&1; then
    print_success "POC Remote UI is running! ✅"
    
    # Get connection status
    IPC_STATUS=$(curl -s http://localhost:8081/status | grep -o '"ipcConnected":[^,]*' | cut -d':' -f2)
    
    if [ "$IPC_STATUS" = "true" ]; then
        print_success "Connected to VSCode Extension! ✅"
    else
        print_warning "Not connected to VSCode Extension (make sure Roo extension is running)"
    fi
    
    echo ""
    echo "🎉 Remote UI Ready!"
    echo "=================="
    echo ""
    echo "📱 Access from any device:"
    echo "   Local:  http://localhost:8081"
    echo "   Mobile: http://[YOUR_IP]:8081"
    echo ""
    echo "💡 Find your IP address:"
    echo "   macOS:  ifconfig | grep 'inet ' | grep -v 127.0.0.1"
    echo "   Linux:  ip addr show | grep 'inet ' | grep -v 127.0.0.1"
    echo ""
    echo "🔍 Service endpoints:"
    echo "   Health: http://localhost:8081/health"
    echo "   Status: http://localhost:8081/status"
    echo ""
    echo "🛑 To stop: pkill -f '8081' or run stop-all-services.sh"
    echo ""
    echo "📱 Now open your phone's browser and navigate to your computer's IP:8081"
    print_success "You can now control Roo-Code from your mobile device! 🚀"
    
else
    echo "❌ Failed to start POC Remote UI"
    kill $POC_PID 2>/dev/null || true
    exit 1
fi