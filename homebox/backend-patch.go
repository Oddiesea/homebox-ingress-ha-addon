// Patch for Home Assistant Ingress support
// This middleware strips the Ingress path from requests and configures cookies

package api

import (
	"net/http"
	"strings"
)

// ingressPathMiddleware strips the X-Ingress-Path header from requests
// and adjusts the request URL path accordingly
func ingressPathMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Read the Ingress path from header (Home Assistant sets this)
		ingressPath := r.Header.Get("X-Ingress-Path")
		if ingressPath != "" {
			// Remove trailing slash for consistent handling
			ingressPath = strings.TrimSuffix(ingressPath, "/")
			
			// If the request path starts with the ingress path, strip it
			if strings.HasPrefix(r.URL.Path, ingressPath) {
				r.URL.Path = strings.TrimPrefix(r.URL.Path, ingressPath)
				if r.URL.Path == "" {
					r.URL.Path = "/"
				}
				// Also update RawPath if set
				if r.URL.RawPath != "" && strings.HasPrefix(r.URL.RawPath, ingressPath) {
					r.URL.RawPath = strings.TrimPrefix(r.URL.RawPath, ingressPath)
					if r.URL.RawPath == "" {
						r.URL.RawPath = "/"
					}
				}
			}
		}
		
		// Configure cookies for Ingress (cross-origin)
		// Home Assistant Ingress runs in an iframe, so cookies need SameSite=None; Secure
		if ingressPath != "" {
			// Set a header that cookie-setting code can check
			r.Header.Set("X-Is-Ingress", "true")
		}
		
		next.ServeHTTP(w, r)
	})
}

// cookieMiddleware sets cookie attributes for Ingress
func cookieMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Wrap the ResponseWriter to intercept Set-Cookie headers
		cookieRW := &cookieResponseWriter{
			ResponseWriter: w,
			request:        r,
		}
		next.ServeHTTP(cookieRW, r)
	})
}

type cookieResponseWriter struct {
	http.ResponseWriter
	request *http.Request
}

func (c *cookieResponseWriter) WriteHeader(code int) {
	// Check if this is an Ingress request
	if c.request.Header.Get("X-Is-Ingress") == "true" || c.request.Header.Get("X-Ingress-Path") != "" {
		// Modify Set-Cookie headers
		cookies := c.Header().Values("Set-Cookie")
		if len(cookies) > 0 {
			c.Header().Del("Set-Cookie")
			for _, cookie := range cookies {
				// Ensure SameSite=None and Secure are set
				cookieStr := cookie
				if !strings.Contains(cookieStr, "SameSite=") {
					if strings.Contains(cookieStr, ";") {
						cookieStr = strings.TrimSuffix(cookieStr, ";") + "; SameSite=None; Secure"
					} else {
						cookieStr = cookieStr + "; SameSite=None; Secure"
					}
				} else {
					// Replace existing SameSite value
					cookieStr = strings.ReplaceAll(cookieStr, "SameSite=Lax", "SameSite=None")
					cookieStr = strings.ReplaceAll(cookieStr, "SameSite=Strict", "SameSite=None")
					if !strings.Contains(cookieStr, "Secure") {
						cookieStr = cookieStr + "; Secure"
					}
				}
				c.Header().Add("Set-Cookie", cookieStr)
			}
		}
	}
	c.ResponseWriter.WriteHeader(code)
}

