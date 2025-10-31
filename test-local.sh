#!/bin/bash
# Test script for Homebox addon Docker image
# Builds locally without pushing - much faster for testing!

set -e

cd "$(dirname "$0")/homebox"

# Auto-detect architecture (default to native for faster builds)
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)
    BUILD_ARCH="amd64"
    PLATFORM="linux/amd64"
    ;;
  arm64|aarch64)
    BUILD_ARCH="aarch64"
    PLATFORM="linux/arm64"
    ;;
  *)
    echo "Unknown architecture: $ARCH, defaulting to amd64"
    BUILD_ARCH="amd64"
    PLATFORM="linux/amd64"
    ;;
esac

# Allow override via ARCH env var
if [ -n "$ARCH_OVERRIDE" ]; then
  BUILD_ARCH="$ARCH_OVERRIDE"
  if [ "$BUILD_ARCH" = "amd64" ]; then
    PLATFORM="linux/amd64"
  elif [ "$BUILD_ARCH" = "aarch64" ]; then
    PLATFORM="linux/arm64"
  fi
fi

echo "============================================"
echo "Building Homebox addon Docker image locally"
echo "Architecture: $BUILD_ARCH (native - fast!)"
echo "Platform: $PLATFORM"
echo "============================================"
echo ""

# Use regular docker build for native architecture (much faster than buildx with QEMU)
# Only use buildx if we need cross-platform or want to leverage buildkit features
NATIVE_ARCH=$(uname -m | sed 's/x86_64/amd64/;s/arm64/aarch64/')
if [ "$BUILD_ARCH" = "$NATIVE_ARCH" ]; then
  echo "Using native Docker build (fastest option)..."
  docker build \
    --build-arg BUILD_ARCH=$BUILD_ARCH \
    --build-arg BUILD_FROM=ghcr.io/hassio-addons/base:14.2.2 \
    --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --build-arg BUILD_DESCRIPTION="Homebox - Inventory and organization system" \
    --build-arg BUILD_NAME=Homebox \
    --build-arg BUILD_REF=local-test \
    --build-arg BUILD_REPOSITORY=Oddiesea/homebox-ingress-ha-addon \
    --build-arg BUILD_VERSION=test \
    --tag homebox-addon:test \
    --progress=plain \
    .
else
  echo "Using buildx for cross-platform build..."
  docker buildx build \
    --platform $PLATFORM \
    --build-arg BUILD_ARCH=$BUILD_ARCH \
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
fi

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

# Start the container with HA addon environment variables
# s6-overlay and bashio need these to work properly
CONTAINER_ID=$(docker run -d \
  --name homebox-test \
  -v "$DATA_DIR:/data" \
  -p 7745:7745 \
  -e SUPERVISOR_TOKEN=test-token \
  -e SUPERVISOR_URL=http://supervisor \
  -e HOMEASSISTANT_REPOSITORY=https://github.com/home-assistant/core \
  -e CORE_HOST=core \
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

