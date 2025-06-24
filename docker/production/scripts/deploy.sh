#!/bin/bash
set -e

# Production Deployment Script
# Deploys the Roo-Code Cloud Communication Service to production

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DOCKER_COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/../.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    log "🔍 Checking deployment prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose is not available"
        exit 1
    fi
    
    # Check if environment file exists
    if [ ! -f "$ENV_FILE" ]; then
        error "Environment file not found: $ENV_FILE"
        error "Please create the environment file with required variables"
        exit 1
    fi
    
    # Check if docker-compose.yml exists
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        error "Docker Compose file not found: $DOCKER_COMPOSE_FILE"
        exit 1
    fi
    
    success "✅ Prerequisites check passed"
}

# Function to validate environment variables
validate_environment() {
    log "🔧 Validating environment configuration..."
    
    # Source the environment file
    source "$ENV_FILE"
    
    # Required variables
    REQUIRED_VARS=(
        "POSTGRES_DB"
        "POSTGRES_USER" 
        "POSTGRES_PASSWORD"
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "ENCRYPTION_KEY"
    )
    
    local missing_vars=()
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            error "  - $var"
        done
        exit 1
    fi
    
    success "✅ Environment validation passed"
}

# Function to create necessary directories
create_directories() {
    log "📁 Creating necessary directories..."
    
    local dirs=(
        "/var/lib/roo-cloud/postgres"
        "/var/lib/roo-cloud/redis"
        "/var/lib/roo-cloud/backups"
        "/var/log/roo-cloud"
    )
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            sudo mkdir -p "$dir"
            log "Created directory: $dir"
        fi
    done
    
    # Set proper permissions
    sudo chown -R 999:999 /var/lib/roo-cloud/postgres
    sudo chown -R 999:999 /var/lib/roo-cloud/redis
    sudo chown -R 999:999 /var/lib/roo-cloud/backups
    
    success "✅ Directories created and configured"
}

# Function to pull latest images
pull_images() {
    log "📥 Pulling latest Docker images..."
    
    cd "$(dirname "$DOCKER_COMPOSE_FILE")"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose pull
    else
        docker compose pull
    fi
    
    success "✅ Images pulled successfully"
}

# Function to build custom images
build_images() {
    log "🔨 Building custom Docker images..."
    
    cd "$(dirname "$DOCKER_COMPOSE_FILE")"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose build --no-cache
    else
        docker compose build --no-cache
    fi
    
    success "✅ Images built successfully"
}

# Function to start services
start_services() {
    log "🚀 Starting production services..."
    
    cd "$(dirname "$DOCKER_COMPOSE_FILE")"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d
    else
        docker compose up -d
    fi
    
    success "✅ Services started successfully"
}

# Function to wait for services to be ready
wait_for_services() {
    log "⏳ Waiting for services to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "Attempt $attempt/$max_attempts: Checking service health..."
        
        # Check PostgreSQL
        if docker exec roo-cloud-postgres pg_isready -U postgres > /dev/null 2>&1; then
            success "✅ PostgreSQL is ready"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            error "Services failed to start within expected time"
            exit 1
        fi
        
        sleep 10
        ((attempt++))
    done
    
    # Additional health checks
    sleep 5
    
    # Check Redis
    if docker exec roo-cloud-redis redis-cli ping > /dev/null 2>&1; then
        success "✅ Redis is ready"
    else
        warning "⚠️  Redis health check failed"
    fi
    
    success "✅ All services are ready"
}

# Function to run database migrations
run_migrations() {
    log "🗃️  Running database migrations..."
    
    # Wait a bit more for PostgreSQL to be fully ready
    sleep 5
    
    # Run migrations
    docker exec roo-cloud-postgres psql -U postgres -d roo_cloud -f /docker-entrypoint-initdb.d/001_initial_setup.sql > /dev/null 2>&1 || true
    docker exec roo-cloud-postgres psql -U postgres -d roo_cloud -f /docker-entrypoint-initdb.d/002_core_schema.sql > /dev/null 2>&1 || true
    
    success "✅ Database migrations completed"
}

# Function to verify deployment
verify_deployment() {
    log "🔍 Verifying deployment..."
    
    # Check if all containers are running
    local containers=(
        "roo-cloud-postgres"
        "roo-cloud-redis"
    )
    
    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}" | grep -q "$container"; then
            success "✅ $container is running"
        else
            error "❌ $container is not running"
            exit 1
        fi
    done
    
    # Run health checks
    log "Running health checks..."
    
    # PostgreSQL health check
    if docker exec roo-cloud-postgres /usr/local/bin/health-check.sh > /dev/null 2>&1; then
        success "✅ PostgreSQL health check passed"
    else
        warning "⚠️  PostgreSQL health check failed"
    fi
    
    # Redis health check
    if docker exec roo-cloud-redis /usr/local/bin/health-check.sh > /dev/null 2>&1; then
        success "✅ Redis health check passed"
    else
        warning "⚠️  Redis health check failed"
    fi
    
    success "✅ Deployment verification completed"
}

# Function to show deployment status
show_status() {
    log "📊 Deployment Status:"
    
    cd "$(dirname "$DOCKER_COMPOSE_FILE")"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose ps
    else
        docker compose ps
    fi
    
    echo ""
    log "📋 Service Information:"
    log "   • PostgreSQL: localhost:5432"
    log "   • Redis: localhost:6379"
    log "   • Data Directory: /var/lib/roo-cloud"
    log "   • Backup Directory: /var/lib/roo-cloud/backups"
    log "   • Log Directory: /var/log/roo-cloud"
    
    echo ""
    log "🔧 Management Commands:"
    log "   • View logs: docker-compose logs -f"
    log "   • Stop services: docker-compose down"
    log "   • Restart services: docker-compose restart"
    log "   • Run backup: docker exec roo-cloud-postgres /usr/local/bin/backup.sh"
}

# Main deployment function
main() {
    log "🚀 Starting Roo-Code Cloud Communication Service deployment..."
    
    check_prerequisites
    validate_environment
    create_directories
    pull_images
    build_images
    start_services
    wait_for_services
    run_migrations
    verify_deployment
    show_status
    
    success "🎉 Deployment completed successfully!"
    log "The Roo-Code Cloud Communication Service is now running in production mode."
}

# Handle script arguments
case "${1:-}" in
    "check")
        check_prerequisites
        validate_environment
        ;;
    "build")
        build_images
        ;;
    "start")
        start_services
        ;;
    "stop")
        cd "$(dirname "$DOCKER_COMPOSE_FILE")"
        if command -v docker-compose &> /dev/null; then
            docker-compose down
        else
            docker compose down
        fi
        ;;
    "status")
        show_status
        ;;
    "logs")
        cd "$(dirname "$DOCKER_COMPOSE_FILE")"
        if command -v docker-compose &> /dev/null; then
            docker-compose logs -f
        else
            docker compose logs -f
        fi
        ;;
    *)
        main
        ;;
esac
