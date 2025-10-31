#!/usr/bin/with-contenv bashio
# ==============================================================================
# Home Assistant Community Add-on: Homebox
# This runs Homebox
# ==============================================================================

declare data_dir

data_dir="/data"

# Create data directory if it doesn't exist
if [ ! -d "${data_dir}" ]; then
    mkdir -p "${data_dir}" || bashio::exit.nok "Could not create data directory: ${data_dir}"
fi

# Set timezone if configured
if bashio::config.has_value 'timezone'; then
    TZ=$(bashio::config 'timezone')
    export TZ
    bashio::log.info "Timezone set to: ${TZ}"
fi

# Start Homebox
bashio::log.info "Starting Homebox..."
exec /usr/bin/homebox \
    --data "${data_dir}" \
    --port 7745

