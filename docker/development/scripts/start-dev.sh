#!/bin/bash

# Roo-Code Development Environment Startup Script
# This script starts the complete development infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DEV_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$DOCKER_DEV_DIR")")"

echo -e "${BLUE}🚀 Starting Roo-Code Development Environment${NC}"
echo -e "${BLUE}=============================================${NC}"

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

print_status "Docker is running"

# Check if Docker Compose is available
if ! command -v docker-compose > /dev/null 2>&1; then
    print_error "Docker Compose is not installed. Please install Docker Compose and try again."
    exit 1
fi

print_status "Docker Compose is available"

# Navigate to the Docker development directory
cd "$DOCKER_DEV_DIR"

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found in $DOCKER_DEV_DIR"
    exit 1
fi

print_status "Found docker-compose.yml"

# Create shared database directories if they don't exist
mkdir -p ../shared/database/{migrations,schemas,seeds}
print_status "Created shared database directories"

# Pull latest images
echo -e "\n${BLUE}📦 Pulling latest Docker images...${NC}"
docker-compose pull

# Start the services
echo -e "\n${BLUE}🔧 Starting development services...${NC}"
docker-compose up -d

# Wait for services to be healthy
echo -e "\n${BLUE}⏳ Waiting for services to be ready...${NC}"

# Function to wait for service health
wait_for_service() {
    local service_name=$1
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose ps "$service_name" | grep -q "healthy\|Up"; then
            print_status "$service_name is ready"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_warning "$service_name took longer than expected to start"
    return 1
}

# Wait for PostgreSQL
echo -n "Waiting for PostgreSQL"
wait_for_service "postgres"

# Wait for Redis
echo -n "Waiting for Redis"
wait_for_service "redis"

# Wait for PgAdmin
echo -n "Waiting for PgAdmin"
wait_for_service "pgadmin"

# Wait for Redis Commander
echo -n "Waiting for Redis Commander"
wait_for_service "redis-commander"

# Display service information
echo -e "\n${GREEN}🎉 Development environment is ready!${NC}"
echo -e "${GREEN}====================================${NC}"

echo -e "\n${BLUE}📊 Service Information:${NC}"
echo -e "┌─────────────────────────────────────────────────────────────┐"
echo -e "│ ${YELLOW}PostgreSQL Database${NC}                                      │"
echo -e "│ Host: localhost:5432                                        │"
echo -e "│ Database: roo_code_dev                                      │"
echo -e "│ Username: roo_dev                                           │"
echo -e "│ Password: dev_password_2024                                 │"
echo -e "├─────────────────────────────────────────────────────────────┤"
echo -e "│ ${YELLOW}Redis Cache${NC}                                             │"
echo -e "│ Host: localhost:6379                                        │"
echo -e "│ No authentication required                                  │"
echo -e "├─────────────────────────────────────────────────────────────┤"
echo -e "│ ${YELLOW}PgAdmin (Database Management)${NC}                           │"
echo -e "│ URL: http://localhost:8080                                  │"
echo -e "│ Email: dev@roo-code.local                                   │"
echo -e "│ Password: dev_admin_2024                                    │"
echo -e "├─────────────────────────────────────────────────────────────┤"
echo -e "│ ${YELLOW}Redis Commander (Redis Management)${NC}                      │"
echo -e "│ URL: http://localhost:8081                                  │"
echo -e "│ Username: dev                                               │"
echo -e "│ Password: dev_redis_2024                                    │"
echo -e "└─────────────────────────────────────────────────────────────┘"

echo -e "\n${BLUE}🔧 Useful Commands:${NC}"
echo -e "• View logs: ${YELLOW}docker-compose logs -f [service_name]${NC}"
echo -e "• Stop services: ${YELLOW}docker-compose down${NC}"
echo -e "• Restart service: ${YELLOW}docker-compose restart [service_name]${NC}"
echo -e "• View status: ${YELLOW}docker-compose ps${NC}"

echo -e "\n${BLUE}📝 Next Steps:${NC}"
echo -e "1. Connect your application to PostgreSQL at localhost:5432"
echo -e "2. Connect your application to Redis at localhost:6379"
echo -e "3. Use PgAdmin at http://localhost:8080 for database management"
echo -e "4. Use Redis Commander at http://localhost:8081 for Redis management"

echo -e "\n${GREEN}Happy coding! 🎯${NC}"
