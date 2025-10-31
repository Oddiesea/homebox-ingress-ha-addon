ARG BUILD_FROM=ghcr.io/hassio-addons/base:14.2.2
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Setup base
ARG BUILD_ARCH=amd64
ARG HOMEBOX_VERSION=0.21.0

# Download and install Homebox binary
# hadolint ignore=DL3003
RUN \
    apk add --no-cache \
        ca-certificates \
        curl \
        tzdata \
    \
    && ARCH_VAL=$( \
        if [ "${BUILD_ARCH}" = "aarch64" ]; then echo "arm64"; \
        elif [ "${BUILD_ARCH}" = "amd64" ]; then echo "amd64"; \
        elif [ "${BUILD_ARCH}" = "armhf" ] || [ "${BUILD_ARCH}" = "armv7" ]; then echo "armv7"; \
        else echo "${BUILD_ARCH}"; \
        fi) \
    \
    && curl -f -L -o /tmp/homebox.tar.gz \
        "https://github.com/sysadminsmedia/homebox/releases/download/v${HOMEBOX_VERSION}/homebox_${HOMEBOX_VERSION}_linux_${ARCH_VAL}.tar.gz" \
    \
    && tar -xzf /tmp/homebox.tar.gz -C /tmp \
    \
    && mv /tmp/homebox /usr/bin/homebox \
    \
    && chmod +x /usr/bin/homebox \
    \
    && rm -rf /tmp/homebox.tar.gz /tmp/homebox_*

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

