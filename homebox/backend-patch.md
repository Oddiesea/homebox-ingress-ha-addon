# Go Backend Patches Needed for Home Assistant Ingress

Based on the checklist provided:

## 1. Strip Ingress Path from API Requests
- Issue: API 404 inside HA but works outside
- Fix: Strip ingress path in Go backend
- Location: Need to patch server.go to read `X-Ingress-Path` header and strip it from API routes

## 2. Cookie Configuration
- Issue: Cookies lost
- Fix: SameSite=None + Secure
- Location: Need to configure cookie settings in the Go backend

## Implementation Plan:

1. Patch `backend/app/api/server.go`:
   - Add middleware to read `X-Ingress-Path` header
   - Strip base path from incoming requests before routing
   - Configure cookies with `SameSite=None; Secure`

2. This will require:
   - Finding where routes are registered
   - Adding middleware before routes
   - Configuring cookie settings

