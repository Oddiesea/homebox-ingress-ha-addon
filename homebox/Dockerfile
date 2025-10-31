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
RUN \
    cat > /tmp/nuxt.config.ts << 'ENDOFFILE'
import { defineNuxtConfig } from "nuxt/config";

// Get base path from environment variable (for Home Assistant Ingress)
const basePath = process.env.BASE_PATH || process.env.NUXT_BASE_URL || '/';

// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  ssr: false,

  // Set router base for ingress support
  app: {
    baseURL: basePath,
    head: {
      script: [{ src: "/set-theme.js" }],
    },
  },

  router: {
    base: basePath,
  },

  components: {
    dirs: [],
  },

  build: {
    transpile: ["vue-i18n"],
  },

  modules: [
    "@nuxtjs/tailwindcss",
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "@vite-pwa/nuxt",
    "unplugin-icons/nuxt",
    "shadcn-nuxt",
    "@nuxt/eslint",
  ],

  eslint: {
    config: {},
  },

  nitro: {
    devProxy: {
      "/api": {
        target: "http://localhost:7745/api",
        ws: true,
        changeOrigin: true,
      },
    },
  },

  css: ["@/assets/css/main.css"],

  pwa: {
    workbox: {
      navigateFallbackDenylist: [/^\/api/],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: /^\/api/,
          handler: "NetworkFirst",
          method: "GET",
          options: {
            cacheName: "api-cache",
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxAgeSeconds: 60 * 60 * 24 },
          },
        },
      ],
    },
    registerType: "autoUpdate",
    injectRegister: "script",
    injectManifest: {
      swSrc: "sw.js",
    },
    devOptions: {
      enabled: false,
    },
    manifest: {
      name: "Homebox",
      short_name: "Homebox",
      description: "Home Inventory App",
      theme_color: "#5b7f67",
      start_url: basePath + "/home",
      icons: [
        {
          src: "pwa-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
  },
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  compatibilityDate: "2024-11-29",
});
ENDOFFILE

# Build frontend dependencies
FROM public.ecr.aws/docker/library/node:lts-alpine AS frontend-deps
WORKDIR /app
RUN npm install -g pnpm
COPY --from=git-clone /tmp/homebox/frontend/package.json /tmp/homebox/frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build frontend with patched config
FROM public.ecr.aws/docker/library/node:lts-alpine AS frontend-builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=git-clone /tmp/homebox/frontend ./
COPY --from=nuxt-config-patch /tmp/nuxt.config.ts ./nuxt.config.ts
COPY --from=frontend-deps /app/node_modules ./node_modules
# Note: We build with BASE_PATH set to allow the config to read it
# The base path will be determined at runtime by Home Assistant Ingress
# For now, build with empty base path and we'll handle routing in the Go backend
ENV BASE_PATH="/"
ENV NUXT_BASE_URL="/"
RUN pnpm build

# Go dependencies stage
FROM public.ecr.aws/docker/library/golang:alpine AS builder-dependencies
WORKDIR /go/src/app
COPY --from=git-clone /tmp/homebox/backend/go.mod /tmp/homebox/backend/go.sum ./
RUN go mod download

# Build API stage
FROM public.ecr.aws/docker/library/golang:alpine AS builder
ARG BUILD_ARCH

# Map Home Assistant architecture to Go architecture
RUN \
    if [ "${BUILD_ARCH}" = "amd64" ]; then export GOARCH="amd64"; \
    elif [ "${BUILD_ARCH}" = "aarch64" ]; then export GOARCH="arm64"; \
    else export GOARCH="amd64"; fi && \
    echo "Building for GOARCH=${GOARCH}"

ENV GOOS=linux
ENV CGO_ENABLED=0

RUN apk update && \
    apk upgrade && \
    apk add --no-cache git build-base gcc g++ && \
    if [ "${GOARCH}" != "arm" ] && [ "${GOARCH}" != "riscv64" ]; then apk --no-cache add libwebp libavif libheif libjxl; fi

WORKDIR /go/src/app

# Copy Go modules and source code
COPY --from=builder-dependencies /go/pkg/mod /go/pkg/mod
COPY --from=git-clone /tmp/homebox/backend ./

# Clear old public files and copy new ones from frontend build
RUN rm -rf ./app/api/public ./app/api/static/public
COPY --from=frontend-builder /app/.output/public ./app/api/static/public

# Build Go binary
RUN --mount=type=cache,target=/root/.cache/go-build \
    if [ "${GOARCH}" = "arm" ] || [ "${GOARCH}" = "riscv64" ]; then \
        go build \
            -ldflags "-s -w" \
            -tags nodynamic \
            -o /go/bin/api \
            -v ./app/api/*.go; \
    else \
        go build \
            -ldflags "-s -w" \
            -o /go/bin/api \
            -v ./app/api/*.go; \
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
