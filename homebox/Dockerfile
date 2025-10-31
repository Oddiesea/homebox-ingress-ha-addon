ARG BUILD_FROM=ghcr.io/hassio-addons/base:14.2.2
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Setup base
ARG BUILD_ARCH=amd64

# hadolint ignore=DL3003
RUN \
    apk add --no-cache --virtual .build-dependencies \
        git \
        go \
        nodejs \
        npm \
    \
    && apk add --no-cache \
        ca-certificates \
        tzdata \
    \
    && mkdir -p /build \
    && cd /build \
    && git clone --depth 1 https://github.com/sysadminsmedia/homebox.git . \
    && cd frontend \
    && npm ci \
    && npm run build \
    && cd ../backend

# Build Homebox
ARG BUILD_ARCH
# hadolint ignore=DL3003
RUN \
    cd /build/backend \
    && GOARCH_VAL=$( \
        if [ "${BUILD_ARCH}" = "aarch64" ]; then echo "arm64"; \
        elif [ "${BUILD_ARCH}" = "amd64" ]; then echo "amd64"; \
        elif [ "${BUILD_ARCH}" = "armhf" ] || [ "${BUILD_ARCH}" = "armv7" ]; then echo "arm"; \
        elif [ "${BUILD_ARCH}" = "i386" ]; then echo "386"; \
        else echo "${BUILD_ARCH}"; \
        fi) \
    && go mod download \
    && CGO_ENABLED=0 GOOS=linux GOARCH="${GOARCH_VAL}" \
        go build \
            -ldflags="-s -w -X 'github.com/sysadminsmedia/homebox/backend/internal/config.buildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)' -X 'github.com/sysadminsmedia/homebox/backend/internal/config.gitCommit=$(git rev-parse --short HEAD)'" \
            -o /usr/bin/homebox \
            ./cmd/homebox

# Cleanup
# hadolint ignore=DL3003
RUN \
    apk del --no-cache --purge .build-dependencies \
    && rm -rf /build \
    && rm -rf /root/.cache \
    && rm -rf /root/.go

# Copy root filesystem
COPY rootfs /

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

