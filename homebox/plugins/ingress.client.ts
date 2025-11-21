// Client-side ingress detection plugin
// Reads the ingress path from the meta tag or window variable injected by the backend
export default defineNuxtPlugin(() => {
  // Get ingress path from meta tag (injected by backend Go server)
  const metaTag = document.querySelector('meta[name="ingress-path"]');
  const ingressPath = metaTag?.getAttribute('content') || '';
  
  // Also check for window variable (set by backend script injection)
  const windowIngressPath = (window as any).__HASS_INGRESS_PATH__ || (window as any).__INGRESS_PATH__ || '';
  const finalIngressPath = ingressPath || windowIngressPath;
  
  if (finalIngressPath) {
    // Ensure path ends with / for consistency
    const normalizedPath = finalIngressPath.endsWith('/') 
      ? finalIngressPath 
      : finalIngressPath + '/';
    
    // Store in global state for composable access
    (window as any).__INGRESS_PATH__ = normalizedPath;
    (window as any).__HASS_INGRESS_PATH__ = normalizedPath; // Legacy support
    
    console.log('[Ingress] Client-side ingress path detected:', normalizedPath);
  } else {
    // No ingress, use root
    (window as any).__INGRESS_PATH__ = '/';
    console.log('[Ingress] No ingress path detected, using root');
  }
});

