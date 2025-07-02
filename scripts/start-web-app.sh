#!/bin/bash

# Roo-Code Web App Startup Script
# This script automates the startup process for the complete web application

set -e  # Exit on any error

echo "🚀 Starting Roo-Code Web Application..."
echo "========================================"

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

# Step 1: Check prerequisites
print_status "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js >= 18.0.0"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    print_error "Node.js version $NODE_VERSION is too old. Please install >= $REQUIRED_VERSION"
    exit 1
fi

print_success "Node.js version $NODE_VERSION ✓"

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose"
    exit 1
fi

print_success "Docker and Docker Compose ✓"

# Step 2: Start database services
print_status "Starting database services..."

cd docker/development

# Check if services are already running
if docker-compose ps | grep -q "Up"; then
    print_warning "Some services are already running. Stopping them first..."
    docker-compose down
fi

# Start services
docker-compose up -d

# Wait for services to be ready
print_status "Waiting for database services to be ready..."
sleep 10

# Verify PostgreSQL
if docker exec development_postgres_1 pg_isready -U roo_user -d roo_db &> /dev/null; then
    print_success "PostgreSQL is ready ✓"
else
    print_error "PostgreSQL failed to start"
    exit 1
fi

# Verify Redis
if docker exec development_redis_1 redis-cli ping | grep -q "PONG"; then
    print_success "Redis is ready ✓"
else
    print_error "Redis failed to start"
    exit 1
fi

cd ../..

# Step 3: Setup Production CCS Server
print_status "Setting up Production CCS Server..."

cd production-ccs

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing CCS dependencies..."
    npm install
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    print_status "Creating CCS environment file..."
    cp .env.example .env
    
    # Update .env with development settings
    cat > .env << EOF
# Development Environment Configuration
NODE_ENV=development
PORT=3001

# Database Configuration
DATABASE_URL=postgresql://roo_user:roo_password@localhost:5432/roo_db
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=24h

# CORS Configuration
CORS_ORIGIN=http://localhost:5173

# Logging
LOG_LEVEL=debug

# WebSocket Configuration
WS_PORT=3001
EOF
fi

# Build TypeScript
print_status "Building CCS TypeScript..."
npm run build

# Start CCS server in background
print_status "Starting CCS server..."
npm run dev &
CCS_PID=$!

# Wait for CCS server to start
print_status "Waiting for CCS server to be ready..."
sleep 5

# Test CCS server health
for i in {1..10}; do
    if curl -s http://localhost:3001/api/health &> /dev/null; then
        print_success "CCS server is ready ✓"
        break
    fi
    if [ $i -eq 10 ]; then
        print_error "CCS server failed to start"
        kill $CCS_PID 2>/dev/null || true
        exit 1
    fi
    sleep 2
done

cd ..

# Step 4: Setup Web UI
print_status "Setting up Web UI..."

cd web-ui

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing Web UI dependencies..."
    npm install
fi

# Create environment file
print_status "Creating Web UI environment file..."
cat > .env.local << EOF
VITE_API_BASE_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001
VITE_APP_NAME=Roo-Code Web Interface
EOF

# Start Web UI in background
print_status "Starting Web UI development server..."
npm run dev &
WEB_UI_PID=$!

# Wait for Web UI to start
print_status "Waiting for Web UI to be ready..."
sleep 5

# Test Web UI
for i in {1..10}; do
    if curl -s http://localhost:5173 &> /dev/null; then
        print_success "Web UI is ready ✓"
        break
    fi
    if [ $i -eq 10 ]; then
        print_error "Web UI failed to start"
        kill $WEB_UI_PID 2>/dev/null || true
        kill $CCS_PID 2>/dev/null || true
        exit 1
    fi
    sleep 2
done

cd ..

# Step 5: Final verification
print_status "Running final system verification..."

# Test API connectivity
if curl -s http://localhost:3001/api/health | grep -q "ok"; then
    print_success "API health check passed ✓"
else
    print_warning "API health check failed"
fi

# Create PID file for easy cleanup
echo "$CCS_PID" > .ccs_pid
echo "$WEB_UI_PID" > .web_ui_pid

# Success message
echo ""
echo "🎉 Roo-Code Web Application Started Successfully!"
echo "=============================================="
echo ""
echo "📱 Web UI:     http://localhost:5173"
echo "🔧 API Server: http://localhost:3001"
echo "📊 API Health: http://localhost:3001/api/health"
echo ""
echo "🔍 Services Status:"
echo "   • PostgreSQL: Running on port 5432"
echo "   • Redis:      Running on port 6379"
echo "   • CCS Server: Running on port 3001 (PID: $CCS_PID)"
echo "   • Web UI:     Running on port 5173 (PID: $WEB_UI_PID)"
echo ""
echo "🛑 To stop all services, run:"
echo "   ./scripts/stop-web-app.sh"
echo ""
echo "📖 For troubleshooting, see:"
echo "   docs/WEB_APP_STARTUP_GUIDE.md"
echo ""
print_success "Ready for development! 🚀"
