export default defineNuxtPlugin({
  name: 'ingress-client',
  enforce: 'pre',
  setup() {
    const metaTag = document.querySelector('meta[name="ingress-path"]');
    const ingressPath = metaTag?.getAttribute('content') || '';
    const windowIngressPath = (window as any).__HASS_INGRESS_PATH__ || (window as any).__INGRESS_PATH__ || '';
    const finalIngressPath = ingressPath || windowIngressPath;

      let normalizedPath = '/';
      if (finalIngressPath) {
        normalizedPath = finalIngressPath.endsWith('/') ? finalIngressPath : finalIngressPath + '/';
        (window as any).__INGRESS_PATH__ = normalizedPath;
        (window as any).__HASS_INGRESS_PATH__ = normalizedPath;
      
      // Store original pathname before any modifications
      (window as any).__ORIGINAL_PATHNAME__ = window.location.pathname;
      
      // Update Nuxt config if available
      try {
        const nuxtApp = useNuxtApp();
        if (nuxtApp?.$config?.app) {
          nuxtApp.$config.app.baseURL = normalizedPath;
          nuxtApp.$config.app.cdnURL = normalizedPath;
        }
      } catch (e) {
        // Nuxt app might not be ready yet
      }

      try {
        const runtimeConfig = useRuntimeConfig();
        if (runtimeConfig?.public) {
          (runtimeConfig.public as any).baseURL = normalizedPath;
        }
      } catch (e) {
        // Runtime config might not be ready yet
      }

      // Set router base before Nuxt routes
      // Use a try-catch with retry logic since router might not be ready immediately
      const setRouterBase = () => {
        try {
          const router = useRouter();
          if (router?.options) {
            router.options.base = normalizedPath;
            return true;
          }
        } catch (e) {
          console.error('[Ingress Plugin] Failed to set router base:', e);
          return false;
        }
        return false;
      };
      
      // Try to set immediately
      if (!setRouterBase()) {
        console.log('[Ingress Plugin] Router not ready, retrying...');
        // If router not ready, try again on next tick
        setTimeout(() => {
          setRouterBase();
        }, 0);
      }
      
      const fixRequestUrl = (url: string): string => {
        if (!url || typeof url !== 'string') {
          return url;
        }

        if (url.startsWith(normalizedPath)) {
          return url;
        }

        if (url.startsWith('./_nuxt/') || url.startsWith('_nuxt/')) {
          const pathToFix = url.startsWith('./') ? url.slice(2) : url;
          return normalizedPath + pathToFix;
        }

        let urlObj: URL | null = null;
        let isFullUrl = false;
        let origin = '';
        let pathname = url;

        try {
          // Match http, https, ws, wss protocols
          if (url.match(/^(https?|wss?):\/\//)) {
            urlObj = new URL(url);
            origin = urlObj.origin;
            pathname = urlObj.pathname;
            isFullUrl = true;
            const protocol = urlObj.protocol;

            // Compare hostname and port instead of full origin (to handle ws:// vs https://)
            const urlHost = urlObj.hostname + (urlObj.port ? ':' + urlObj.port : '');
            const locationHost = window.location.hostname + (window.location.port ? ':' + window.location.port : '');
            
            if (urlHost === locationHost) {
              // Handle WebSocket URLs (ws://, wss://)
              if ((protocol === 'ws:' || protocol === 'wss:') && pathname.startsWith('/api/') && !pathname.startsWith('/api/hassio_ingress/') && !pathname.startsWith(normalizedPath)) {
                const fixedPath = normalizedPath + pathname.slice(1);
                // Convert ws to wss if current page is https, or keep original protocol
                const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                // Extract hostname and port from origin (origin is like "https://example.com" or "https://example.com:443")
                const host = urlObj.host; // This includes hostname:port
                return wsProtocol + '//' + host + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
              }
              
              // Handle HTTP/HTTPS API URLs
              if (pathname.startsWith('/api/') && !pathname.startsWith('/api/hassio_ingress/') && !pathname.startsWith(normalizedPath)) {
                const fixedPath = normalizedPath + pathname.slice(1);
                return origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
              }
            } else {
              return url;
            }

            if (pathname.startsWith('/_nuxt/') && !pathname.startsWith(normalizedPath)) {
              const fixedPath = normalizedPath + pathname.slice(1);
              return origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
            }
          }
        } catch (e) {
          console.error('[Ingress Plugin] Failed to parse URL:', url, e);
        }

        if (pathname.startsWith(normalizedPath)) {
          return url;
        }

        // Handle absolute paths starting with /_nuxt/ (for non-full URLs that weren't caught earlier)
        if (pathname.startsWith('/_nuxt/')) {
          const fixedPath = normalizedPath + pathname.slice(1);
          if (isFullUrl && urlObj) {
            return origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
          }
          return fixedPath;
        }

        if (pathname.startsWith('/api/') && !pathname.startsWith('/api/hassio_ingress/')) {
          const fixedPath = normalizedPath + pathname.slice(1);
          if (isFullUrl && urlObj) {
            return origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
          }
          return fixedPath;
        }

        if ((pathname === '/manifest.webmanifest' || pathname === '/home' || pathname.startsWith('/home/')) && !pathname.startsWith(normalizedPath)) {
          const fixedPath = normalizedPath + pathname.slice(1);
          if (isFullUrl && urlObj) {
            return origin + fixedPath + (urlObj.search || '') + (urlObj.hash || '');
          }
          return fixedPath;
        }

        // Fallback for relative paths with _nuxt that weren't caught earlier
        if (!isFullUrl && !url.match(/^(https?:)?\/\//) && url.includes('_nuxt/')) {
          try {
            const baseUrl = window.location.origin + ((window as any).__ORIGINAL_PATHNAME__ || window.location.pathname);
            const resolved = new URL(url, baseUrl);
            if (resolved.pathname.startsWith('/_nuxt/') && !resolved.pathname.startsWith(normalizedPath)) {
              return normalizedPath + resolved.pathname.slice(1);
            }
          } catch (e) {
            console.error('[Ingress Plugin] Failed to resolve relative URL:', url, e);
            // Direct fix as last resort
            const pathToFix = url.startsWith('./') ? url.slice(2) : (url.startsWith('/') ? url.slice(1) : url);
            return normalizedPath + pathToFix;
          }
        }

        return url;
      };

      const originalFetch = window.fetch;
      window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
        let urlStr = '';
        const isRequest = input instanceof Request;
        const hasInit = !!init;
        const hasInitBody = !!(init && init.body);
        
        if (typeof input === 'string') {
          urlStr = input;
        } else if (isRequest) {
          urlStr = input.url;
        } else if (input && typeof input === 'object' && 'url' in input) {
          urlStr = (input as any).url;
        }

        if (urlStr) {
          const fixedUrl = fixRequestUrl(urlStr);
          if (fixedUrl !== urlStr) {
            
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
                console.error('[Ingress Plugin] Error creating Request:', e, {
                  url: fixedUrl,
                  originalUrl: urlStr,
                  method: input.method,
                });
                throw e;
              }
            }
            if (input && typeof input === 'object' && 'url' in input) {
              return originalFetch.call(this, new Request(fixedUrl, input as RequestInit), init);
            }
          }
        }

        return originalFetch.call(this, input, init);
      };

      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: any[]) {
        const urlStr = typeof url === 'string' ? url : url.toString();
        return originalOpen.call(this, method, fixRequestUrl(urlStr), ...rest);
      };

      const originalWebSocket = window.WebSocket;
      (window as any).WebSocket = function(url: string | URL, protocols?: string | string[]) {
        let urlStr: string;
        if (typeof url === 'string') {
          urlStr = url;
        } else if (url instanceof URL) {
          urlStr = url.href;
        } else {
          urlStr = String(url);
        }
        
        const fixedUrl = fixRequestUrl(urlStr);
        return new originalWebSocket(fixedUrl, protocols);
      } as any;
      Object.setPrototypeOf((window as any).WebSocket, originalWebSocket);
      Object.setPrototypeOf((window as any).WebSocket.prototype, originalWebSocket.prototype);

      // Ensure router base is set (in case it wasn't set earlier)
      try {
        const router = useRouter();
        if (router?.options && router.options.base !== normalizedPath) {
          router.options.base = normalizedPath;
        }
      } catch (e) {
        console.error('[Ingress Plugin] Failed to configure router base:', e);
      }
    } else {
      (window as any).__INGRESS_PATH__ = '/';
    }

    try {
      const router = useRouter();
      const currentIngressPath = (window as any).__INGRESS_PATH__ || '/';
      
      // Ensure router base is set before any navigation
      if (router?.options && router.options.base !== currentIngressPath) {
        router.options.base = currentIngressPath;
      }
      
      router.beforeEach((to, from, next) => {
        // Skip if not in ingress mode
        if (currentIngressPath === '/') {
          next();
          return;
        }
        
        // If path is exactly the ingress path, redirect to root
        if (to.path === currentIngressPath || to.path === currentIngressPath.slice(0, -1)) {
          next({ path: '/', replace: true });
          return;
        }
        
        // For subsequent navigations, if path incorrectly includes ingress path, strip it
        if (to.path.startsWith(currentIngressPath) && 
            router?.options?.base === currentIngressPath &&
            to.path.length > currentIngressPath.length) {
          const pathWithoutIngress = to.path.substring(currentIngressPath.length - 1);
          if (pathWithoutIngress !== to.path && pathWithoutIngress.startsWith('/')) {
            next({ path: pathWithoutIngress, replace: false });
            return;
          }
        }
        
        next();
      });
    } catch (e) {
      console.error('[Ingress Plugin] Failed to set up router middleware:', e);
    }
  }
});

