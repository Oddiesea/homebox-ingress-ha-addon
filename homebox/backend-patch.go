// Patch for Home Assistant Ingress support
// This middleware strips the Ingress path from requests and configures cookies

package main

import (
	"bytes"
	"io"
	"net/http"
	"strconv"
	"strings"
)

// ingressPathMiddleware strips the X-Ingress-Path header from requests
// and adjusts the request URL path accordingly
// Also injects ingress path into HTML responses for client-side detection
func ingressPathMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Read the Ingress path from header (Home Assistant sets this)
		ingressPath := r.Header.Get("X-Ingress-Path")
		normalizedIngressPath := ""
		
		// Always call next handler - don't block any requests
		// If ingress path is present, we'll handle it, otherwise pass through
		if ingressPath != "" {
			// Normalize: ensure it ends with / (for injection into HTML)
			normalizedIngressPath = strings.TrimSuffix(ingressPath, "/") + "/"
			
			// Remove trailing slash for path stripping (we'll try both with and without)
			ingressPathForStripping := strings.TrimSuffix(ingressPath, "/")
			
			// ALWAYS strip the ingress path from the request URL when X-Ingress-Path header is present
			// The ingress proxy sends requests with the full ingress path in the URL
			// We need to strip it so the backend routes correctly
			originalPath := r.URL.Path
			
			// Normalize both paths for comparison (remove trailing slashes)
			normalizedRequestPath := strings.TrimSuffix(originalPath, "/")
			normalizedIngressPathForComparison := strings.TrimSuffix(ingressPath, "/")
			
			// Check if the request path starts with the ingress path
			if normalizedRequestPath == normalizedIngressPathForComparison {
				// Exact match - request is for the ingress root
				r.URL.Path = "/"
			} else if strings.HasPrefix(normalizedRequestPath, normalizedIngressPathForComparison+"/") {
				// Request path starts with ingress path followed by /
				// Strip the ingress path and the following /
				r.URL.Path = strings.TrimPrefix(normalizedRequestPath, normalizedIngressPathForComparison+"/")
				if r.URL.Path == "" {
					r.URL.Path = "/"
				} else if !strings.HasPrefix(r.URL.Path, "/") {
					// Ensure it starts with /
					r.URL.Path = "/" + r.URL.Path
				}
			} else if strings.HasPrefix(originalPath, ingressPathForStripping) {
				// Fallback: try direct prefix match
				r.URL.Path = strings.TrimPrefix(originalPath, ingressPathForStripping)
				if r.URL.Path == "" {
					r.URL.Path = "/"
				} else if !strings.HasPrefix(r.URL.Path, "/") {
					r.URL.Path = "/" + r.URL.Path
				}
			} else if strings.HasPrefix(originalPath, ingressPath) {
				// Fallback: try with trailing slash from header
				r.URL.Path = strings.TrimPrefix(originalPath, ingressPath)
				if r.URL.Path == "" {
					r.URL.Path = "/"
				} else if !strings.HasPrefix(r.URL.Path, "/") {
					r.URL.Path = "/" + r.URL.Path
				}
			}
			
			// Also update RawPath if set (for encoded paths)
			if r.URL.RawPath != "" {
				originalRawPath := r.URL.RawPath
				if strings.HasPrefix(originalRawPath, ingressPathForStripping+"/") {
					r.URL.RawPath = strings.TrimPrefix(originalRawPath, ingressPathForStripping+"/")
					if r.URL.RawPath == "" {
						r.URL.RawPath = "/"
					}
				} else if strings.HasPrefix(originalRawPath, ingressPathForStripping) {
					r.URL.RawPath = strings.TrimPrefix(originalRawPath, ingressPathForStripping)
					if r.URL.RawPath == "" {
						r.URL.RawPath = "/"
					}
				} else if strings.HasPrefix(originalRawPath, ingressPath) {
					r.URL.RawPath = strings.TrimPrefix(originalRawPath, ingressPath)
					if r.URL.RawPath == "" {
						r.URL.RawPath = "/"
					}
				}
			}
			
			// Set a header that cookie-setting code can check
			r.Header.Set("X-Is-Ingress", "true")
		}
		
		// If this is an HTML response and we have an ingress path, inject it
		if normalizedIngressPath != "" && isHTMLRequest(r) {
			// Wrap the response writer to intercept HTML content
			htmlRW := &htmlResponseWriter{
				ResponseWriter: w,
				ingressPath:    normalizedIngressPath,
			}
			next.ServeHTTP(htmlRW, r)
			// Always flush buffer after handler completes
			// This ensures headers are written and any buffered content is sent
			htmlRW.flush()
		} else {
			// For non-HTML requests or requests without ingress, pass through directly
			next.ServeHTTP(w, r)
		}
	})
}

// isHTMLRequest checks if the request is likely for an HTML page
func isHTMLRequest(r *http.Request) bool {
	// Check if it's a GET request for the root or HTML file
	path := r.URL.Path
	// Accept requests that are likely HTML pages (root, index, or paths without extensions that aren't API or asset paths)
	return r.Method == "GET" && (
		path == "/" ||
		path == "/index.html" ||
		strings.HasSuffix(path, ".html") ||
		(!strings.Contains(path, ".") && !strings.HasPrefix(path, "/api") && !strings.HasPrefix(path, "/_nuxt") && !strings.HasPrefix(path, "/swagger")))
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

// htmlResponseWriter intercepts HTML responses and injects ingress path
type htmlResponseWriter struct {
	http.ResponseWriter
	ingressPath string
	buffer      *bytes.Buffer
	statusCode  int
	headerWritten bool
}

func (h *htmlResponseWriter) WriteHeader(code int) {
	if h.headerWritten {
		return
	}
	h.statusCode = code
	h.headerWritten = true
	// Initialize buffer if not already done
	if h.buffer == nil {
		h.buffer = &bytes.Buffer{}
	}
	// Don't write headers to underlying writer yet - wait until flush()
	// This allows us to modify Content-Length if needed
}

func (h *htmlResponseWriter) Write(b []byte) (int, error) {
	if h.buffer == nil {
		h.buffer = &bytes.Buffer{}
	}
	// Don't auto-write headers here - let the handler do it
	// This prevents issues with Content-Length being set incorrectly
	return h.buffer.Write(b)
}

func (h *htmlResponseWriter) flush() {
	// Initialize buffer if it doesn't exist (shouldn't happen, but be safe)
	if h.buffer == nil {
		h.buffer = &bytes.Buffer{}
	}
	
	body := h.buffer.Bytes()
	bodyModified := false
	
	// Check if this is HTML content and modify if needed
	if len(body) > 0 && (bytes.Contains(body, []byte("<html")) || bytes.Contains(body, []byte("<!DOCTYPE"))) {
		// Inject meta tag and script into <head>
		injection := `<meta name="ingress-path" content="` + h.ingressPath + `"><script>window.__HASS_INGRESS_PATH__=window.__INGRESS_PATH__="` + h.ingressPath + `";</script>`
		
		// Try to inject before </head> (preferred location)
		if bytes.Contains(body, []byte("</head>")) {
			body = bytes.Replace(body, []byte("</head>"), []byte(injection+"</head>"), 1)
			bodyModified = true
		} else if bytes.Contains(body, []byte("<head>")) {
			// If no closing tag, inject after opening head tag
			body = bytes.Replace(body, []byte("<head>"), []byte("<head>"+injection), 1)
			bodyModified = true
		} else if bytes.Contains(body, []byte("</body>")) {
			// Fallback: inject before </body>
			body = bytes.Replace(body, []byte("</body>"), []byte(injection+"</body>"), 1)
			bodyModified = true
		} else {
			// Last resort: inject after <html> tag
			if bytes.Contains(body, []byte("<html")) {
				htmlIndex := bytes.Index(body, []byte("<html"))
				htmlEnd := bytes.Index(body[htmlIndex:], []byte(">"))
				if htmlEnd > 0 {
					insertPos := htmlIndex + htmlEnd + 1
					newBody := make([]byte, 0, len(body)+len(injection))
					newBody = append(newBody, body[:insertPos]...)
					newBody = append(newBody, []byte(injection)...)
					newBody = append(newBody, body[insertPos:]...)
					body = newBody
					bodyModified = true
				}
			}
		}
	}
	
	// Set Content-Length before writing headers (if body was modified)
	if bodyModified && !h.headerWritten {
		h.Header().Set("Content-Length", strconv.Itoa(len(body)))
	}
	
	// Write headers if not already written
	if !h.headerWritten {
		if h.statusCode == 0 {
			h.statusCode = http.StatusOK
		}
		h.ResponseWriter.WriteHeader(h.statusCode)
		h.headerWritten = true
	}
	
	// Write the (possibly modified) body
	if len(body) > 0 {
		h.ResponseWriter.Write(body)
	}
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

// Flush method for htmlResponseWriter to implement http.Flusher
func (h *htmlResponseWriter) Flush() {
	if h.buffer != nil && h.buffer.Len() > 0 {
		h.flush()
	}
	if flusher, ok := h.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Close method to ensure buffer is flushed
func (h *htmlResponseWriter) Close() error {
	if h.buffer != nil && h.buffer.Len() > 0 {
		h.flush()
	}
	if closer, ok := h.ResponseWriter.(io.Closer); ok {
		return closer.Close()
	}
	return nil
}

