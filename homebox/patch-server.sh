#!/bin/sh
# Patch main.go to add Ingress middleware support for chi router

SERVER_FILE="./app/api/main.go"

if [ ! -f "$SERVER_FILE" ]; then
    echo "Error: main.go not found at $SERVER_FILE"
    exit 1
fi

# Check if already patched
if grep -q "ingressPathMiddleware" "$SERVER_FILE"; then
    echo "Server already patched for Ingress"
    exit 0
fi

# Homebox uses chi router, not Echo
# Pattern: router := chi.NewMux()
# We need to add middleware after router creation but before router.Use(...)

# Find router := chi.NewMux() and add middleware right after it
if grep -q "router := chi.NewMux()" "$SERVER_FILE"; then
    # Add middleware after router creation, before router.Use
    # Use a more specific pattern to insert after the router line but before router.Use
    sed -i '/router := chi\.NewMux()/a\
\
	// Home Assistant Ingress middleware (patched)\
	router.Use(ingressPathMiddleware)\
	router.Use(cookieMiddleware)
' "$SERVER_FILE"
    
    # Verify it was added
    if grep -q "ingressPathMiddleware" "$SERVER_FILE"; then
        echo "Server successfully patched for Ingress support"
        exit 0
    fi
fi
    
# Alternative: Try to find router.Use( and add before the first middleware
    if ! grep -q "ingressPathMiddleware" "$SERVER_FILE"; then
    if grep -q "router\.Use(" "$SERVER_FILE"; then
        # Insert before the first router.Use(
        sed -i '0,/router\.Use(/{
            /router\.Use(/i\
	// Home Assistant Ingress middleware (patched)\
	router.Use(ingressPathMiddleware)\
	router.Use(cookieMiddleware)
        }' "$SERVER_FILE"
    fi
fi

# Verify patch was applied
if grep -q "ingressPathMiddleware" "$SERVER_FILE"; then
    echo "Server successfully patched for Ingress support"
    exit 0
else
    echo "Warning: Could not automatically patch main.go"
    echo "Manual patching may be required. Add these lines after 'router := chi.NewMux()':"
    echo "  router.Use(ingressPathMiddleware)"
    echo "  router.Use(cookieMiddleware)"
    exit 1
fi

