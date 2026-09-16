#!/bin/bash

###############################################################################
# Kafka Topics Creation Script
# 
# Creates the three main topics and their dead-letter topics for Sprint 7
# 
# Usage:
#   ./create-topics.sh                 # Create topics
#   ./create-topics.sh --reset         # Delete and recreate all topics
#   ./create-topics.sh --verify        # Just verify existing topics
#   ./create-topics.sh --describe      # Show detailed topic configuration
#
# Requirements:
#   - Docker daemon running
#   - Kafka container named 'kafka' running at 10.8.66.137:9092
#   - docker command accessible in PATH
#
###############################################################################

set -e

# Configuration
BOOTSTRAP_SERVER="${KAFKA_BOOTSTRAP_SERVER:-kafka:9092}"
KAFKA_BIN_DIR="${KAFKA_HOME:-/opt/kafka}/bin"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Topic definitions matching contracts/kafka-topics.md
declare -A TOPICS=(
    [orders]="3:604800000"           # 3 partitions, 7 days retention (ms)
    [trade-events]="3:2592000000"    # 3 partitions, 30 days retention (ms)
    [market-data]="6:86400000"       # 6 partitions, 1 day retention (ms)
)

declare -A DLT_TOPICS=(
    [orders.DLT]="1:2592000000"      # 1 partition, 30 days retention
    [trade-events.DLT]="1:7776000000" # 1 partition, 90 days retention
    [market-data.DLT]="1:604800000"  # 1 partition, 7 days retention
)

###############################################################################
# Pre-flight Checks
###############################################################################

# check_docker_installed() {
#     log_info "Checking if Docker is installed..."
#     if ! command -v docker &> /dev/null; then
#         log_error "Docker is not installed or not in PATH"
#         return 1
#     fi
#     log_success "Docker is installed"
#     return 0
# }

# check_docker_running() {
#     log_info "Checking if Docker daemon is running..."
#     if ! docker ps > /dev/null 2>&1; then
#         log_error "Docker daemon is not running. Start Docker and try again"
#         return 1
#     fi
#     log_success "Docker daemon is running"
#     return 0
# }

# check_kafka_container() {
#     log_info "Checking if Kafka container 'kafka' is running..."
#     if ! docker ps | grep -q "kafka"; then
#         log_error "Kafka container 'kafka' is not running"
#         return 1
#     fi
#     log_success "Kafka container is running"
#     return 0
# }

# check_docker_exec() {
#     log_info "Checking if docker exec can run commands in Kafka container..."
#     if ! docker exec kafka echo "Docker exec works" > /dev/null 2>&1; then
#         log_error "Cannot execute commands in Kafka container"
#         return 1
#     fi
#     log_success "Docker exec is functional"
#     return 0
# }

check_kafka_tools() {
    log_info "Checking if kafka-topics.sh exists..."

    if ! test -f /opt/kafka/bin/kafka-topics.sh; then
        log_error "kafka-topics.sh not found"
        return 1
    fi

    log_success "kafka-topics.sh found"
    return 0
}

run_preflight_checks() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Running Pre-Flight Checks${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    if ! check_docker_installed; then return 1; fi
    if ! check_docker_running; then return 1; fi
    if ! check_kafka_container; then return 1; fi
    if ! check_docker_exec; then return 1; fi
    if ! check_kafka_tools; then return 1; fi
    
    echo ""
    log_success "All pre-flight checks passed!"
    echo ""
    return 0
}

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

check_broker_connectivity() {
    log_info "Checking Kafka broker connectivity at $BOOTSTRAP_SERVER..."
    
    if /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP_SERVER" --list > /dev/null 2>&1; then
        log_success "Broker is reachable"
        return 0
    else
        log_error "Cannot reach Kafka broker at $BOOTSTRAP_SERVER"
        return 1
    fi
}

topic_exists() {
    local topic=$1
    /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP_SERVER" --list 2>/dev/null | grep -q "^${topic}$"
}

delete_topic() {
    local topic=$1
    log_info "Deleting topic: $topic"
    /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP_SERVER" --delete --topic "$topic" || true
    sleep 1
}


create_topic() {
    local topic=$1
    local partitions=$2
    local retention=$3
    
    if topic_exists "$topic"; then
        log_warning "Topic '$topic' already exists, skipping..."
        return 0
    fi
    
    log_info "Creating topic: $topic (partitions=$partitions, retention=${retention}ms)"
    /opt/kafka/bin/kafka-topics.sh \
        --bootstrap-server "$BOOTSTRAP_SERVER" \
        --create \
        --topic "$topic" \
        --partitions "$partitions" \
        --replication-factor 1 \
        --config "retention.ms=$retention"
    
    log_success "Created topic: $topic"
}

describe_topics() {
    log_info "Describing all trading system topics..."
    echo ""
    
    /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP_SERVER" --describe \
        --topics-with-overrides | grep -E "(orders|trade-events|market-data|DLT)" || true
    
    echo ""
}

verify_topics() {
    log_info "Verifying topic configuration..."
    local all_ok=true
    
    echo ""
    echo -e "${BLUE}Main Topics:${NC}"
    for topic in "${!TOPICS[@]}"; do
        if topic_exists "$topic"; then
            log_success "Topic exists: $topic"
        else
            log_error "Topic missing: $topic"
            all_ok=false
        fi
    done
    
    echo ""
    echo -e "${BLUE}Dead-Letter Topics:${NC}"
    for topic in "${!DLT_TOPICS[@]}"; do
        if topic_exists "$topic"; then
            log_success "Topic exists: $topic"
        else
            log_error "Topic missing: $topic"
            all_ok=false
        fi
    done
    
    echo ""
    
    if [ "$all_ok" = true ]; then
        log_success "All topics are present"
        return 0
    else
        log_error "Some topics are missing"
        return 1
    fi
}

create_all_topics() {
    log_info "Creating main topics..."
    for topic in "${!TOPICS[@]}"; do
        IFS=':' read -r partitions retention <<< "${TOPICS[$topic]}"
        create_topic "$topic" "$partitions" "$retention"
    done
    
    echo ""
    log_info "Creating dead-letter topics..."
    for topic in "${!DLT_TOPICS[@]}"; do
        IFS=':' read -r partitions retention <<< "${DLT_TOPICS[$topic]}"
        create_topic "$topic" "$partitions" "$retention"
    done
}

reset_all_topics() {
    log_warning "RESETTING: Deleting all trading system topics..."
    echo ""
    
    # Delete main topics
    for topic in "${!TOPICS[@]}"; do
        delete_topic "$topic"
    done
    
    # Delete DLT topics
    for topic in "${!DLT_TOPICS[@]}"; do
        delete_topic "$topic"
    done
    
    echo ""
    log_info "Recreating topics..."
    create_all_topics
}

print_summary() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Topic Configuration Summary${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    echo -e "${BLUE}Main Topics (ordered work queues by account):${NC}"
    printf "%-20s %-12s %-20s\n" "Topic" "Partitions" "Retention"
    printf "%-20s %-12s %-20s\n" "-----" "----------" "---------"
    printf "%-20s %-12s %-20s\n" "orders" "3" "7 days (604800000ms)"
    printf "%-20s %-12s %-20s\n" "trade-events" "3" "30 days (2592000000ms)"
    printf "%-20s %-12s %-20s\n" "market-data" "6" "1 day (86400000ms)"
    
    echo ""
    echo -e "${BLUE}Dead-Letter Topics (error handling):${NC}"
    printf "%-20s %-12s %-20s\n" "Topic" "Partitions" "Retention"
    printf "%-20s %-12s %-20s\n" "-----" "----------" "---------"
    printf "%-20s %-12s %-20s\n" "orders.DLT" "1" "30 days (2592000000ms)"
    printf "%-20s %-12s %-20s\n" "trade-events.DLT" "1" "90 days (7776000000ms)"
    printf "%-20s %-12s %-20s\n" "market-data.DLT" "1" "7 days (604800000ms)"
    
    echo ""
    echo -e "${BLUE}Key Design Decisions:${NC}"
    echo "  • orders & trade-events keyed by accountId → per-account ordering"
    echo "  • market-data keyed by symbol → per-instrument ordering"
    echo "  • DLT retention varies by criticality: audit(90d) > ops(30d) > ephemeral(7d)"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_usage() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  (no args)     Create topics (idempotent)"
    echo "  --reset       Delete all topics and recreate from scratch"
    echo "  --verify      Verify all topics exist"
    echo "  --describe    Show detailed topic configuration"
    echo "  --help        Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  KAFKA_BOOTSTRAP_SERVER  Kafka broker address (default: localhost:9092)"
    echo "  KAFKA_HOME              Kafka installation directory (default: /opt/kafka)"
    echo ""
}

###############################################################################
# Main Execution
###############################################################################

main() {
    echo ""
    log_info "Kafka Topics Management Script"
    log_info "Bootstrap Server: $BOOTSTRAP_SERVER"
    echo ""
    
    # Run pre-flight checks first
    if ! run_preflight_checks; then
        log_error "Pre-flight checks failed. Cannot proceed"
        exit 1
    fi
    
    # Check broker connectivity
    if ! check_broker_connectivity; then
        log_error "Cannot proceed without broker connectivity"
        exit 1
    fi
    
    # Handle command line arguments
    case "${1:-create}" in
        --reset)
            reset_all_topics
            verify_topics
            describe_topics
            print_summary
            log_success "Topics reset and recreated successfully"
            ;;
        --verify)
            verify_topics
            ;;
        --describe)
            describe_topics
            ;;
        --help)
            print_usage
            ;;
        create|'')
            create_all_topics
            verify_topics
            print_summary
            log_success "Topics created successfully"
            ;;
        *)
            log_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
    
    echo ""
}

main "$@"
