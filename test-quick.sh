#!/bin/bash
# Quick test commands

cd "$(dirname "$0")/homebox"

echo "1. Building the image..."
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
  .

echo ""
echo "2. Running container..."
DATA_DIR=$(mktemp -d)
docker run -d --name homebox-test -v "$DATA_DIR:/data" -p 7745:7745 homebox-addon:test

echo ""
echo "3. Waiting 10 seconds..."
sleep 10

echo ""
echo "4. Checking logs:"
docker logs homebox-test

echo ""
echo "5. Checking if homebox process is running:"
docker exec homebox-test ps aux | grep homebox || echo "Not found"

echo ""
echo "6. Testing HTTP:"
curl -I http://localhost:7745 2>&1 || echo "Failed"

echo ""
echo "7. Cleaning up..."
echo "Run: docker stop homebox-test && docker rm homebox-test && rm -rf $DATA_DIR"

