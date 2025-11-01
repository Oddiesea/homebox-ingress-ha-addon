#!/bin/bash
# Test script that simulates Home Assistant Ingress base path
# This tests if relative paths work when served from a subdirectory

set -e

cd "$(dirname "$0")/homebox"

# Clean up any existing containers
docker stop homebox-backend nginx-proxy 2>/dev/null || true
docker rm homebox-backend nginx-proxy 2>/dev/null || true

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

# Simulate Ingress path (like Home Assistant uses)
INGRESS_PATH="/api/hassio_ingress/test"

echo "============================================"
echo "Testing Homebox with Ingress base path"
echo "Architecture: $BUILD_ARCH"
echo "Ingress path: $INGRESS_PATH"
echo "============================================"
echo ""

# Build to builder stage
echo "Building Homebox..."
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
  . > /dev/null 2>&1

echo "Extracting binary and static files..."
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract binary and static files
docker create --name temp-builder homebox-builder:test
docker cp temp-builder:/go/bin/api "$TEMP_DIR/homebox"
docker cp temp-builder:/go/src/app/app/api/static/public "$TEMP_DIR/public"
docker rm temp-builder

chmod +x "$TEMP_DIR/homebox"

echo "Creating nginx config to simulate Ingress..."
# Create nginx config that proxies to Homebox with base path
cat > "$TEMP_DIR/nginx.conf" << EOF
events {
    worker_connections 1024;
}

http {
    resolver 127.0.0.11 valid=30s;
    
    server {
        listen 8080;
        server_name localhost;
        
        # Serve static files from the base path
        location ${INGRESS_PATH}/ {
            alias /usr/share/nginx/html/;
            try_files \$uri \$uri/ ${INGRESS_PATH}/index.html;
            index index.html;
        }

        # Serve static assets (_nuxt files) from the base path
        location ~ ^${INGRESS_PATH}/_nuxt/ {
            alias /usr/share/nginx/html/_nuxt/;
            try_files \$uri =404;
        }

        # Proxy API requests to Homebox backend (strip the ingress path)
        location ${INGRESS_PATH}/api {
            set \$backend http://host.docker.internal:7746;
            proxy_pass \$backend/api;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
    }
}
EOF

echo "Creating simple container for Homebox backend..."
cat > "$TEMP_DIR/Dockerfile.backend" << 'EOF'
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
COPY homebox /usr/bin/homebox
RUN chmod +x /usr/bin/homebox
WORKDIR /data
EXPOSE 7745
CMD ["/usr/bin/homebox", "--web-host", "0.0.0.0", "--web-port", "7745", "--mode", "production"]
EOF

docker build -f "$TEMP_DIR/Dockerfile.backend" -t homebox-backend:test "$TEMP_DIR"

echo "Starting Homebox backend..."
DATA_DIR=$(mktemp -d)
docker run -d \
  --name homebox-backend \
  -v "$DATA_DIR:/data" \
  -p 7746:7745 \
  --add-host=host.docker.internal:host-gateway \
  homebox-backend:test

# Wait for backend to start
echo "Waiting for backend to start..."
sleep 5

# Check if backend is running
if ! curl -s http://localhost:7746 > /dev/null 2>&1; then
    echo "ERROR: Backend not responding on port 7746"
    docker logs homebox-backend
    exit 1
fi

echo "Starting nginx proxy with Ingress path..."
docker run -d \
  --name nginx-proxy \
  -v "$TEMP_DIR/public:/usr/share/nginx/html:ro" \
  -v "$TEMP_DIR/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -p 8080:8080 \
  --add-host=host.docker.internal:host-gateway \
  nginx:alpine

sleep 2

echo ""
echo "============================================"
echo "Test Setup Complete!"
echo "============================================"
echo ""
echo "Backend (direct): http://localhost:7746"
echo "Frontend (via Ingress path): http://localhost:8080${INGRESS_PATH}"
echo ""
echo "Open http://localhost:8080${INGRESS_PATH} in your browser"
echo "Check the browser console for /_nuxt/ errors"
echo ""
echo "If relative paths work, you should see NO 404 errors for /_nuxt/ files"
echo ""
echo "To check backend logs: docker logs homebox-backend"
echo "To check nginx logs: docker logs nginx-proxy"
echo ""
echo "To stop:"
echo "  docker stop homebox-backend nginx-proxy"
echo "  docker rm homebox-backend nginx-proxy"
