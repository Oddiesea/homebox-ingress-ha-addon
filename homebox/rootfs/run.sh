#!/usr/bin/with-contenv bashio
# ==============================================================================
# Legacy run script - This addon uses modern s6 services
# This script is kept for legacy-services compatibility only
# ==============================================================================

# Do nothing - the actual service runs via /etc/services.d/homebox/run
bashio::log.info "Using modern s6 service for homebox"
exit 0

