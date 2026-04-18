#!/bin/bash

# Update script for Appointo
# Usage: ./scripts/update.sh

set -e

PROJECT_NAME="appointo"
SERVER_USER="root"
SERVER_HOST="193.160.208.206"
SERVER_PATH="/home/root/$PROJECT_NAME"

echo "🔄 Updating Appointo..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_status "Starting update process..."

# 1. Pull latest changes
print_status "Pulling latest changes from Git..."
git pull origin main

# 2. Build new images
print_status "Building new Docker images..."
docker-compose -f docker-compose.prod.yml build

# 3. Deploy to server
print_status "Deploying to server..."
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='logs' \
    ./ $SERVER_USER@$SERVER_HOST:$SERVER_PATH/

# 4. Update on server
print_status "Updating on server..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml down && \
    docker-compose -f docker-compose.prod.yml up -d && \
    docker system prune -f"

print_status "Update completed successfully! 🎉"
print_status "Access your app at: http://$SERVER_HOST" 