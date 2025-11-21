/**
 * Composable to access the Home Assistant Ingress path
 * 
 * Returns the ingress path prefix (e.g., "/api/hassio_ingress/abc123/")
 * or "/" if not running under ingress.
 * 
 * @returns The ingress path with trailing slash, or "/" if not in ingress mode
 */
export const useIngressPath = () => {
  // Try to get from Nuxt app context (server-side)
  const nuxtApp = useNuxtApp();
  const serverPath = nuxtApp.$ingressPath;
  
  if (import.meta.server && serverPath) {
    return serverPath;
  }
  
  // Client-side: read from window variable or meta tag
  if (import.meta.client) {
    // Check window variable first (set by plugin)
    const windowPath = (window as any).__INGRESS_PATH__;
    if (windowPath) {
      return windowPath;
    }
    
    // Fallback to meta tag
    const metaTag = document.querySelector('meta[name="ingress-path"]');
    const metaPath = metaTag?.getAttribute('content');
    if (metaPath) {
      const normalized = metaPath.endsWith('/') ? metaPath : metaPath + '/';
      (window as any).__INGRESS_PATH__ = normalized;
      return normalized;
    }
    
    // Fallback to legacy window variable
    const legacyPath = (window as any).__HASS_INGRESS_PATH__;
    if (legacyPath) {
      const normalized = legacyPath.endsWith('/') ? legacyPath : legacyPath + '/';
      (window as any).__INGRESS_PATH__ = normalized;
      return normalized;
    }
  }
  
  // Default to root
  return '/';
};

/**
 * Helper to prepend ingress path to a URL
 * 
 * @param path - The path to prepend (e.g., "/api/items" or "api/items")
 * @returns The full path with ingress prefix
 */
export const useIngressUrl = (path: string) => {
  const ingressPath = useIngressPath();
  
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // If ingress path is root, just return the path with leading slash
  if (ingressPath === '/') {
    return '/' + cleanPath;
  }
  
  // Combine ingress path with the requested path
  // ingressPath already ends with /, so we can directly append
  return ingressPath + cleanPath;
};

