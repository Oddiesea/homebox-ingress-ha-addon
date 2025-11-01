#!/bin/sh
# Patch server.go to add Ingress middleware support

SERVER_FILE="./app/api/server.go"

if [ ! -f "$SERVER_FILE" ]; then
    echo "Error: server.go not found at $SERVER_FILE"
    exit 1
fi

# Check if already patched
if grep -q "ingressPathMiddleware" "$SERVER_FILE"; then
    echo "Server already patched for Ingress"
    exit 0
fi

# Find the function that sets up routes (commonly setupRoutes, registerRoutes, or main setup function)
# Look for common patterns:
# 1. func setupRoutes(e *echo.Echo)
# 2. func registerRoutes(e *echo.Echo) 
# 3. Inside main() where routes are registered

# Strategy: Find where routes start being registered and add middleware before that
# Common patterns: e.GET, e.POST, e.Group, api := e.Group

# Find the first route registration and add middleware before it
if grep -q "e\.GET\|e\.POST\|e\.Group\|api.*:=.*e\.Group" "$SERVER_FILE"; then
    # Add middleware before the first route
    # Look for the pattern and insert before it
    sed -i '0,/\(e\.GET\|e\.POST\|api.*:=.*e\.Group\|e\.Group\)/{
        /\(e\.GET\|e\.POST\|api.*:=.*e\.Group\|e\.Group\)/i\
	// Home Assistant Ingress middleware (patched)\
	e.Use(ingressPathMiddleware)\
	e.Use(cookieMiddleware)
    }' "$SERVER_FILE" 2>/dev/null
    
    # Alternative: If using labstack/echo, look for e.GET or similar and add middleware right before
    if ! grep -q "ingressPathMiddleware" "$SERVER_FILE"; then
        # Try adding after echo.New() or similar initialization
        sed -i '/e := echo\.New()\|echo\.New()\|router.*:=.*echo/a\
	// Home Assistant Ingress middleware (patched)\
	e.Use(ingressPathMiddleware)\
	e.Use(cookieMiddleware)
' "$SERVER_FILE"
    fi
fi

# Verify patch was applied
if grep -q "ingressPathMiddleware" "$SERVER_FILE"; then
    echo "Server successfully patched for Ingress support"
else
    echo "Warning: Could not automatically patch server.go"
    echo "Manual patching may be required. Add these lines after router initialization:"
    echo "  e.Use(ingressPathMiddleware)"
    echo "  e.Use(cookieMiddleware)"
    exit 1
fi

