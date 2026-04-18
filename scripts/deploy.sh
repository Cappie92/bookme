#!/bin/bash

# Deploy script for Appointo
# Usage: ./scripts/deploy.sh [dev|prod]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_NAME="appointo"
SERVER_USER="root"
SERVER_HOST="193.160.208.206"
SERVER_PATH="/home/root/$PROJECT_NAME"

echo "🚀 Deploying Appointo to $ENVIRONMENT environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Create logs directory if it doesn't exist
mkdir -p logs

if [ "$ENVIRONMENT" = "prod" ]; then
    print_status "Deploying to production..."
    
    # Build and push to server
    print_status "Building Docker images..."
    docker-compose -f docker-compose.prod.yml build
    
    print_status "Pushing to server..."
    rsync -avz --exclude='node_modules' --exclude='.git' --exclude='logs' \
        ./ $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
    
    print_status "Deploying on server..."
    ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
        docker-compose -f docker-compose.prod.yml down && \
        docker-compose -f docker-compose.prod.yml up -d && \
        docker system prune -f"
    
    print_status "Production deployment completed!"
    print_status "Access your app at: http://$SERVER_HOST"
    
else
    print_status "Deploying to development..."
    
    # Local development deployment
    print_status "Building and starting containers..."
    docker-compose down
    docker-compose build
    docker-compose up -d
    
    print_status "Development deployment completed!"
    print_status "Access your app at: http://localhost:5173"
fi

print_status "Deployment completed successfully! 🎉" 