#!/bin/bash

# Roo-Code Web App Stop Script
# This script stops all web application services

echo "🛑 Stopping Roo-Code Web Application..."
echo "======================================="

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
if [ ! -f "package.json" ] || [ ! -d "production-ccs" ] || [ ! -d "web-ui" ]; then
    print_error "Please run this script from the Roo-Code project root directory"
    exit 1
fi

# Stop Node.js processes
print_status "Stopping Node.js development servers..."

# Kill processes by PID if PID files exist
if [ -f ".ccs_pid" ]; then
    CCS_PID=$(cat .ccs_pid)
    if kill -0 $CCS_PID 2>/dev/null; then
        kill $CCS_PID
        print_success "Stopped CCS server (PID: $CCS_PID)"
    else
        print_warning "CCS server process not found"
    fi
    rm -f .ccs_pid
fi

if [ -f ".web_ui_pid" ]; then
    WEB_UI_PID=$(cat .web_ui_pid)
    if kill -0 $WEB_UI_PID 2>/dev/null; then
        kill $WEB_UI_PID
        print_success "Stopped Web UI server (PID: $WEB_UI_PID)"
    else
        print_warning "Web UI server process not found"
    fi
    rm -f .web_ui_pid
fi

# Kill any remaining npm run dev processes
print_status "Cleaning up any remaining development processes..."
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "ts-node-dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# Stop Docker services
print_status "Stopping Docker services..."
cd docker/development

if docker-compose ps | grep -q "Up"; then
    docker-compose down
    print_success "Docker services stopped"
else
    print_warning "Docker services were not running"
fi

cd ../..

# Clean up any temporary files
print_status "Cleaning up temporary files..."
rm -f .ccs_pid .web_ui_pid

# Final verification
print_status "Verifying all services are stopped..."

# Check if ports are still in use
if lsof -i :3001 &>/dev/null; then
    print_warning "Port 3001 is still in use"
else
    print_success "Port 3001 is free"
fi

if lsof -i :5173 &>/dev/null; then
    print_warning "Port 5173 is still in use"
else
    print_success "Port 5173 is free"
fi

if lsof -i :5432 &>/dev/null; then
    print_warning "Port 5432 (PostgreSQL) is still in use"
else
    print_success "Port 5432 is free"
fi

if lsof -i :6379 &>/dev/null; then
    print_warning "Port 6379 (Redis) is still in use"
else
    print_success "Port 6379 is free"
fi

echo ""
echo "✅ Roo-Code Web Application Stopped Successfully!"
echo "==============================================="
echo ""
echo "🔄 To start again, run:"
echo "   ./scripts/start-web-app.sh"
echo ""
print_success "All services stopped! 🛑"
