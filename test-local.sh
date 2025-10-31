#!/bin/bash
# Test script for Homebox addon Docker image

set -e

cd "$(dirname "$0")/homebox"

echo "Building Homebox addon Docker image..."
echo ""

docker buildx build \
  --platform linux/amd64 \
  --build-arg BUILD_ARCH=amd64 \
  --build-arg BUILD_FROM=ghcr.io/hassio-addons/base:14.2.2 \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --build-arg BUILD_DESCRIPTION="Homebox - Inventory and organization system" \
  --build-arg BUILD_NAME=Homebox \
  --build-arg BUILD_REF=local-test \
  --build-arg BUILD_REPOSITORY=Oddiesea/homebox-ingress-ha-addon \
  --build-arg BUILD_VERSION=test \
  --tag homebox-addon:test \
  --load \
  --progress=plain \
  .

echo ""
echo "============================================"
echo "Build completed! Testing the container..."
echo "============================================"
echo ""
echo "Starting container in background..."
echo ""

# Create a temp data directory
DATA_DIR=$(mktemp -d)
echo "Data directory: $DATA_DIR"

# Start the container
CONTAINER_ID=$(docker run -d \
  --name homebox-test \
  -v "$DATA_DIR:/data" \
  -p 7745:7745 \
  homebox-addon:test)

echo "Container started with ID: $CONTAINER_ID"
echo ""
echo "Waiting 5 seconds for services to start..."
sleep 5

echo ""
echo "============================================"
echo "Container Logs:"
echo "============================================"
docker logs $CONTAINER_ID

echo ""
echo "============================================"
echo "Checking if homebox is running..."
echo "============================================"

# Check if process is running
docker exec $CONTAINER_ID ps aux | grep -i homebox || echo "Homebox process not found"

echo ""
echo "Testing HTTP connection..."
curl -v http://localhost:7745 2>&1 | head -20 || echo "HTTP connection failed"

echo ""
echo "============================================"
echo "Container Info:"
echo "============================================"
echo "Container ID: $CONTAINER_ID"
echo "Access URL: http://localhost:7745"
echo "Data directory: $DATA_DIR"
echo ""
echo "To view logs: docker logs -f $CONTAINER_ID"
echo "To stop: docker stop $CONTAINER_ID && docker rm $CONTAINER_ID"
echo "To shell into container: docker exec -it $CONTAINER_ID /bin/sh"

