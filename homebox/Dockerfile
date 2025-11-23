ARG BUILD_FROM=ghcr.io/hassio-addons/base:14.2.2
ARG BUILD_ARCH=amd64
ARG HOMEBOX_VERSION=latest

# ==============================================================================
# Stage 1: Build Homebox from source with base path support
# ==============================================================================

# Clone Homebox repo
FROM alpine/git:latest AS git-clone
WORKDIR /tmp
ARG HOMEBOX_VERSION
RUN \
    if [ "${HOMEBOX_VERSION}" = "latest" ]; then \
        git clone --depth 1 https://github.com/sysadminsmedia/homebox.git /tmp/homebox; \
    else \
        git clone https://github.com/sysadminsmedia/homebox.git /tmp/homebox && \
        cd /tmp/homebox && git checkout ${HOMEBOX_VERSION}; \
    fi

# Create patched nuxt.config.ts file
FROM alpine:latest AS nuxt-config-patch
COPY --from=git-clone /tmp/homebox/frontend/nuxt.config.ts /tmp/nuxt.config.ts.orig
# Copy our patched nuxt.config.ts file
COPY nuxt.config.ts.patch /tmp/nuxt.config.ts

# Build frontend dependencies
FROM public.ecr.aws/docker/library/node:lts-alpine AS frontend-deps
WORKDIR /app
RUN npm install -g pnpm
COPY --from=git-clone /tmp/homebox/frontend/package.json /tmp/homebox/frontend/pnpm-lock.yaml ./
# Install dependencies with cache mount for better caching
# Cache mount persists node_modules between builds when package files don't change
RUN pnpm install --frozen-lockfile --prefer-offline

# Build frontend with patched config
FROM public.ecr.aws/docker/library/node:lts-alpine AS frontend-builder
WORKDIR /app
RUN npm install -g pnpm
# Copy node_modules FIRST - this layer will be cached unless package files change
# This maximizes cache hits when only source code changes
COPY --from=frontend-deps /app/node_modules ./node_modules
# Copy frontend source files (this invalidates cache on source changes, which is expected)
COPY --from=git-clone /tmp/homebox/frontend ./
# Overwrite with our patched nuxt.config.ts that supports base paths
COPY --from=nuxt-config-patch /tmp/nuxt.config.ts ./nuxt.config.ts
# Copy ingress-fix.js to public directory (will be included in build output)
COPY ingress-fix.js ./public/ingress-fix.js
# Copy ingress detection plugins, composables, and utilities
# COPY will automatically invalidate cache when these files change
COPY plugins/ ./plugins/
COPY composables/ ./composables/
COPY utils/ ./utils/
# Build with relative base path "./" so assets work with any Ingress path
# This allows the app to work regardless of the exact Ingress path at runtime
ENV BASE_PATH="./"
ENV NUXT_BASE_URL="./"
# Prepare Nuxt (generates .nuxt directory and tsconfig)
# Then build the frontend
# Optimize for QEMU emulation: reduce parallel workers and increase memory limits
RUN \
    export NODE_OPTIONS="--max-old-space-size=4096" && \
    export NITRO_PRESET=node && \
    pnpm exec nuxt prepare && \
    NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# Go dependencies stage
FROM public.ecr.aws/docker/library/golang:alpine AS builder-dependencies
WORKDIR /go/src/app
COPY --from=git-clone /tmp/homebox/backend/go.mod /tmp/homebox/backend/go.sum ./
# Download Go modules - cache mount removed temporarily due to build issues
# The layer will still be cached by Docker when go.mod/go.sum don't change
RUN go mod download

# Build API stage
FROM public.ecr.aws/docker/library/golang:alpine AS builder
ARG BUILD_ARCH

# Map Home Assistant architecture to Go architecture
ENV GOOS=linux
ENV CGO_ENABLED=0
# Set GOARCH based on BUILD_ARCH and save to file for later use
RUN \
    if [ "${BUILD_ARCH}" = "amd64" ]; then \
        echo "amd64" > /tmp/goarch.txt; \
    elif [ "${BUILD_ARCH}" = "aarch64" ]; then \
        echo "arm64" > /tmp/goarch.txt; \
    else \
        echo "amd64" > /tmp/goarch.txt; \
    fi

# Install build dependencies - cache this layer separately from GOARCH detection
# This allows the apk update/upgrade to be cached independently
RUN apk update && \
    apk upgrade && \
    apk add --no-cache git build-base gcc g++
RUN GOARCH_VALUE=$(cat /tmp/goarch.txt) && \
    if [ "${GOARCH_VALUE}" != "arm" ] && [ "${GOARCH_VALUE}" != "riscv64" ]; then \
        apk --no-cache add libwebp libavif libheif libjxl; \
    fi

WORKDIR /go/src/app

# Copy Go modules and source code
COPY --from=builder-dependencies /go/pkg/mod /go/pkg/mod
COPY --from=git-clone /tmp/homebox/backend ./
# Copy backend patch files for Ingress support
COPY backend-patch.go ./app/api/ingress_patch.go
# Copy ingress-fix.js to same directory for Go embed directive
COPY ingress-fix.js ./app/api/ingress-fix.js
COPY patch-server.sh ./patch-server.sh
# Apply the patch to server.go to use the middleware
RUN chmod +x ./patch-server.sh && \
    if ! ./patch-server.sh; then \
        echo "Warning: Auto-patch may have failed. Attempting to verify server.go structure..." && \
        echo "Checking server.go location..." && \
        ls -la ./app/api/ 2>&1 || true && \
        echo "If API requests fail, check server.go structure and apply middleware manually" && \
        echo "Build will continue, but middleware may not be active"; \
    fi

# Clear old public files and copy new ones from frontend build
RUN rm -rf ./app/api/public ./app/api/static/public
COPY --from=frontend-builder /app/.output/public ./app/api/static/public
# ingress-fix.js should already be in the frontend build output from public/ directory

# Build Go binary
# Note: GOARCH is set as ENV above, read it dynamically
RUN GOARCH_VALUE=$(cat /tmp/goarch.txt) && \
    echo "Building for GOARCH=${GOARCH_VALUE}" && \
    if [ "${GOARCH_VALUE}" = "arm" ] || [ "${GOARCH_VALUE}" = "riscv64" ]; then \
        echo "Building with nodynamic tag" && \
        CGO_ENABLED=0 GOOS=linux GOARCH=${GOARCH_VALUE} go build \
            -ldflags "-s -w" \
            -tags nodynamic \
            -o /go/bin/api \
            -v ./app/api/*.go 2>&1 || (echo "Build failed, showing errors:" && go build -v ./app/api/*.go 2>&1 && exit 1); \
    else \
        echo "Building without nodynamic tag" && \
        CGO_ENABLED=0 GOOS=linux GOARCH=${GOARCH_VALUE} go build \
            -ldflags "-s -w" \
            -o /go/bin/api \
            -v ./app/api/*.go 2>&1 || (echo "Build failed, showing errors:" && go build -v ./app/api/*.go 2>&1 && exit 1); \
    fi

# ==============================================================================
# Final stage: Use HA base image
# ==============================================================================
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Copy binary from builder stage
COPY --from=builder --chown=root:root /go/bin/api /usr/bin/homebox

# Ensure binary is executable
RUN chmod +x /usr/bin/homebox

# Install runtime dependencies
# hadolint ignore=DL3003
RUN \
    apk add --no-cache \
        ca-certificates \
        tzdata

# Copy root filesystem
COPY rootfs /

# Ensure service scripts are executable
RUN chmod +x /etc/services.d/homebox/run 2>/dev/null || true
RUN chmod +x /etc/services.d/homebox/finish 2>/dev/null || true
RUN chmod +x /run.sh 2>/dev/null || true

# Build arguments
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION

# Labels
LABEL \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}" \
    org.opencontainers.image.title="${BUILD_NAME}" \
    org.opencontainers.image.description="${BUILD_DESCRIPTION}" \
    org.opencontainers.image.vendor="Home Assistant Community Add-ons" \
    org.opencontainers.image.authors="Oddiesea" \
    org.opencontainers.image.licenses="AGPL-3.0" \
    org.opencontainers.image.url="https://addons.community" \
    org.opencontainers.image.source="https://github.com/${BUILD_REPOSITORY}" \
    org.opencontainers.image.documentation="https://github.com/${BUILD_REPOSITORY}/blob/main/README.md" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.revision="${BUILD_REF}" \
    org.opencontainers.image.version="${BUILD_VERSION}"
