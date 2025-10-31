ARG BUILD_FROM=ghcr.io/hassio-addons/base:14.2.2

# Multi-stage build: Extract binary from official Homebox image
ARG BUILD_ARCH=amd64
ARG HOMEBOX_VERSION=latest

# Map Home Assistant architecture to HomeBox image architecture
# hadolint ignore=DL3006
FROM ghcr.io/sysadminsmedia/homebox:${HOMEBOX_VERSION} AS homebox-source

# Find and prepare binary in source stage
RUN \
    if [ -f /app/api ]; then \
        cp /app/api /tmp/homebox; \
    elif [ -f /homebox ]; then \
        cp /homebox /tmp/homebox; \
    elif [ -f /usr/bin/homebox ]; then \
        cp /usr/bin/homebox /tmp/homebox; \
    else \
        find / -name "*homebox*" -o -name "api" -type f -executable 2>/dev/null | grep -E "(homebox|api)" | head -1 | xargs -I {} cp {} /tmp/homebox || \
        (echo "Could not find homebox binary in image" && exit 1); \
    fi

# Final stage: Use HA base image
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Copy binary from homebox-source stage
COPY --from=homebox-source --chown=root:root /tmp/homebox /usr/bin/homebox

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

