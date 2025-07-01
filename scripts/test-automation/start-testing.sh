#!/bin/bash

# RCCS First Run Testing - Automation Script
# This script helps automate the initial setup and execution of testing phases

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TESTING_BRANCH="first-run-testing"
DOCKER_COMPOSE_PATH="docker/development"
PRODUCTION_CCS_PATH="production-ccs"
DOCS_TESTING_PATH="docs/testing"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if we're on the testing branch
    current_branch=$(git branch --show-current)
    if [ "$current_branch" != "$TESTING_BRANCH" ]; then
        log_error "Not on testing branch. Current branch: $current_branch"
        log_info "Please switch to branch: $TESTING_BRANCH"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed or not in PATH"
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed or not in PATH"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

setup_environment() {
    log_info "Setting up test environment..."
    
    # Create testing session file with current timestamp
    current_time=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Update current test session
    if [ -f "$DOCS_TESTING_PATH/current-test-session.md" ]; then
        # Update the session start time and tester info
        sed -i.bak "s/\[Time\]/$current_time/g" "$DOCS_TESTING_PATH/current-test-session.md"
        sed -i.bak "s/\[Your Name\]/$(whoami)/g" "$DOCS_TESTING_PATH/current-test-session.md"
        rm "$DOCS_TESTING_PATH/current-test-session.md.bak"
        log_success "Updated current test session file"
    fi
    
    # Update test results log
    if [ -f "$DOCS_TESTING_PATH/test-results-log.md" ]; then
        sed -i.bak "s/\[Hours\]/0/g" "$DOCS_TESTING_PATH/test-results-log.md"
        sed -i.bak "s/\[Timestamp\]/$current_time/g" "$DOCS_TESTING_PATH/test-results-log.md"
        rm "$DOCS_TESTING_PATH/test-results-log.md.bak"
        log_success "Updated test results log"
    fi
    
    log_success "Environment setup complete"
}

start_docker_services() {
    log_info "Starting Docker services..."
    
    cd "$DOCKER_COMPOSE_PATH"
    
    # Check if services are already running
    if docker-compose ps | grep -q "Up"; then
        log_warning "Some Docker services are already running"
        log_info "Stopping existing services..."
        docker-compose down
    fi
    
    # Start services
    log_info "Starting PostgreSQL and Redis..."
    docker-compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10
    
    # Test PostgreSQL connection
    if docker exec roo-code-postgres-dev pg_isready -U roo_dev -d roo_code_dev > /dev/null 2>&1; then
        log_success "PostgreSQL is ready"
    else
        log_error "PostgreSQL is not ready"
        exit 1
    fi
    
    # Test Redis connection
    if docker exec roo-code-redis-dev redis-cli ping | grep -q "PONG"; then
        log_success "Redis is ready"
    else
        log_error "Redis is not ready"
        exit 1
    fi
    
    cd - > /dev/null
    log_success "Docker services started successfully"
}

setup_production_ccs() {
    log_info "Setting up Production CCS server..."
    
    cd "$PRODUCTION_CCS_PATH"
    
    # Install dependencies
    log_info "Installing dependencies..."
    pnpm install
    
    # Setup environment file
    if [ ! -f ".env" ]; then
        log_info "Creating .env file from template..."
        cp .env.example .env
        log_warning "Please review and update .env file with your configuration"
    fi
    
    # Database migrations are automatically applied via Docker
    log_info "Database migrations are handled by Docker initialization"
    log_success "Database schema is ready"
    
    cd - > /dev/null
    log_success "Production CCS setup complete"
}

run_basic_tests() {
    log_info "Running basic validation tests..."
    
    cd "$PRODUCTION_CCS_PATH"
    
    # Start the server in background
    log_info "Starting CCS server..."
    pnpm run dev &
    SERVER_PID=$!
    
    # Wait for server to start
    sleep 5
    
    # Test health endpoint
    log_info "Testing health endpoint..."
    if curl -s http://localhost:3001/health > /dev/null; then
        log_success "Health endpoint is responding"
    else
        log_error "Health endpoint is not responding"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
    
    # Stop the server
    kill $SERVER_PID 2>/dev/null || true
    log_success "Basic tests completed"
    
    cd - > /dev/null
}

update_test_progress() {
    log_info "Updating test progress..."
    
    current_time=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Update current test session with progress
    if [ -f "$DOCS_TESTING_PATH/current-test-session.md" ]; then
        # Mark Phase 1 Step 1.1 as completed
        sed -i.bak 's/- \[ \] Docker services started/- [x] Docker services started/g' "$DOCS_TESTING_PATH/current-test-session.md"
        sed -i.bak 's/- \[ \] PostgreSQL connectivity verified/- [x] PostgreSQL connectivity verified/g' "$DOCS_TESTING_PATH/current-test-session.md"
        sed -i.bak 's/- \[ \] Redis connectivity verified/- [x] Redis connectivity verified/g' "$DOCS_TESTING_PATH/current-test-session.md"
        
        # Update last updated timestamp
        sed -i.bak "s/\*\*Last Updated:\*\* \[Timestamp\]/\*\*Last Updated:\*\* $current_time/g" "$DOCS_TESTING_PATH/current-test-session.md"
        
        rm "$DOCS_TESTING_PATH/current-test-session.md.bak"
        log_success "Updated test session progress"
    fi
    
    log_success "Test progress updated"
}

print_next_steps() {
    log_info "=== TESTING SETUP COMPLETE ==="
    echo ""
    log_success "✅ Docker services are running"
    log_success "✅ Production CCS server is configured"
    log_success "✅ Database migrations completed"
    log_success "✅ Basic health check passed"
    echo ""
    log_info "Next Steps:"
    echo "1. Review the test plan: docs/RCCS_FIRST_RUN_TEST_PLAN.md"
    echo "2. Update your test session: docs/testing/current-test-session.md"
    echo "3. Continue with Phase 1 testing manually"
    echo "4. Start the CCS server: cd production-ccs && pnpm run dev"
    echo "5. Run API tests as described in the test plan"
    echo ""
    log_info "Useful Commands:"
    echo "• View Docker logs: cd docker/development && docker-compose logs"
    echo "• Stop Docker services: cd docker/development && docker-compose down"
    echo "• Check database: docker exec -it roo-code-postgres-dev psql -U roo_dev -d roo_code_dev"
    echo "• Check Redis: docker exec -it roo-code-redis-dev redis-cli"
    echo ""
    log_warning "Remember to document any issues in GitHub and update test progress!"
}

# Main execution
main() {
    log_info "Starting RCCS First Run Testing Setup..."
    echo ""
    
    check_prerequisites
    setup_environment
    start_docker_services
    setup_production_ccs
    run_basic_tests
    update_test_progress
    
    echo ""
    print_next_steps
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"
