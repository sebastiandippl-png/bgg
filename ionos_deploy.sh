#!/bin/bash
# IONOS Deployment Script for BGStats Dashboard
# Uses rsync over SSH to mirror the dist directory without transferring database files

set -e

# Local deployment configuration (not committed)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_CONFIG_PATH="$SCRIPT_DIR/ionos_deploy.local.conf"

if [ ! -f "$DEPLOY_CONFIG_PATH" ]; then
    echo "Error: missing deployment config at $DEPLOY_CONFIG_PATH"
    echo "Create it with IONOS_HOST, IONOS_USER, and optional IONOS_PASSWORD values."
    exit 1
fi

# shellcheck disable=SC1090
source "$DEPLOY_CONFIG_PATH"

# Optional defaults if not set in local config
IONOS_PASSWORD="${IONOS_PASSWORD:-}"
REMOTE_PATH="${REMOTE_PATH:-bgstats/}"
DIST_PATH="${DIST_PATH:-dist}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== IONOS BGStats Dashboard Deployment ===${NC}\n"

# Validate configuration
if [ -z "$IONOS_HOST" ] || [ -z "$IONOS_USER" ]; then
    echo -e "${RED}Error: IONOS_HOST and IONOS_USER are required${NC}"
    exit 1
fi

# Check local files
if [ ! -d "$DIST_PATH" ]; then
    echo -e "${RED}Error: dist/ folder not found${NC}"
    exit 1
fi

# Check if rsync is available
if ! command -v rsync &> /dev/null; then
    echo -e "${RED}Error: rsync is not installed. Install it or use lftp${NC}"
    exit 1
fi

echo -e "${GREEN}Validating SSH connection...${NC}"

# Test SSH connection (without password prompt)
if [ -z "$IONOS_PASSWORD" ]; then
    # Try key-based auth
    if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$IONOS_USER@$IONOS_HOST" "echo 'SSH connection OK'" > /dev/null 2>&1; then
        echo -e "${RED}Error: Cannot connect to server. Set up SSH key or provide IONOS_PASSWORD${NC}"
        exit 1
    fi
else
    # Use sshpass for password auth (if available)
    if ! command -v sshpass &> /dev/null; then
        echo -e "${YELLOW}Warning: sshpass not installed. Using key-based authentication...${NC}"
    else
        echo -e "${GREEN}Using password authentication${NC}"
    fi
fi

# Deploy via rsync over SSH
echo -e "${GREEN}Uploading dist folder to IONOS...${NC}"

# Create temporary filter file to protect database files on the server
FILTER_FILE=$(mktemp)
cat > "$FILTER_FILE" << 'EOF'
P bgg.db
P db_storage/
EOF

RSYNC_OPTS="-avz --delete --exclude='.git' --exclude='node_modules' --exclude='*.swp' --filter=._$FILTER_FILE"

if [ -n "$IONOS_PASSWORD" ] && command -v sshpass &> /dev/null; then
    # Use password auth via sshpass
    sshpass -p "$IONOS_PASSWORD" rsync $RSYNC_OPTS \
        -e "ssh -o StrictHostKeyChecking=accept-new" \
        "$DIST_PATH/" "$IONOS_USER@$IONOS_HOST:$REMOTE_PATH"
else
    # Use key-based auth
    rsync $RSYNC_OPTS \
        -e "ssh -o StrictHostKeyChecking=accept-new" \
        "$DIST_PATH/" "$IONOS_USER@$IONOS_HOST:$REMOTE_PATH"
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dist folder uploaded successfully!${NC}"
else
    echo -e "${RED}✗ Upload failed${NC}"
    rm -f "$FILTER_FILE"
    exit 1
fi

# Clean up filter file
rm -f "$FILTER_FILE"

echo -e "${GREEN}✓ Database files were not uploaded or downloaded${NC}"

echo -e "${GREEN}✓ Deployment complete!${NC}"

