// Client-side ingress detection plugin
// Reads the ingress path from the meta tag or window variable injected by the backend
// Must run early to configure router before navigation
export default defineNuxtPlugin({
  name: 'ingress-client',
  enforce: 'pre', // Run before other plugins
  setup() {
    // Get ingress path from meta tag (injected by backend Go server)
    const metaTag = document.querySelector('meta[name="ingress-path"]');
    const ingressPath = metaTag?.getAttribute('content') || '';
    
    // Also check for window variable (set by backend script injection)
    const windowIngressPath = (window as any).__HASS_INGRESS_PATH__ || (window as any).__INGRESS_PATH__ || '';
    const finalIngressPath = ingressPath || windowIngressPath;
    
    let normalizedPath = '/';
    if (finalIngressPath) {
      // Ensure path ends with / for consistency
      normalizedPath = finalIngressPath.endsWith('/') 
        ? finalIngressPath 
        : finalIngressPath + '/';
      
      // Store in global state for composable access
      (window as any).__INGRESS_PATH__ = normalizedPath;
      (window as any).__HASS_INGRESS_PATH__ = normalizedPath; // Legacy support
      
      console.log('[Ingress] Client-side ingress path detected:', normalizedPath);
      
      // Strip ingress path from current URL if present
      // This must happen before router initialization
      const currentPath = window.location.pathname;
      if (currentPath.startsWith(normalizedPath)) {
        const pathWithoutIngress = currentPath.substring(normalizedPath.length - 1); // -1 to keep leading /
        if (pathWithoutIngress !== currentPath && pathWithoutIngress !== normalizedPath) {
          console.log('[Ingress] Stripping ingress path from URL:', currentPath, '->', pathWithoutIngress);
          // Use replaceState to update URL without triggering navigation
          window.history.replaceState(null, '', pathWithoutIngress + window.location.search + window.location.hash);
        }
      }
    } else {
      // No ingress, use root
      (window as any).__INGRESS_PATH__ = '/';
      console.log('[Ingress] No ingress path detected, using root');
    }
    
    // Add router middleware to strip ingress path from all routes
    const router = useRouter();
    router.beforeEach((to, from, next) => {
      if (normalizedPath !== '/' && to.path.startsWith(normalizedPath)) {
        const pathWithoutIngress = to.path.substring(normalizedPath.length - 1); // -1 to keep leading /
        if (pathWithoutIngress !== to.path) {
          console.log('[Ingress] Router middleware: redirecting', to.path, 'to', pathWithoutIngress);
          next(pathWithoutIngress);
          return;
        }
      }
      next();
    });
  }
});

