package main

import (
	"bytes"
	_ "embed"
	"io"
	"net/http"
	"strconv"
	"strings"
)

//go:embed ingress-fix.js
var ingressFixJSContent string

func ingressPathMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ingressPath := r.Header.Get("X-Ingress-Path")
		normalizedIngressPath := ""

		if ingressPath != "" {
			normalizedIngressPath = strings.TrimSuffix(ingressPath, "/") + "/"
			ingressPathForStripping := strings.TrimSuffix(ingressPath, "/")
			originalPath := r.URL.Path

			normalizedRequestPath := strings.TrimSuffix(originalPath, "/")
			normalizedIngressPathForComparison := strings.TrimSuffix(ingressPath, "/")

			if normalizedRequestPath == normalizedIngressPathForComparison {
				r.URL.Path = "/"
			} else if strings.HasPrefix(normalizedRequestPath, normalizedIngressPathForComparison+"/") {
				r.URL.Path = strings.TrimPrefix(normalizedRequestPath, normalizedIngressPathForComparison+"/")
				if r.URL.Path == "" {
					r.URL.Path = "/"
				} else if !strings.HasPrefix(r.URL.Path, "/") {
					r.URL.Path = "/" + r.URL.Path
				}
			} else if strings.HasPrefix(originalPath, ingressPathForStripping) {
				r.URL.Path = strings.TrimPrefix(originalPath, ingressPathForStripping)
				if r.URL.Path == "" {
					r.URL.Path = "/"
				} else if !strings.HasPrefix(r.URL.Path, "/") {
					r.URL.Path = "/" + r.URL.Path
				}
			} else if strings.HasPrefix(originalPath, ingressPath) {
				r.URL.Path = strings.TrimPrefix(originalPath, ingressPath)
				if r.URL.Path == "" {
					r.URL.Path = "/"
				} else if !strings.HasPrefix(r.URL.Path, "/") {
					r.URL.Path = "/" + r.URL.Path
				}
			}

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

			r.Header.Set("X-Is-Ingress", "true")
		}

		if normalizedIngressPath != "" && isHTMLRequest(r) {
			htmlRW := &htmlResponseWriter{
				ResponseWriter: w,
				ingressPath:    normalizedIngressPath,
			}
			next.ServeHTTP(htmlRW, r)
			htmlRW.flush()
		} else {
			next.ServeHTTP(w, r)
		}
	})
}

func isHTMLRequest(r *http.Request) bool {
	path := r.URL.Path
	return r.Method == "GET" && (
		path == "/" ||
		path == "/index.html" ||
		strings.HasSuffix(path, ".html") ||
		(!strings.Contains(path, ".") && !strings.HasPrefix(path, "/api") && !strings.HasPrefix(path, "/_nuxt") && !strings.HasPrefix(path, "/swagger")))
}

func cookieMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookieRW := &cookieResponseWriter{
			ResponseWriter: w,
			request:        r,
		}
		next.ServeHTTP(cookieRW, r)
	})
}

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
	return h.buffer.Write(b)
}

func (h *htmlResponseWriter) flush() {
	if h.buffer == nil {
		h.buffer = &bytes.Buffer{}
	}

	body := h.buffer.Bytes()
	bodyModified := false

	if len(body) > 0 && (bytes.Contains(body, []byte("<html")) || bytes.Contains(body, []byte("<!DOCTYPE"))) {
		injection := `<meta name="ingress-path" content="` + h.ingressPath + `"><script>(function(){const p="` + h.ingressPath + `";window.__HASS_INGRESS_PATH__=window.__INGRESS_PATH__=p;if(window.__NUXT__&&window.__NUXT__.config){window.__NUXT__.config.app.baseURL=window.__NUXT__.config.app.cdnURL=p;if(window.__NUXT__.config.router){window.__NUXT__.config.router.base=p;}}})();</script><script>` + ingressFixJSContent + `</script>`

		if bytes.Contains(body, []byte("</head>")) {
			body = bytes.Replace(body, []byte("</head>"), []byte(injection+"</head>"), 1)
			bodyModified = true
		} else if bytes.Contains(body, []byte("<head>")) {
			body = bytes.Replace(body, []byte("<head>"), []byte("<head>"+injection), 1)
			bodyModified = true
		} else if bytes.Contains(body, []byte("</body>")) {
			body = bytes.Replace(body, []byte("</body>"), []byte(injection+"</body>"), 1)
			bodyModified = true
		} else {
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

	if bodyModified && !h.headerWritten {
		h.Header().Set("Content-Length", strconv.Itoa(len(body)))
	}

	if !h.headerWritten {
		if h.statusCode == 0 {
			h.statusCode = http.StatusOK
		}
		h.ResponseWriter.WriteHeader(h.statusCode)
		h.headerWritten = true
	}

	if len(body) > 0 {
		h.ResponseWriter.Write(body)
	}
}

type cookieResponseWriter struct {
	http.ResponseWriter
	request *http.Request
}

func (c *cookieResponseWriter) WriteHeader(code int) {
	if c.request.Header.Get("X-Is-Ingress") == "true" || c.request.Header.Get("X-Ingress-Path") != "" {
		cookies := c.Header().Values("Set-Cookie")
		if len(cookies) > 0 {
			c.Header().Del("Set-Cookie")
			for _, cookie := range cookies {
				cookieStr := cookie
				if !strings.Contains(cookieStr, "SameSite=") {
					if strings.Contains(cookieStr, ";") {
						cookieStr = strings.TrimSuffix(cookieStr, ";") + "; SameSite=None; Secure"
					} else {
						cookieStr = cookieStr + "; SameSite=None; Secure"
					}
				} else {
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

func (h *htmlResponseWriter) Flush() {
	if h.buffer != nil && h.buffer.Len() > 0 {
		h.flush()
	}
	if flusher, ok := h.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (h *htmlResponseWriter) Close() error {
	if h.buffer != nil && h.buffer.Len() > 0 {
		h.flush()
	}
	if closer, ok := h.ResponseWriter.(io.Closer); ok {
		return closer.Close()
	}
	return nil
}

