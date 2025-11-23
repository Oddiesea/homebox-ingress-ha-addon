// Home Assistant Ingress path fix
// Uses window.__INGRESS_PATH__ or window.__HASS_INGRESS_PATH__ to fix static resource paths
(function() {
  'use strict';


  // Get ingress path from multiple sources (in order of preference)
  const getIngressPath = function() {
    // 1. Check new window variable (set by plugin)
    if (window.__INGRESS_PATH__) {
      return window.__INGRESS_PATH__;
    }

    // 2. Check meta tag (injected by server)
    const metaTag = document.querySelector('meta[name="ingress-path"]');
    if (metaTag) {
      const path = metaTag.getAttribute('content');
      if (path) {
        const normalized = path.endsWith('/') ? path : path + '/';
        window.__INGRESS_PATH__ = normalized;
        return normalized;
      }
    }

    // 3. Check legacy window variable
    if (window.__HASS_INGRESS_PATH__) {
      const normalized = window.__HASS_INGRESS_PATH__.endsWith('/')
        ? window.__HASS_INGRESS_PATH__
        : window.__HASS_INGRESS_PATH__ + '/';
      window.__INGRESS_PATH__ = normalized;
      return normalized;
    }

    return '';
  };

  const ingressPath = getIngressPath();

  if (!ingressPath || ingressPath === '/') {
    return; // Not in Ingress mode or already at root
  }

  window.__ORIGINAL_PATHNAME__ = window.location.pathname;

  // Fix asset paths using ingress path
  function fixPaths() {
    // Fix existing script and link tags with absolute paths
    const selectors = [
      'script[src^="/_nuxt/"]',
      'link[href^="/_nuxt/"]',
      'script[src^="./_nuxt/"]',
      'link[href^="./_nuxt/"]'
    ];

    selectors.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(el) {
        const attr = el.tagName === 'SCRIPT' ? 'src' : 'href';
        const path = el.getAttribute(attr);
        if (path) {
          // Handle both absolute and relative paths
          let newPath = path;
          if (path.startsWith('/_nuxt/')) {
            newPath = ingressPath + path.slice(1); // Remove leading /
          } else if (path.startsWith('./_nuxt/')) {
            newPath = ingressPath + path.slice(2); // Remove ./
          }

          if (newPath !== path) {
            el.setAttribute(attr, newPath);
          }
        }
      });
    });
  }

  // Run immediately and on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixPaths);
  } else {
    fixPaths();
  }

  // Watch for dynamically added scripts/links
  new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) { // Element node
          if (node.nodeName === 'SCRIPT' && node.src) {
            if (node.src.includes('/_nuxt/') || node.src.includes('./_nuxt/')) {
              let newSrc = node.src;
              if (node.src.startsWith('/_nuxt/')) {
                newSrc = ingressPath + node.src.slice(1);
              } else if (node.src.includes('./_nuxt/')) {
                const relativePath = node.src.split('./_nuxt/')[1];
                newSrc = ingressPath + '_nuxt/' + relativePath;
              }
              node.src = newSrc;
            }
          }
          if (node.nodeName === 'LINK' && node.href) {
            if (node.href.includes('/_nuxt/') || node.href.includes('./_nuxt/')) {
              let newHref = node.href;
              if (node.href.startsWith('/_nuxt/')) {
                newHref = ingressPath + node.href.slice(1);
              } else if (node.href.includes('./_nuxt/')) {
                const relativePath = node.href.split('./_nuxt/')[1];
                newHref = ingressPath + '_nuxt/' + relativePath;
              }
              node.href = newHref;
            }
          }
        }
      });
    });
  }).observe(document.head, { childList: true, subtree: true });

  // Helper function to fix URLs for fetch/XHR requests
  function fixRequestUrl(url) {
    if (!url || typeof url !== 'string') {
      return url;
    }

    // Get current ingress path (may have been updated)
    const currentIngressPath = getIngressPath();
    if (!currentIngressPath || currentIngressPath === '/') {
      return url; // Not in ingress mode
    }

    // Skip URLs that already have the ingress path (prevent double-prefixing)
    if (url.startsWith(currentIngressPath)) {
      return url;
    }

    // Handle relative _nuxt paths before parsing (catches "./_nuxt/..." patterns)
    if (url.startsWith('./_nuxt/') || url.startsWith('_nuxt/')) {
      const pathToFix = url.startsWith('./') ? url.slice(2) : url;
      return currentIngressPath + pathToFix;
    }

    // Parse full URLs (http://, https://)
    let urlObj;
    let isFullUrl = false;
    let origin = '';
    let pathname = url;

    try {
      // Check if it's a full URL
      // Match http, https, ws, wss protocols
      if (url.match(/^(https?|wss?):\/\//)) {
        urlObj = new URL(url, window.location.href);
        origin = urlObj.origin;
        pathname = urlObj.pathname;
        isFullUrl = true;
        const protocol = urlObj.protocol;

        // Compare hostname and port instead of full origin (to handle ws:// vs https://)
        const urlHost = urlObj.hostname + (urlObj.port ? ':' + urlObj.port : '');
        const locationHost = window.location.hostname + (window.location.port ? ':' + window.location.port : '');
        
        if (urlHost === locationHost) {
          // Handle WebSocket URLs (ws://, wss://)
          if ((protocol === 'ws:' || protocol === 'wss:') && pathname.startsWith('/api/') && !pathname.startsWith('/api/hassio_ingress/') && !pathname.startsWith(currentIngressPath)) {
            const fixedPath = currentIngressPath + pathname.slice(1); // Remove leading /
            // Convert ws to wss if current page is https, or keep original protocol
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Extract hostname and port from origin (origin is like "https://example.com" or "https://example.com:443")
            const host = urlObj.host; // This includes hostname:port
            const fixedUrl = wsProtocol + '//' + host + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
            return fixedUrl;
          }
          
          // Same origin - intercept ALL /api/ paths and route through ingress
          // This includes /api/v1/ because Homebox might use it for its own API
          if (pathname.startsWith('/api/') && !pathname.startsWith('/api/hassio_ingress/') && !pathname.startsWith(currentIngressPath)) {
            const fixedPath = currentIngressPath + pathname.slice(1); // Remove leading /
            const fixedUrl = origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
            return fixedUrl;
          }
        } else {
          // Different origin - skip (truly external URLs)
          return url;
        }

        // Handle _nuxt paths in full URLs
        if (pathname.startsWith('/_nuxt/') && !pathname.startsWith(currentIngressPath)) {
          const fixedPath = currentIngressPath + pathname.slice(1);
          return origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
        }
      } else {
        // For relative URLs, resolve them relative to the ORIGINAL pathname (before we stripped it)
        // This ensures relative paths like "./_nuxt/..." resolve correctly with the ingress path
        try {
          // Use the original pathname (stored before we stripped it) for resolution
          const baseUrl = window.location.origin + (window.__ORIGINAL_PATHNAME__ || window.location.pathname);
          const resolvedUrl = new URL(url, baseUrl);
          if (resolvedUrl.origin === window.location.origin) {
            pathname = resolvedUrl.pathname;
            // If the resolved pathname doesn't have the ingress path, we need to add it
            if (pathname.startsWith('/_nuxt/') && !pathname.startsWith(currentIngressPath)) {
              return currentIngressPath + pathname.slice(1);
            }
          }
        } catch (e) {
          console.error('[Ingress Fix] Failed to resolve relative URL:', url, e);
        }
      }
    } catch (e) {
      console.error('[Ingress Fix] Failed to parse URL:', url, e);
    }

    // Skip URLs that already have the ingress path
    if (pathname.startsWith(currentIngressPath)) {
      return url;
    }

    // Handle absolute paths starting with /_nuxt/ (for non-full URLs that weren't caught earlier)
    if (pathname.startsWith('/_nuxt/')) {
      const fixedPath = currentIngressPath + pathname.slice(1);
      if (isFullUrl && urlObj) {
        return origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
      }
      return fixedPath;
    }

    // Handle Homebox API calls starting with /api/ (including /api/v1/ for Homebox API)
    // All /api/ paths should go through ingress when in ingress mode
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/hassio_ingress/')) {
      const fixedPath = currentIngressPath + pathname.slice(1); // Remove leading /
      if (isFullUrl) {
        return origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
      }
      return fixedPath;
    }

    // Handle manifest and other root-level files that need ingress path
    if ((pathname === '/manifest.webmanifest' || pathname === '/home' || pathname.startsWith('/home/')) && !pathname.startsWith(currentIngressPath)) {
      const fixedPath = currentIngressPath + pathname.slice(1); // Remove leading /
      if (isFullUrl) {
        return origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
      }
      return fixedPath;
    }

    // Fallback for relative paths with _nuxt that weren't caught earlier
    if (!isFullUrl && !url.match(/^(https?:)?\/\//) && url.includes('_nuxt/')) {
      try {
        const baseUrl = window.location.origin + (window.__ORIGINAL_PATHNAME__ || window.location.pathname);
        const resolved = new URL(url, baseUrl);
        if (resolved.pathname.startsWith('/_nuxt/') && !resolved.pathname.startsWith(currentIngressPath)) {
          return currentIngressPath + resolved.pathname.slice(1);
        }
      } catch (e) {
        console.error('[Ingress Fix] Failed to resolve relative URL:', url, e);
        // Direct fix as last resort
        let pathToFix = url;
        if (pathToFix.startsWith('./')) {
          pathToFix = pathToFix.slice(2);
        } else if (pathToFix.startsWith('/')) {
          pathToFix = pathToFix.slice(1);
        }
        return currentIngressPath + pathToFix;
      }
    }

    return url;
  }

  // Intercept fetch API requests - must happen before Nuxt initializes
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    // Get URL string from input (handle all possible input types)
    let urlStr = '';
    const isRequest = input instanceof Request;
    const hasInit = !!init;
    const hasInitBody = !!(init && init.body);
    
    if (typeof input === 'string') {
      urlStr = input;
    } else if (isRequest) {
      urlStr = input.url;
    } else if (input && typeof input === 'object' && 'url' in input) {
      urlStr = input.url;
    } else if (input && typeof input === 'object' && 'href' in input) {
      urlStr = input.href;
    }

    // Fix the URL
    if (urlStr) {
      const fixedUrl = fixRequestUrl(urlStr);
      if (fixedUrl !== urlStr) {

        // Handle string URL
        if (typeof input === 'string') {
          return originalFetch.call(this, fixedUrl, init);
        }

        if (isRequest) {
          // Request constructor properly clones the Request including body
          // If init is provided, it will be merged correctly by fetch
          try {
            const newRequest = new Request(fixedUrl, input);
            return originalFetch.call(this, newRequest, init);
          } catch (e) {
            console.error('[Ingress Fix] Error creating Request:', e, {
              url: fixedUrl,
              originalUrl: urlStr,
              method: input.method,
            });
            throw e;
          }
        }

        if (input && typeof input === 'object' && 'url' in input) {
          return originalFetch.call(this, new Request(fixedUrl, input), init);
        }
      }
    }

    // Pass through unchanged
    return originalFetch.call(this, input, init);
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return originalOpen.call(this, method, fixRequestUrl(url), ...rest);
  };

  // Intercept WebSocket connections
  const originalWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    let urlStr;
    if (typeof url === 'string') {
      urlStr = url;
    } else if (url instanceof URL) {
      urlStr = url.href;
    } else {
      urlStr = String(url);
    }
    
    const fixedUrl = fixRequestUrl(urlStr);
    return new originalWebSocket(fixedUrl, protocols);
  };
  // Copy static properties from original WebSocket
  Object.setPrototypeOf(window.WebSocket, originalWebSocket);
  Object.setPrototypeOf(window.WebSocket.prototype, originalWebSocket.prototype);

  // Fetch, XHR, and WebSocket interception enabled
})();

