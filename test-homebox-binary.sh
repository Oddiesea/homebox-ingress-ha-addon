#!/bin/bash
# Simple test script to build and test just the Homebox binary
# This extracts and tests the binary without the full HA addon environment

set -e

cd "$(dirname "$0")/homebox"

# Auto-detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)
    BUILD_ARCH="amd64"
    ;;
  arm64|aarch64)
    BUILD_ARCH="aarch64"
    ;;
  *)
    echo "Unknown architecture: $ARCH, defaulting to amd64"
    BUILD_ARCH="amd64"
    ;;
esac

echo "============================================"
echo "Building Homebox binary (fast local build)"
echo "Architecture: $BUILD_ARCH"
echo "============================================"
echo ""

# Build just up to the builder stage to get the binary
docker build \
  --target builder \
  --build-arg BUILD_ARCH=$BUILD_ARCH \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --build-arg BUILD_DESCRIPTION="Homebox - Inventory and organization system" \
  --build-arg BUILD_NAME=Homebox \
  --build-arg BUILD_REF=local-test \
  --build-arg BUILD_REPOSITORY=Oddiesea/homebox-ingress-ha-addon \
  --build-arg BUILD_VERSION=test \
  --tag homebox-builder:test \
  --progress=plain \
  .

echo ""
echo "============================================"
echo "Extracting binary and testing..."
echo "============================================"

# Create temp directory
TEMP_DIR=$(mktemp -d)
echo "Temp directory: $TEMP_DIR"

# Extract the binary from the builder image
docker create --name temp-builder homebox-builder:test
docker cp temp-builder:/go/bin/api "$TEMP_DIR/homebox"
docker rm temp-builder

echo "Binary extracted to: $TEMP_DIR/homebox"
chmod +x "$TEMP_DIR/homebox"

# Test the binary
echo ""
echo "Testing binary version:"
"$TEMP_DIR/homebox" --version || echo "Version check failed"

echo ""
echo "============================================"
echo "Testing with a simple container..."
echo "============================================"

# Create a simple Alpine container with just the binary
cat > "$TEMP_DIR/Dockerfile.simple" << 'EOF'
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
COPY homebox /usr/bin/homebox
RUN chmod +x /usr/bin/homebox
WORKDIR /data
EXPOSE 7745
CMD ["/usr/bin/homebox", "--web-host", "0.0.0.0", "--web-port", "7745", "--mode", "production"]
EOF

# Build simple test image
docker build -f "$TEMP_DIR/Dockerfile.simple" -t homebox-simple:test "$TEMP_DIR"

echo ""
echo "Starting simple test container..."
DATA_DIR=$(mktemp -d)
CONTAINER_ID=$(docker run -d \
  --name homebox-simple-test \
  -v "$DATA_DIR:/data" \
  -p 7745:7745 \
  homebox-simple:test)

echo "Container started: $CONTAINER_ID"
echo "Waiting 5 seconds for startup..."
sleep 5

echo ""
echo "Container logs:"
docker logs $CONTAINER_ID | tail -20

echo ""
echo "Testing HTTP connection..."
curl -s http://localhost:7745 | head -20 || echo "HTTP connection failed"

echo ""
echo "============================================"
echo "Test complete!"
echo "============================================"
echo ""
echo "Container ID: $CONTAINER_ID"
echo "Access URL: http://localhost:7745"
echo "Data directory: $DATA_DIR"
echo ""
echo "To view logs: docker logs -f homebox-simple-test"
echo "To stop: docker stop homebox-simple-test && docker rm homebox-simple-test"
echo "To shell in: docker exec -it homebox-simple-test /bin/sh"
echo ""
echo "Note: This tests the binary outside of HA addon environment."
echo "For full Ingress testing, you'll need to test in Home Assistant."

