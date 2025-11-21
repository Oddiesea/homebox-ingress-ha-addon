# Home Assistant Ingress Support

This document describes the complete implementation required to support Home Assistant Supervisor Ingress in the Homebox application.

## Overview

Home Assistant Supervisor Ingress provides secure access to add-ons through a reverse proxy at paths like `/api/hassio_ingress/<token>/`. This implementation adds runtime detection of the ingress path and ensures all assets, API calls, and routing work correctly when accessed through ingress.

## Requirements

### 1. Runtime Ingress Path Detection
- Detect `X-Ingress-Path` header sent by Home Assistant Supervisor
- Store ingress path prefix for use throughout the application
- Default to `/` when not running under ingress

### 2. Frontend Support (Nuxt 3)
- Configure Nuxt base URL dynamically
- Detect ingress path on client-side
- Fix asset paths (CSS, JS, images)
- Handle API calls with ingress prefix
- Support client-side routing with ingress base path

### 3. Backend Support (Go/Chi Router)
- Strip ingress path from incoming request URLs
- Inject ingress path into HTML responses for client detection
- Configure cookies for cross-origin iframe (SameSite=None; Secure)
- Handle both API and static file requests correctly

## Implementation Files

### Frontend Files

#### `nuxt.config.ts.patch`
**Purpose**: Configure Nuxt to use relative base paths that work with any ingress path

**Key Changes**:
- Set `baseURL` and `cdnURL` to `./` (relative path)
- Configure Vite base path to `./`
- Router base set to `./` for SPA mode
- Includes `ingress-fix.js` script in head

**Why**: Relative paths allow the app to work with any ingress path at runtime without rebuilding.

#### `plugins/ingress.client.ts`
**Purpose**: Client-side plugin to detect and store ingress path

**Functionality**:
- Reads ingress path from `<meta name="ingress-path">` tag (injected by backend)
- Falls back to `window.__HASS_INGRESS_PATH__` or `window.__INGRESS_PATH__`
- Normalizes path to always end with `/`
- Stores in `window.__INGRESS_PATH__` for global access
- Runs early in client-side lifecycle

#### `plugins/ingress.server.ts`
**Purpose**: Server-side plugin for development/testing (not used in production SPA)

**Note**: Since Homebox uses `ssr: false`, this primarily serves as a fallback. The backend Go server handles HTML injection in production.

#### `composables/useIngressPath.ts`
**Purpose**: Composable for accessing ingress path throughout the application

**Exports**:
- `useIngressPath()`: Returns the ingress path (with trailing slash) or `/` if not in ingress
- `useIngressUrl(path)`: Helper to prepend ingress path to any URL

**Usage**:
```typescript
const ingressPath = useIngressPath()
// Returns: "/api/hassio_ingress/abc123/" or "/"

const apiUrl = useIngressUrl('/api/items')
// Returns: "/api/hassio_ingress/abc123/api/items" or "/api/items"
```

#### `utils/api.ts`
**Purpose**: Utility functions for API calls with automatic ingress path handling

**Exports**:
- `useApiFetch<T>(url, options)`: Wrapper around `$fetch` that automatically prepends ingress path
- `useApiUrl(endpoint)`: Helper to build API URLs with ingress path

**Usage**:
```typescript
import { useApiFetch } from '~/utils/api'
const items = await useApiFetch('/api/items')
```

#### `ingress-fix.js`
**Purpose**: Fixes asset paths in the DOM for ingress compatibility

**Functionality**:
- Reads ingress path from multiple sources (meta tag, window variables)
- Fixes existing script and link tags with `/_nuxt/` paths
- Watches for dynamically added assets using MutationObserver
- Handles both absolute (`/_nuxt/`) and relative (`./_nuxt/`) paths

### Backend Files

#### `backend-patch.go`
**Purpose**: Go middleware for ingress path handling and HTML injection

**Key Components**:

1. **`ingressPathMiddleware`**:
   - Reads `X-Ingress-Path` header from Home Assistant
   - Strips ingress path from request URL before routing
   - Wraps HTML responses to inject ingress path metadata
   - Sets `X-Is-Ingress` header for cookie middleware

2. **`cookieMiddleware`**:
   - Intercepts Set-Cookie headers
   - Modifies cookies to use `SameSite=None; Secure` when in ingress mode
   - Required for cross-origin iframe (Home Assistant runs add-ons in iframes)

3. **`htmlResponseWriter`**:
   - Buffers HTML responses
   - Injects `<meta name="ingress-path">` tag into `<head>`
   - Injects `window.__INGRESS_PATH__` script for client-side access
   - Handles various HTML structures (with/without head tags)

**Package**: `package main` (must match `main.go`)

#### `patch-server.sh`
**Purpose**: Automatically injects middleware into Homebox's main.go

**Functionality**:
- Finds `router := chi.NewMux()` in `main.go`
- Adds `router.Use(ingressPathMiddleware)` and `router.Use(cookieMiddleware)`
- Inserts middleware after router creation, before existing middleware

**Important Notes**:
- Homebox uses **chi router** (not Echo)
- Main file is `main.go` (not `server.go`)
- Package is `main` (not `api`)

### Build Files

#### `Dockerfile`
**Changes Required**:
- Copy `plugins/`, `composables/`, and `utils/` directories to frontend build
- Copy `backend-patch.go` as `ingress_patch.go` to backend
- Copy `patch-server.sh` and execute it during build
- Ensure all ingress support files are included

## How It Works

### Runtime Flow

1. **Request Arrives**:
   - Home Assistant Supervisor sends request with `X-Ingress-Path` header
   - Example: `X-Ingress-Path: /api/hassio_ingress/abc123`

2. **Backend Processing**:
   - `ingressPathMiddleware` reads the header
   - Strips `/api/hassio_ingress/abc123` from request URL
   - Routes request to Homebox as if it came directly
   - For HTML responses, injects ingress path metadata

3. **HTML Injection**:
   - Backend injects into HTML `<head>`:
     ```html
     <meta name="ingress-path" content="/api/hassio_ingress/abc123/">
     <script>window.__INGRESS_PATH__="/api/hassio_ingress/abc123/";</script>
     ```

4. **Client-Side Detection**:
   - `ingress.client.ts` plugin reads meta tag or window variable
   - Stores path in `window.__INGRESS_PATH__`
   - Makes path available via `useIngressPath()` composable

5. **Asset Loading**:
   - `ingress-fix.js` fixes asset paths in DOM
   - Nuxt's relative base path (`./`) ensures assets work with any ingress path
   - MutationObserver watches for dynamically added assets

6. **API Calls**:
   - Use `useApiFetch()` or `useIngressUrl()` to prepend ingress path
   - Requests go to `/api/hassio_ingress/abc123/api/items` instead of `/api/items`
   - Backend strips the ingress prefix before routing

7. **Routing**:
   - Nuxt router uses relative base path
   - Client-side navigation works correctly with ingress path

## Build Process

### During Docker Build

1. **Frontend Build**:
   - Copy patched `nuxt.config.ts` with relative base path
   - Copy plugins, composables, and utils
   - Build Nuxt app with `BASE_PATH="./"`
   - Assets generated with relative paths

2. **Backend Build**:
   - Copy `backend-patch.go` as `ingress_patch.go`
   - Run `patch-server.sh` to inject middleware into `main.go`
   - Compile Go binary with ingress middleware included

3. **Verification**:
   - Patch script should output: "Server successfully patched for Ingress support"
   - Go build should complete without errors
   - Final Docker image includes all ingress support

### Build Verification

Check build logs for:
```
Server successfully patched for Ingress support
Building for GOARCH=arm64 (or amd64)
```

## Testing

### Direct Access (No Ingress)
- Access at `http://localhost:7745` or `http://<ip>:7745`
- Should work normally with base path `/`
- All assets load from `/_nuxt/`
- API calls go to `/api/`

### Ingress Access
- Access via `https://ha.domain.com/api/hassio_ingress/<token>/`
- Ingress path detected from `X-Ingress-Path` header
- Assets load from `/api/hassio_ingress/<token>/_nuxt/`
- API calls go to `/api/hassio_ingress/<token>/api/`
- Client-side navigation stays within ingress path

### Validation Checklist

After building and deploying:

- [ ] Initial page loads without 404 errors
- [ ] All CSS files load correctly (check Network tab)
- [ ] All JavaScript files load correctly (check Network tab)
- [ ] Client-side navigation works (click links, use router)
- [ ] API calls succeed (check Network tab for `/api/*` requests)
- [ ] No console errors about blocked MIME types
- [ ] No 404 errors for `/_nuxt/*` assets
- [ ] Works both with and without ingress (backward compatible)
- [ ] Cookies work correctly (check Application tab)

## Troubleshooting

### Build Issues

**Patch Script Fails**:
- Verify `main.go` exists at `backend/app/api/main.go`
- Check that Homebox uses chi router (not Echo)
- Ensure patch script has execute permissions
- Build will continue but middleware won't be active

**Go Build Fails**:
- Check that `backend-patch.go` uses `package main`
- Verify middleware functions are being used (patch script succeeded)
- Check build logs for actual Go error messages

### Runtime Issues

**Assets Not Loading**:
- Check browser console for 404 errors
- Verify `ingress-fix.js` is loaded (check Network tab)
- Check that `window.__INGRESS_PATH__` is set correctly
- Verify meta tag exists: `document.querySelector('meta[name="ingress-path"]')`

**API Calls Failing**:
- Check Network tab to see if requests are going to correct path
- Verify you're using `useApiFetch()` or `useIngressUrl()`
- Check backend logs to see if requests are reaching the server
- Verify `X-Ingress-Path` header is being sent by Home Assistant

**Router Navigation Breaking**:
- Check that router base is set correctly
- Verify relative paths are used (not absolute paths starting with `/`)
- Check browser console for router errors

**Cookies Not Working**:
- Verify `cookieMiddleware` is active
- Check that cookies have `SameSite=None; Secure` attributes
- Ensure Home Assistant is using HTTPS (required for Secure cookies)

## Technical Details

### Home Assistant Ingress Headers

Home Assistant Supervisor passes these headers:
- `X-Ingress-Path`: The full ingress path (e.g., `/api/hassio_ingress/abc123`)
- `X-Forwarded-For`: Client IP
- `X-Forwarded-Proto`: Protocol (http/https)
- `X-Forwarded-Host`: Original host

### Router Compatibility

**Important**: Homebox uses `github.com/go-chi/chi/v5` router, not Echo.

The middleware uses standard `http.Handler` interface, which is compatible with chi router:
```go
func ingressPathMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // ... middleware logic
        next.ServeHTTP(w, r)
    })
}
```

### Path Normalization

All ingress paths are normalized to end with `/` for consistency:
- Input: `/api/hassio_ingress/abc123`
- Normalized: `/api/hassio_ingress/abc123/`

### Cookie Configuration

When running under ingress (detected via `X-Ingress-Path` header), cookies are automatically configured:
- `SameSite=None`: Required for cross-origin iframe
- `Secure`: Required when SameSite=None is used
- Applied to all Set-Cookie headers automatically

## File Structure

```
homebox/
├── Dockerfile                    # Updated to copy ingress files
├── nuxt.config.ts.patch          # Patched Nuxt config with relative paths
├── ingress-fix.js               # Client-side asset path fixer
├── backend-patch.go             # Go middleware for ingress
├── patch-server.sh              # Script to inject middleware into main.go
├── plugins/
│   ├── ingress.client.ts        # Client-side ingress detection
│   └── ingress.server.ts        # Server-side plugin (dev only)
├── composables/
│   └── useIngressPath.ts        # Composable for ingress path access
└── utils/
    └── api.ts                   # API utilities with ingress support
```

## Summary

This implementation provides complete Home Assistant Ingress support by:

1. **Detecting** ingress path at runtime from `X-Ingress-Path` header
2. **Stripping** ingress path from backend requests before routing
3. **Injecting** ingress path into HTML for client-side detection
4. **Fixing** asset paths dynamically on the client
5. **Handling** API calls with automatic ingress path prefixing
6. **Configuring** cookies for cross-origin iframe compatibility

All changes are backward compatible - the application works normally when accessed directly (without ingress) and automatically adapts when accessed through Home Assistant Ingress.

