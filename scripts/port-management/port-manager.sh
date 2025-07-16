#!/bin/bash

# Roo-Code Port Management Utility
# Date: January 3, 2025
# Authority: ROO_CODE_PORT_REGISTRY.md

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Function to print header
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}🔧 Roo-Code Port Management Utility${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Function to show usage
show_usage() {
    echo -e "${CYAN}Usage: $0 [COMMAND] [OPTIONS]${NC}"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  check           Check for port conflicts"
    echo "  kill <port>     Kill process on specific port"
    echo "  killall         Kill all Roo-Code services"
    echo "  start           Start all Roo-Code services"
    echo "  stop            Stop all Roo-Code services"
    echo "  restart         Restart all Roo-Code services"
    echo "  status          Show status of all services"
    echo "  health          Check health of all services"
    echo "  registry        Show port registry"
    echo "  help            Show this help message"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  $0 check                # Check for port conflicts"
    echo "  $0 kill 3001           # Kill process on port 3001"
    echo "  $0 start               # Start all services"
    echo "  $0 status              # Show service status"
    echo ""
}

# Function to check port conflicts
check_conflicts() {
    echo -e "${BLUE}🔍 Running Port Conflict Check...${NC}"
    echo ""
    
    if [ -f "$SCRIPT_DIR/check-port-conflicts.sh" ]; then
        "$SCRIPT_DIR/check-port-conflicts.sh"
    else
        echo -e "${RED}❌ Port conflict checker not found${NC}"
        exit 1
    fi
}

# Function to kill process on specific port
kill_port() {
    local port=$1
    
    if [ -z "$port" ]; then
        echo -e "${RED}❌ Port number required${NC}"
        echo "Usage: $0 kill <port>"
        exit 1
    fi
    
    echo -e "${YELLOW}🔪 Killing process on port $port...${NC}"
    
    if lsof -i :$port > /dev/null 2>&1; then
        local process_info=$(lsof -i :$port | grep LISTEN | head -1)
        echo "Process found: $process_info"
        
        local pid=$(lsof -t -i:$port)
        if [ -n "$pid" ]; then
            sudo kill -9 $pid
            echo -e "${GREEN}✅ Process on port $port killed${NC}"
        else
            echo -e "${YELLOW}⚠️  No process found on port $port${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Port $port is not in use${NC}"
    fi
}

# Function to kill all Roo-Code services
kill_all_services() {
    echo -e "${YELLOW}🔪 Killing all Roo-Code services...${NC}"
    echo ""
    
    local ports=(3001 5173 8081 8080 5432 6379)
    local killed=0
    
    for port in "${ports[@]}"; do
        if lsof -i :$port > /dev/null 2>&1; then
            local process_info=$(lsof -i :$port | grep LISTEN | head -1)
            echo "Killing port $port: $process_info"
            
            local pid=$(lsof -t -i:$port)
            if [ -n "$pid" ]; then
                sudo kill -9 $pid 2>/dev/null || true
                killed=$((killed + 1))
            fi
        fi
    done
    
    echo ""
    if [ $killed -gt 0 ]; then
        echo -e "${GREEN}✅ Killed $killed Roo-Code services${NC}"
    else
        echo -e "${YELLOW}⚠️  No Roo-Code services were running${NC}"
    fi
}

# Function to start all services
start_services() {
    echo -e "${GREEN}🚀 Starting all Roo-Code services...${NC}"
    echo ""
    
    cd "$PROJECT_ROOT"
    
    # Start Docker services first
    echo -e "${BLUE}📦 Starting Docker services...${NC}"
    if [ -f "docker/development/docker-compose.yml" ]; then
        docker-compose -f docker/development/docker-compose.yml up -d
        echo -e "${GREEN}✅ Docker services started${NC}"
    else
        echo -e "${YELLOW}⚠️  Docker compose file not found${NC}"
    fi
    
    echo ""
    
    # Start Production CCS Server
    echo -e "${BLUE}🏭 Starting Production CCS Server (Port 3001)...${NC}"
    if [ -d "production-ccs" ]; then
        cd production-ccs
        npm start > /dev/null 2>&1 &
        echo -e "${GREEN}✅ Production CCS Server started${NC}"
        cd ..
    else
        echo -e "${YELLOW}⚠️  Production CCS directory not found${NC}"
    fi
    
    # Start Web UI
    echo -e "${BLUE}🌐 Starting Web UI (Port 5173)...${NC}"
    if [ -d "web-ui" ]; then
        cd web-ui
        npm run dev > /dev/null 2>&1 &
        echo -e "${GREEN}✅ Web UI started${NC}"
        cd ..
    else
        echo -e "${YELLOW}⚠️  Web UI directory not found${NC}"
    fi
    
    # Start POC Remote UI
    echo -e "${BLUE}🔗 Starting POC Remote UI (Port 8081)...${NC}"
    if [ -f "poc-remote-ui/ccs/server.js" ]; then
        cd poc-remote-ui/ccs
        node server.js > /dev/null 2>&1 &
        echo -e "${GREEN}✅ POC Remote UI started${NC}"
        cd ../..
    else
        echo -e "${YELLOW}⚠️  POC Remote UI server not found${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}🎉 All services startup initiated${NC}"
    echo -e "${CYAN}💡 Use '$0 status' to check service status${NC}"
}

# Function to stop all services
stop_services() {
    echo -e "${YELLOW}🛑 Stopping all Roo-Code services...${NC}"
    echo ""
    
    # Kill application services
    kill_all_services
    
    echo ""
    
    # Stop Docker services
    echo -e "${BLUE}📦 Stopping Docker services...${NC}"
    cd "$PROJECT_ROOT"
    if [ -f "docker/development/docker-compose.yml" ]; then
        docker-compose -f docker/development/docker-compose.yml down
        echo -e "${GREEN}✅ Docker services stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  Docker compose file not found${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}✅ All services stopped${NC}"
}

# Function to restart all services
restart_services() {
    echo -e "${PURPLE}🔄 Restarting all Roo-Code services...${NC}"
    echo ""
    
    stop_services
    echo ""
    sleep 3
    start_services
    
    echo ""
    echo -e "${GREEN}🎉 All services restarted${NC}"
}

# Function to show service status
show_status() {
    echo -e "${BLUE}📊 Roo-Code Service Status${NC}"
    echo "========================================"
    echo ""
    
    local services=(
        "3001:Production CCS Server"
        "5173:Web UI React (Vite)"
        "8081:POC Remote UI"
        "8080:Redis Commander"
        "5432:PostgreSQL (Dev)"
        "6379:Redis (Dev)"
    )
    
    for service in "${services[@]}"; do
        local port="${service%%:*}"
        local name="${service#*:}"
        
        if lsof -i :$port > /dev/null 2>&1; then
            local process_info=$(lsof -i :$port | grep LISTEN | head -1 | awk '{print $1, $2}')
            echo -e "  ✅ Port $port: ${GREEN}$name${NC} (Running)"
            echo -e "     Process: $process_info"
        else
            echo -e "  ❌ Port $port: ${RED}$name${NC} (Stopped)"
        fi
        echo ""
    done
}

# Function to check service health
check_health() {
    echo -e "${BLUE}🏥 Roo-Code Service Health Check${NC}"
    echo "========================================"
    echo ""
    
    local healthy=0
    local total=0
    
    # Check Production CCS Server
    echo -e "${BLUE}🏭 Production CCS Server (Port 3001)${NC}"
    total=$((total + 1))
    if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "  ✅ ${GREEN}Healthy${NC} - Responding to health checks"
        healthy=$((healthy + 1))
    else
        echo -e "  ❌ ${RED}Unhealthy${NC} - Not responding to health checks"
    fi
    echo ""
    
    # Check Web UI
    echo -e "${BLUE}🌐 Web UI React (Port 5173)${NC}"
    total=$((total + 1))
    if curl -f -s http://localhost:5173 > /dev/null 2>&1; then
        echo -e "  ✅ ${GREEN}Healthy${NC} - Responding to requests"
        healthy=$((healthy + 1))
    else
        echo -e "  ❌ ${RED}Unhealthy${NC} - Not responding to requests"
    fi
    echo ""
    
    # Check POC Remote UI
    echo -e "${BLUE}🔗 POC Remote UI (Port 8081)${NC}"
    total=$((total + 1))
    if curl -f -s http://localhost:8081/health > /dev/null 2>&1; then
        echo -e "  ✅ ${GREEN}Healthy${NC} - Responding to health checks"
        healthy=$((healthy + 1))
    else
        echo -e "  ❌ ${RED}Unhealthy${NC} - Not responding to health checks"
    fi
    echo ""
    
    # Check Redis Commander
    echo -e "${BLUE}📊 Redis Commander (Port 8080)${NC}"
    total=$((total + 1))
    if curl -f -s http://localhost:8080 > /dev/null 2>&1; then
        echo -e "  ✅ ${GREEN}Healthy${NC} - Web interface accessible"
        healthy=$((healthy + 1))
    else
        echo -e "  ❌ ${RED}Unhealthy${NC} - Web interface not accessible"
    fi
    echo ""
    
    # Check PostgreSQL
    echo -e "${BLUE}🗄️  PostgreSQL (Port 5432)${NC}"
    total=$((total + 1))
    if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        echo -e "  ✅ ${GREEN}Healthy${NC} - Database accepting connections"
        healthy=$((healthy + 1))
    else
        echo -e "  ❌ ${RED}Unhealthy${NC} - Database not accepting connections"
    fi
    echo ""
    
    # Check Redis
    echo -e "${BLUE}🔄 Redis (Port 6379)${NC}"
    total=$((total + 1))
    if redis-cli -p 6379 ping > /dev/null 2>&1; then
        echo -e "  ✅ ${GREEN}Healthy${NC} - Cache responding to ping"
        healthy=$((healthy + 1))
    else
        echo -e "  ❌ ${RED}Unhealthy${NC} - Cache not responding to ping"
    fi
    echo ""
    
    # Summary
    echo -e "${BLUE}📋 Health Summary${NC}"
    echo "========================================"
    if [ $healthy -eq $total ]; then
        echo -e "${GREEN}✅ All services healthy ($healthy/$total)${NC}"
        echo -e "${GREEN}🎉 System ready for production${NC}"
    else
        echo -e "${YELLOW}⚠️  $healthy/$total services healthy${NC}"
        echo -e "${RED}❌ System requires attention${NC}"
    fi
    echo ""
}

# Function to show port registry
show_registry() {
    echo -e "${BLUE}📋 Roo-Code Port Registry${NC}"
    echo "========================================"
    echo ""
    echo -e "${PURPLE}Production Services (3000-3099):${NC}"
    echo "  3001 - Production CCS Server ✅"
    echo "  3002 - Production WebSocket 🔄"
    echo "  3003 - Production Health Check 🔄"
    echo "  3004 - Production Metrics 🔄"
    echo ""
    echo -e "${PURPLE}Development Services (5000-5199, 8081-8099):${NC}"
    echo "  5173 - Web UI React (Vite) ✅"
    echo "  8081 - POC Remote UI ✅"
    echo "  5001 - Development API 🔄"
    echo "  5002 - Hot Reload Server 🔄"
    echo ""
    echo -e "${PURPLE}Testing Services (3100-3199):${NC}"
    echo "  3100 - Test Server 🔄"
    echo "  3101 - Integration Tests 🔄"
    echo "  3102 - Load Testing 🔄"
    echo "  3103 - E2E Testing 🔄"
    echo ""
    echo -e "${PURPLE}Database Services (5400-5499):${NC}"
    echo "  5432 - PostgreSQL (Dev) ✅"
    echo "  5433 - PostgreSQL (Test) 🔄"
    echo "  5434 - PostgreSQL (Prod) 🔄"
    echo ""
    echo -e "${PURPLE}Cache Services (6300-6399):${NC}"
    echo "  6379 - Redis (Dev) ✅"
    echo "  6380 - Redis (Test) 🔄"
    echo "  6381 - Redis (Prod) 🔄"
    echo ""
    echo -e "${PURPLE}Docker Services (8080-8099):${NC}"
    echo "  8080 - Redis Commander ✅"
    echo "  8082 - pgAdmin 🔄"
    echo "  8083 - Docker Registry 🔄"
    echo ""
    echo -e "${YELLOW}Legend:${NC}"
    echo "  ✅ - Currently active/allocated"
    echo "  🔄 - Reserved for future use"
    echo ""
    echo "Authority: docs/ROO_CODE_PORT_REGISTRY.md"
    echo "Audit: docs/PORT_ALLOCATION_AUDIT_AND_STANDARDIZATION.md"
    echo ""
}

# Main execution
main() {
    print_header
    
    local command=${1:-help}
    
    case $command in
        "check")
            check_conflicts
            ;;
        "kill")
            kill_port $2
            ;;
        "killall")
            kill_all_services
            ;;
        "start")
            start_services
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            restart_services
            ;;
        "status")
            show_status
            ;;
        "health")
            check_health
            ;;
        "registry")
            show_registry
            ;;
        "help"|"--help"|"-h")
            show_usage
            ;;
        *)
            echo -e "${RED}❌ Unknown command: $command${NC}"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
