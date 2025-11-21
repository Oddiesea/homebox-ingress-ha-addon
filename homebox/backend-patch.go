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
		
		if ingressPath != "" {
			// Normalize: ensure it ends with /
			normalizedIngressPath = strings.TrimSuffix(ingressPath, "/") + "/"
			
			// Remove trailing slash for path stripping
			ingressPathForStripping := strings.TrimSuffix(ingressPath, "/")
			
			// If the request path starts with the ingress path, strip it
			if strings.HasPrefix(r.URL.Path, ingressPathForStripping) {
				r.URL.Path = strings.TrimPrefix(r.URL.Path, ingressPathForStripping)
				if r.URL.Path == "" {
					r.URL.Path = "/"
				}
				// Also update RawPath if set
				if r.URL.RawPath != "" && strings.HasPrefix(r.URL.RawPath, ingressPathForStripping) {
					r.URL.RawPath = strings.TrimPrefix(r.URL.RawPath, ingressPathForStripping)
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
			// Ensure buffer is flushed after handler completes
			if htmlRW.buffer != nil && htmlRW.buffer.Len() > 0 {
				htmlRW.flush()
			}
		} else {
			next.ServeHTTP(w, r)
		}
	})
}

// isHTMLRequest checks if the request is likely for an HTML page
func isHTMLRequest(r *http.Request) bool {
	// Check if it's a GET request for the root or HTML file
	path := r.URL.Path
	return r.Method == "GET" && (
		path == "/" ||
		path == "/index.html" ||
		strings.HasSuffix(path, ".html") ||
		(!strings.Contains(path, ".") && !strings.HasPrefix(path, "/api") && !strings.HasPrefix(path, "/_nuxt")))
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
	if h.buffer == nil {
		h.buffer = &bytes.Buffer{}
	}
}

func (h *htmlResponseWriter) Write(b []byte) (int, error) {
	if h.buffer == nil {
		h.buffer = &bytes.Buffer{}
	}
	if !h.headerWritten {
		h.WriteHeader(http.StatusOK)
	}
	return h.buffer.Write(b)
}

func (h *htmlResponseWriter) flush() {
	if h.buffer == nil || h.buffer.Len() == 0 {
		return
	}
	
	body := h.buffer.Bytes()
	
	// Check if this is HTML content
	if bytes.Contains(body, []byte("<html")) || bytes.Contains(body, []byte("<!DOCTYPE")) {
		// Inject meta tag and script into <head>
		injection := `<meta name="ingress-path" content="` + h.ingressPath + `"><script>window.__HASS_INGRESS_PATH__=window.__INGRESS_PATH__="` + h.ingressPath + `";</script>`
		
		// Try to inject before </head> (preferred location)
		if bytes.Contains(body, []byte("</head>")) {
			body = bytes.Replace(body, []byte("</head>"), []byte(injection+"</head>"), 1)
		} else if bytes.Contains(body, []byte("<head>")) {
			// If no closing tag, inject after opening head tag
			body = bytes.Replace(body, []byte("<head>"), []byte("<head>"+injection), 1)
		} else if bytes.Contains(body, []byte("</body>")) {
			// Fallback: inject before </body>
			body = bytes.Replace(body, []byte("</body>"), []byte(injection+"</body>"), 1)
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
				}
			}
		}
		
		// Update content length
		h.Header().Set("Content-Length", strconv.Itoa(len(body)))
	}
	
	// Write status code (only if not already written)
	if !h.headerWritten {
		if h.statusCode == 0 {
			h.statusCode = http.StatusOK
		}
		h.ResponseWriter.WriteHeader(h.statusCode)
		h.headerWritten = true
	}
	
	// Write the modified body
	h.ResponseWriter.Write(body)
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

