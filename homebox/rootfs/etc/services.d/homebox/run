#!/usr/bin/with-contenv bashio
# ==============================================================================
# Home Assistant Community Add-on: Homebox
# This runs Homebox using HA Ingress
# ==============================================================================

# Don't exit on error immediately - let bashio handle logging
set +o errexit

declare data_dir

data_dir="/data"

# Create data directory if it doesn't exist
mkdir -p "${data_dir}"

# Set timezone if configured
if bashio::config.has_value 'timezone'; then
    TZ=$(bashio::config 'timezone')
    export TZ
    bashio::log.info "Timezone set to: ${TZ}"
fi

# Verify homebox binary exists and is executable
if [ ! -f /usr/bin/homebox ]; then
    bashio::log.error "Homebox binary not found at /usr/bin/homebox"
    exit 1
fi

if [ ! -x /usr/bin/homebox ]; then
    bashio::log.error "Homebox binary is not executable"
    exit 1
fi

# Start Homebox
bashio::log.info "Starting Homebox with data directory: ${data_dir}"
bashio::log.info "Homebox will listen on port 7745"

# Change to data directory (homebox might expect to run from there)
cd "${data_dir}"

# Run homebox in foreground - use exec to replace shell process
# This ensures the process stays running as the service
exec /usr/bin/homebox \
    --data "${data_dir}" \
    --port 7745 \
    2>&1

