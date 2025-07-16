#!/bin/bash

# Roo-Code Port Conflict Detection and Management Script
# Date: January 3, 2025
# Authority: ROO_CODE_PORT_REGISTRY.md

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Port definitions from ROO_CODE_PORT_REGISTRY.md
declare -A PRODUCTION_PORTS=(
    [3001]="Production CCS Server"
    [3002]="Production WebSocket"
    [3003]="Production Health Check"
    [3004]="Production Metrics"
)

declare -A DEVELOPMENT_PORTS=(
    [5173]="Web UI React (Vite)"
    [8081]="POC Remote UI"
    [5001]="Development API"
    [5002]="Hot Reload Server"
)

declare -A TESTING_PORTS=(
    [3100]="Test Server"
    [3101]="Integration Tests"
    [3102]="Load Testing"
    [3103]="E2E Testing"
)

declare -A DATABASE_PORTS=(
    [5432]="PostgreSQL (Dev)"
    [5433]="PostgreSQL (Test)"
    [5434]="PostgreSQL (Prod)"
)

declare -A CACHE_PORTS=(
    [6379]="Redis (Dev)"
    [6380]="Redis (Test)"
    [6381]="Redis (Prod)"
)

declare -A DOCKER_PORTS=(
    [8080]="Redis Commander"
    [8082]="pgAdmin"
    [8083]="Docker Registry"
)

declare -A FORBIDDEN_PORTS=(
    [3000]="Reserved for external services"
    [80]="HTTP reserved"
    [443]="HTTPS reserved"
    [22]="SSH reserved"
    [25]="SMTP reserved"
)

# Function to print header
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}🔍 Roo-Code Port Conflict Check${NC}"
    echo -e "${BLUE}================================${NC}"
    echo ""
}

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is available
    fi
}

# Function to get process info for port
get_port_info() {
    local port=$1
    lsof -i :$port 2>/dev/null | grep LISTEN | head -1
}

# Function to check port category
check_port_category() {
    local category_name=$1
    local -n ports_ref=$2
    local expected_active=$3
    
    echo -e "${BLUE}📋 $category_name${NC}"
    echo "----------------------------------------"
    
    local conflicts=0
    local total=0
    
    for port in "${!ports_ref[@]}"; do
        local service="${ports_ref[$port]}"
        total=$((total + 1))
        
        if check_port $port; then
            local process_info=$(get_port_info $port)
            if [[ "$expected_active" == *"$port"* ]]; then
                echo -e "  ✅ Port $port: ${GREEN}$service${NC} (Active as expected)"
                echo -e "     Process: $process_info"
            else
                echo -e "  ⚠️  Port $port: ${YELLOW}$service${NC} (Unexpected activity)"
                echo -e "     Process: $process_info"
                conflicts=$((conflicts + 1))
            fi
        else
            if [[ "$expected_active" == *"$port"* ]]; then
                echo -e "  ❌ Port $port: ${RED}$service${NC} (Expected active but available)"
                conflicts=$((conflicts + 1))
            else
                echo -e "  🔄 Port $port: $service (Available as expected)"
            fi
        fi
    done
    
    echo ""
    if [ $conflicts -eq 0 ]; then
        echo -e "  ${GREEN}✅ $category_name: No conflicts detected${NC}"
    else
        echo -e "  ${RED}⚠️  $category_name: $conflicts conflicts detected${NC}"
    fi
    echo ""
    
    return $conflicts
}

# Function to check forbidden ports
check_forbidden_ports() {
    echo -e "${RED}🚫 Forbidden Ports Check${NC}"
    echo "----------------------------------------"
    
    local violations=0
    
    for port in "${!FORBIDDEN_PORTS[@]}"; do
        local reason="${FORBIDDEN_PORTS[$port]}"
        
        if check_port $port; then
            local process_info=$(get_port_info $port)
            # Check if it's a Roo-Code service
            if echo "$process_info" | grep -q -E "(node|npm|vite|postgres|redis)"; then
                echo -e "  ❌ Port $port: ${RED}VIOLATION${NC} - $reason"
                echo -e "     Roo-Code Process: $process_info"
                violations=$((violations + 1))
            else
                echo -e "  ℹ️  Port $port: External service (OK) - $reason"
                echo -e "     Process: $process_info"
            fi
        else
            echo -e "  ✅ Port $port: Available (Good) - $reason"
        fi
    done
    
    echo ""
    if [ $violations -eq 0 ]; then
        echo -e "  ${GREEN}✅ Forbidden Ports: No violations${NC}"
    else
        echo -e "  ${RED}❌ Forbidden Ports: $violations violations detected${NC}"
    fi
    echo ""
    
    return $violations
}

# Function to generate port conflict report
generate_report() {
    local total_conflicts=$1
    
    echo -e "${BLUE}📊 Port Conflict Summary${NC}"
    echo "========================================"
    
    if [ $total_conflicts -eq 0 ]; then
        echo -e "${GREEN}✅ SYSTEM STATUS: FULLY COMPLIANT${NC}"
        echo -e "${GREEN}✅ All ports properly allocated${NC}"
        echo -e "${GREEN}✅ No conflicts detected${NC}"
        echo -e "${GREEN}✅ Ready for production deployment${NC}"
    else
        echo -e "${RED}⚠️  SYSTEM STATUS: CONFLICTS DETECTED${NC}"
        echo -e "${RED}❌ Total conflicts: $total_conflicts${NC}"
        echo -e "${YELLOW}⚠️  Action required before deployment${NC}"
    fi
    
    echo ""
    echo "Registry Authority: docs/ROO_CODE_PORT_REGISTRY.md"
    echo "Audit Document: docs/PORT_ALLOCATION_AUDIT_AND_STANDARDIZATION.md"
    echo "Last Check: $(date)"
    echo ""
}

# Function to provide resolution suggestions
provide_resolution() {
    local total_conflicts=$1
    
    if [ $total_conflicts -gt 0 ]; then
        echo -e "${YELLOW}🔧 Conflict Resolution Suggestions${NC}"
        echo "========================================"
        echo ""
        echo "1. Kill conflicting processes:"
        echo "   sudo kill -9 \$(lsof -t -i:PORT_NUMBER)"
        echo ""
        echo "2. Check all Roo-Code ports:"
        echo "   for port in 3001 5173 8081 8080 5432 6379; do"
        echo "     echo \"Port \$port:\""
        echo "     lsof -i :\$port 2>/dev/null || echo \"  Available\""
        echo "   done"
        echo ""
        echo "3. Start services in correct order:"
        echo "   cd production-ccs && npm start &     # Port 3001"
        echo "   cd web-ui && npm run dev &           # Port 5173"
        echo "   cd poc-remote-ui/ccs && node server.js &  # Port 8081"
        echo ""
        echo "4. Verify Docker services:"
        echo "   docker-compose -f docker/development/docker-compose.yml up -d"
        echo ""
        echo "5. Update registry if needed:"
        echo "   Edit docs/ROO_CODE_PORT_REGISTRY.md"
        echo "   Update docs/PORT_ALLOCATION_AUDIT_AND_STANDARDIZATION.md"
        echo ""
    fi
}

# Main execution
main() {
    print_header
    
    # Expected active ports (currently running services)
    local expected_active="3001 5173 8081 8080 5432 6379"
    
    local total_conflicts=0
    
    # Check each category
    check_port_category "Production Services (3000-3099)" PRODUCTION_PORTS "$expected_active"
    total_conflicts=$((total_conflicts + $?))
    
    check_port_category "Development Services (5000-5199, 8081-8099)" DEVELOPMENT_PORTS "$expected_active"
    total_conflicts=$((total_conflicts + $?))
    
    check_port_category "Testing Services (3100-3199)" TESTING_PORTS "$expected_active"
    total_conflicts=$((total_conflicts + $?))
    
    check_port_category "Database Services (5400-5499)" DATABASE_PORTS "$expected_active"
    total_conflicts=$((total_conflicts + $?))
    
    check_port_category "Cache Services (6300-6399)" CACHE_PORTS "$expected_active"
    total_conflicts=$((total_conflicts + $?))
    
    check_port_category "Docker Services (8080-8099)" DOCKER_PORTS "$expected_active"
    total_conflicts=$((total_conflicts + $?))
    
    # Check forbidden ports
    check_forbidden_ports
    total_conflicts=$((total_conflicts + $?))
    
    # Generate report
    generate_report $total_conflicts
    
    # Provide resolution suggestions if needed
    provide_resolution $total_conflicts
    
    # Exit with appropriate code
    exit $total_conflicts
}

# Run main function
main "$@"
