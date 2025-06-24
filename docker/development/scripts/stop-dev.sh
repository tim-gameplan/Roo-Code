#!/bin/bash

# Roo-Code Development Environment Stop Script
# This script stops the complete development infrastructure

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

echo -e "${BLUE}🛑 Stopping Roo-Code Development Environment${NC}"
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
    print_warning "Docker is not running. Services may already be stopped."
    exit 0
fi

# Navigate to the Docker development directory
cd "$DOCKER_DEV_DIR"

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    print_error "docker-compose.yml not found in $DOCKER_DEV_DIR"
    exit 1
fi

print_status "Found docker-compose.yml"

# Parse command line arguments
REMOVE_VOLUMES=false
REMOVE_IMAGES=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --volumes|-v)
            REMOVE_VOLUMES=true
            shift
            ;;
        --images|-i)
            REMOVE_IMAGES=true
            shift
            ;;
        --clean|-c)
            REMOVE_VOLUMES=true
            REMOVE_IMAGES=true
            shift
            ;;
        --help|-h)
            echo -e "${BLUE}Usage: $0 [OPTIONS]${NC}"
            echo -e ""
            echo -e "${YELLOW}Options:${NC}"
            echo -e "  -v, --volumes    Remove volumes (deletes all data)"
            echo -e "  -i, --images     Remove downloaded images"
            echo -e "  -c, --clean      Remove both volumes and images"
            echo -e "  -h, --help       Show this help message"
            echo -e ""
            echo -e "${YELLOW}Examples:${NC}"
            echo -e "  $0                # Stop services only"
            echo -e "  $0 --volumes      # Stop services and remove data"
            echo -e "  $0 --clean        # Stop services, remove data and images"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo -e "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Stop the services
echo -e "\n${BLUE}🔧 Stopping development services...${NC}"
docker-compose down

print_status "Services stopped"

# Remove volumes if requested
if [ "$REMOVE_VOLUMES" = true ]; then
    echo -e "\n${YELLOW}⚠ Removing volumes (this will delete all data)...${NC}"
    read -p "Are you sure? This will permanently delete all database data. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down -v
        print_status "Volumes removed"
    else
        print_warning "Volume removal cancelled"
    fi
fi

# Remove images if requested
if [ "$REMOVE_IMAGES" = true ]; then
    echo -e "\n${BLUE}🗑️ Removing downloaded images...${NC}"
    
    # Get list of images used by this compose file
    IMAGES=$(docker-compose config | grep 'image:' | awk '{print $2}' | sort | uniq)
    
    for image in $IMAGES; do
        if docker image inspect "$image" > /dev/null 2>&1; then
            echo -e "Removing image: ${YELLOW}$image${NC}"
            docker rmi "$image" 2>/dev/null || print_warning "Could not remove image: $image"
        fi
    done
    
    print_status "Images removed"
fi

# Clean up any orphaned containers
echo -e "\n${BLUE}🧹 Cleaning up orphaned containers...${NC}"
docker container prune -f > /dev/null 2>&1 || true
print_status "Orphaned containers cleaned"

# Show final status
echo -e "\n${GREEN}✅ Development environment stopped successfully!${NC}"

# Show what was done
echo -e "\n${BLUE}📊 Summary:${NC}"
echo -e "• Services stopped: ✓"
if [ "$REMOVE_VOLUMES" = true ]; then
    echo -e "• Data volumes removed: ✓"
else
    echo -e "• Data volumes preserved: ✓"
fi
if [ "$REMOVE_IMAGES" = true ]; then
    echo -e "• Images removed: ✓"
else
    echo -e "• Images preserved: ✓"
fi

echo -e "\n${BLUE}🔧 Useful Commands:${NC}"
echo -e "• Start again: ${YELLOW}./start-dev.sh${NC}"
echo -e "• Clean restart: ${YELLOW}./stop-dev.sh --clean && ./start-dev.sh${NC}"
echo -e "• View remaining containers: ${YELLOW}docker ps -a${NC}"
echo -e "• View remaining volumes: ${YELLOW}docker volume ls${NC}"

if [ "$REMOVE_VOLUMES" = false ]; then
    echo -e "\n${YELLOW}💡 Note: Database data is preserved. Use --volumes to remove it.${NC}"
fi

echo -e "\n${GREEN}Environment stopped! 🎯${NC}"
