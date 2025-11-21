# Home Assistant Ingress Support - Implementation Summary

This document describes the changes made to support Home Assistant Supervisor Ingress in the Homebox application.

## Overview

The patch adds runtime detection of the Home Assistant Ingress path (`X-Ingress-Path` header) and ensures all assets, API calls, and routing work correctly when accessed through the ingress proxy at `/api/hassio_ingress/<token>/`.

## Files Modified/Created

### 1. `nuxt.config.ts.patch`
**Location**: `homebox/nuxt.config.ts.patch`

**Changes**:
- Updated to use relative base path (`./`) at build time
- Added `cdnURL` configuration to match `baseURL`
- Updated comments to clarify runtime detection approach

**Key Points**:
- Base path is set to `./` at build time for maximum compatibility
- Actual ingress path is detected at runtime via backend injection and client-side plugins

### 2. `plugins/ingress.client.ts` (NEW)
**Location**: `homebox/plugins/ingress.client.ts`

**Purpose**: Client-side plugin that detects ingress path from meta tag or window variable

**Functionality**:
- Reads ingress path from `<meta name="ingress-path">` tag (injected by backend)
- Falls back to `window.__HASS_INGRESS_PATH__` or `window.__INGRESS_PATH__`
- Normalizes path to always end with `/`
- Stores path in `window.__INGRESS_PATH__` for composable access
- Runs early in client-side lifecycle

### 3. `plugins/ingress.server.ts` (NEW)
**Location**: `homebox/plugins/ingress.server.ts`

**Purpose**: Server-side plugin for development/testing (not used in production SPA)

**Functionality**:
- Reads `X-Ingress-Path` header on server
- Injects meta tag and script into HTML head
- Provides ingress path to app context
- Note: Since Homebox is an SPA (`ssr: false`), this primarily serves as a fallback for development

### 4. `composables/useIngressPath.ts` (NEW)
**Location**: `homebox/composables/useIngressPath.ts`

**Purpose**: Composable for accessing ingress path throughout the application

**Exports**:
- `useIngressPath()`: Returns the ingress path (with trailing slash) or `/` if not in ingress
- `useIngressUrl(path)`: Helper to prepend ingress path to any URL

**Usage Example**:
```typescript
// Get the ingress path
const ingressPath = useIngressPath()
// Returns: "/api/hassio_ingress/abc123/" or "/"

// Build a URL with ingress path
const apiUrl = useIngressUrl('/api/items')
// Returns: "/api/hassio_ingress/abc123/api/items" or "/api/items"
```

### 5. `utils/api.ts` (NEW)
**Location**: `homebox/utils/api.ts`

**Purpose**: Utility functions for API calls with automatic ingress path handling

**Exports**:
- `useApiFetch<T>(url, options)`: Wrapper around `$fetch` that automatically prepends ingress path
- `useApiUrl(endpoint)`: Helper to build API URLs with ingress path

**Usage Example**:
```typescript
// Automatically handles ingress path
const items = await useApiFetch('/api/items')

// Or build URL manually
const url = useApiUrl('/api/items')
const response = await $fetch(url)
```

### 6. `ingress-fix.js` (UPDATED)
**Location**: `homebox/ingress-fix.js`

**Changes**:
- Enhanced to read from multiple sources (meta tag, window variables)
- Improved path normalization
- Better handling of both absolute (`/_nuxt/`) and relative (`./_nuxt/`) asset paths
- More robust mutation observer for dynamically added assets

**Functionality**:
- Fixes asset paths in existing DOM elements
- Watches for dynamically added scripts and stylesheets
- Handles both `/` and `./` prefixed paths

### 7. `backend-patch.go` (UPDATED)
**Location**: `homebox/backend-patch.go`

**Changes**:
- Enhanced `ingressPathMiddleware` to inject ingress path into HTML responses
- Added `htmlResponseWriter` to intercept and modify HTML responses
- Injects `<meta name="ingress-path">` tag and `window.__INGRESS_PATH__` script
- Improved path normalization (ensures trailing slash)

**Key Features**:
- Detects HTML responses and injects ingress path metadata
- Strips ingress path from request URLs before routing
- Handles cookie configuration for cross-origin iframe (SameSite=None; Secure)
- Ensures buffer is flushed after handler completes

### 8. `Dockerfile` (UPDATED)
**Location**: `homebox/Dockerfile`

**Changes**:
- Added COPY commands for plugins, composables, and utils directories
- Ensures all ingress support files are included in the frontend build

## How It Works

### Runtime Flow

1. **Backend Detection**:
   - Home Assistant Supervisor sends requests with `X-Ingress-Path` header
   - Go backend middleware (`ingressPathMiddleware`) reads the header
   - Strips ingress path from request URL before routing
   - For HTML responses, injects meta tag and script with ingress path

2. **Client-Side Detection**:
   - `ingress.client.ts` plugin runs on page load
   - Reads ingress path from meta tag or window variable
   - Stores in `window.__INGRESS_PATH__` for global access

3. **Asset Loading**:
   - `ingress-fix.js` fixes asset paths in DOM
   - Nuxt's relative base path (`./`) ensures assets work with any ingress path
   - MutationObserver watches for dynamically added assets

4. **API Calls**:
   - Use `useIngressUrl()` or `useApiFetch()` to automatically prepend ingress path
   - Or manually use `useIngressPath()` composable

5. **Routing**:
   - Nuxt router uses relative base path
   - Client-side navigation works correctly with ingress path

## Integration Points

### For API Calls

Replace direct `$fetch` calls:
```typescript
// Before
const data = await $fetch('/api/items')

// After
import { useApiFetch } from '~/utils/api'
const data = await useApiFetch('/api/items')
```

Or use the composable:
```typescript
const ingressUrl = useIngressUrl('/api/items')
const data = await $fetch(ingressUrl)
```

### For Navigation

The router automatically handles base paths, but if you need to build URLs manually:
```typescript
const ingressPath = useIngressPath()
const fullUrl = ingressPath + 'some-page'
```

### For Static Assets

Assets are automatically fixed by `ingress-fix.js`. The relative base path (`./`) in `nuxt.config.ts` ensures Vite generates relative asset paths that work with any ingress path.

## Testing

### Direct Access (No Ingress)
- Access at `http://192.168.0.60:7745`
- Should work normally with base path `/`
- All assets load from `/_nuxt/`
- API calls go to `/api/`

### Ingress Access
- Access via `https://ha.domain.com/api/hassio_ingress/abc123/`
- Ingress path detected from `X-Ingress-Path` header
- Assets load from `/api/hassio_ingress/abc123/_nuxt/`
- API calls go to `/api/hassio_ingress/abc123/api/`
- Client-side navigation stays within ingress path

## Validation Checklist

After building and deploying:

- [ ] Initial page loads without 404 errors
- [ ] All CSS files load correctly (check Network tab)
- [ ] All JavaScript files load correctly (check Network tab)
- [ ] Client-side navigation works (click links, use router)
- [ ] API calls succeed (check Network tab for `/api/*` requests)
- [ ] No console errors about blocked MIME types
- [ ] No 404 errors for `/_nuxt/*` assets
- [ ] Works both with and without ingress (backward compatible)

## Technical Notes

1. **SPA Mode**: Since Homebox uses `ssr: false`, the server plugin (`ingress.server.ts`) won't run in production. The backend Go server handles HTML injection instead.

2. **Relative Paths**: Using `./` as base path allows the app to work with any ingress path at runtime without rebuilding.

3. **Backend Injection**: The Go backend injects the ingress path into HTML responses, which is more reliable than trying to detect it purely client-side.

4. **Cookie Handling**: Cookies are automatically configured with `SameSite=None; Secure` when running under ingress (required for cross-origin iframe).

5. **Path Normalization**: All ingress paths are normalized to end with `/` for consistency.

## Troubleshooting

### Assets Not Loading
- Check browser console for 404 errors
- Verify `ingress-fix.js` is loaded (check Network tab)
- Check that `window.__INGRESS_PATH__` is set correctly
- Verify meta tag exists: `document.querySelector('meta[name="ingress-path"]')`

### API Calls Failing
- Check Network tab to see if requests are going to correct path
- Verify you're using `useApiFetch()` or `useIngressUrl()`
- Check backend logs to see if requests are reaching the server
- Verify `X-Ingress-Path` header is being sent by Home Assistant

### Router Navigation Breaking
- Check that router base is set correctly
- Verify relative paths are used (not absolute paths starting with `/`)
- Check browser console for router errors

## Future Improvements

1. **WebSocket Support**: If Homebox uses WebSockets, they may need similar ingress path handling
2. **Service Worker**: PWA service worker may need updates to handle ingress paths in cache strategies
3. **Error Handling**: Add better error handling if ingress path detection fails

