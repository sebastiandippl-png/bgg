#!/bin/bash
# IONOS Deployment Script for BGStats Dashboard
# Uses rsync over SSH to mirror the dist directory.
# Optionally download remote DB before upload: set DOWNLOAD_REMOTE_DB=1
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_CONFIG_PATH="$SCRIPT_DIR/ionos_deploy.local.conf"

if [ ! -f "$DEPLOY_CONFIG_PATH" ]; then
    echo "Error: missing deployment config at $DEPLOY_CONFIG_PATH"
    echo "Create it with IONOS_HOST, IONOS_USER, and optional IONOS_PASSWORD values."
    exit 1
fi

# shellcheck disable=SC1090
source "$DEPLOY_CONFIG_PATH"

IONOS_PASSWORD="${IONOS_PASSWORD:-}"
REMOTE_PATH="${REMOTE_PATH:-bgstats/}"
DIST_PATH="${DIST_PATH:-dist}"
# If DOWNLOAD_REMOTE_DB is not set in the environment, prompt the user (when interactive).
DRY_RUN="${DRY_RUN:-0}"
if [ -z "${DOWNLOAD_REMOTE_DB+x}" ]; then
    if [ -t 0 ]; then
        read -p "Download remote DB before uploading? [y/N] " _ans
        case "$_ans" in
            [Yy]*) DOWNLOAD_REMOTE_DB=1 ;;
            *) DOWNLOAD_REMOTE_DB=0 ;;
        esac
    else
        echo "DOWNLOAD_REMOTE_DB not set and no interactive TTY; defaulting to 0"
        DOWNLOAD_REMOTE_DB=0
    fi
else
    DOWNLOAD_REMOTE_DB="${DOWNLOAD_REMOTE_DB}"
fi

if [[ "$DIST_PATH" = /* ]]; then
    DIST_SOURCE="$DIST_PATH"
else
    DIST_SOURCE="$SCRIPT_DIR/$DIST_PATH"
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${YELLOW}=== IONOS BGStats Dashboard Deployment ===${NC}\n"

if [ -z "$IONOS_HOST" ] || [ -z "$IONOS_USER" ]; then
    echo -e "${RED}Error: IONOS_HOST and IONOS_USER are required${NC}"
    exit 1
fi

if [ ! -d "$DIST_SOURCE" ]; then
    echo -e "${RED}Error: dist/ folder not found at $DIST_SOURCE${NC}"
    exit 1
fi

if ! command -v rsync &> /dev/null; then
    echo -e "${RED}Error: rsync is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}Validating SSH connection...${NC}"
if [ -z "$IONOS_PASSWORD" ]; then
    if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$IONOS_USER@$IONOS_HOST" "echo 'SSH connection OK'" > /dev/null 2>&1; then
        echo -e "${RED}Error: Cannot connect to server. Set up SSH key or provide IONOS_PASSWORD${NC}"
        exit 1
    fi
else
    if ! command -v sshpass &> /dev/null; then
        echo -e "${YELLOW}Warning: sshpass not installed. Using key-based authentication if available...${NC}"
    else
        echo -e "${GREEN}Using password authentication${NC}"
    fi
fi

RSYNC_COMMON_OPTS=(
    -avz
    --checksum
    --itemize-changes
    --exclude='.git'
    --exclude='node_modules'
    --exclude='*.swp'
)

if [ "$DRY_RUN" = "1" ]; then
    RSYNC_COMMON_OPTS+=(--dry-run)
    echo -e "${YELLOW}DRY RUN enabled: rsync will not make changes${NC}"
fi

run_rsync() {
    local src="$1" local dest="$2"
    if [ -n "$IONOS_PASSWORD" ] && command -v sshpass &> /dev/null; then
        sshpass -p "$IONOS_PASSWORD" rsync "${RSYNC_COMMON_OPTS[@]}" -e "ssh -o StrictHostKeyChecking=accept-new" "$src" "$dest"
    else
        rsync "${RSYNC_COMMON_OPTS[@]}" -e "ssh -o StrictHostKeyChecking=accept-new" "$src" "$dest"
    fi
}

# If requested, download remote DB files (overwrite local)
if [ "$DOWNLOAD_REMOTE_DB" = "1" ]; then
    echo -e "${GREEN}Downloading remote DB and db_storage from server into $DIST_SOURCE ...${NC}"
    mkdir -p "$DIST_SOURCE"
    run_rsync "$IONOS_USER@$IONOS_HOST:$REMOTE_PATH/bgg.db" "$DIST_SOURCE/"
    mkdir -p "$DIST_SOURCE/db_storage"
    run_rsync "$IONOS_USER@$IONOS_HOST:$REMOTE_PATH/db_storage/" "$DIST_SOURCE/db_storage/"
    if [ ! -f "$DIST_SOURCE/bgg.db" ]; then
        echo -e "${RED}Error: remote bgg.db was not found or failed to download${NC}"
        exit 1
    fi
    echo -e "${GREEN}Remote DB files downloaded into $DIST_SOURCE${NC}"
fi

# Safety check
if [ ! -f "$DIST_SOURCE/bgg.db" ] && [ ! -d "$DIST_SOURCE/db_storage" ]; then
    echo -e "${YELLOW}Warning: No local bgg.db or db_storage present in $DIST_SOURCE.${NC}"
    echo -e "${YELLOW}Without remote-download, running rsync --delete may remove remote DB files.${NC}"
    echo -e "${YELLOW}Set DOWNLOAD_REMOTE_DB=1 to fetch remote DB before upload, or set FORCE=1 to proceed anyway.${NC}"
    if [ "${FORCE:-0}" != "1" ]; then
        exit 1
    fi
fi

echo -e "${GREEN}Uploading dist folder to IONOS...${NC}"
if [ -n "$IONOS_PASSWORD" ] && command -v sshpass &> /dev/null; then
    sshpass -p "$IONOS_PASSWORD" rsync "${RSYNC_COMMON_OPTS[@]}" --delete -e "ssh -o StrictHostKeyChecking=accept-new" "$DIST_SOURCE/" "$IONOS_USER@$IONOS_HOST:$REMOTE_PATH"
else
    rsync "${RSYNC_COMMON_OPTS[@]}" --delete -e "ssh -o StrictHostKeyChecking=accept-new" "$DIST_SOURCE/" "$IONOS_USER@$IONOS_HOST:$REMOTE_PATH"
fi

echo -e "${GREEN}✓ Dist folder uploaded successfully!${NC}"
echo -e "${GREEN}✓ Deployment complete${NC}"

