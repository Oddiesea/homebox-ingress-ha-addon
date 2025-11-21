// Server-side ingress detection plugin
// Note: Since this is an SPA (ssr: false), this plugin won't run in production
// The backend Go server injects the ingress path into HTML instead
// This plugin is kept for development/testing scenarios where SSR might be enabled
export default defineNuxtPlugin((nuxtApp) => {
  // This runs on the server side (only if SSR is enabled)
  const event = useRequestEvent();
  
  if (event) {
    // Read X-Ingress-Path header from Home Assistant Supervisor
    const ingressPath = event.node.req.headers['x-ingress-path'] as string || '';
    
    if (ingressPath) {
      // Normalize the path (ensure it ends with /)
      const normalizedPath = ingressPath.endsWith('/') 
        ? ingressPath 
        : ingressPath + '/';
      
      // Inject into HTML head via useHead
      useHead({
        meta: [
          {
            name: 'ingress-path',
            content: normalizedPath,
          },
        ],
        script: [
          {
            innerHTML: `window.__HASS_INGRESS_PATH__ = window.__INGRESS_PATH__ = ${JSON.stringify(normalizedPath)};`,
            type: 'text/javascript',
          },
        ],
      });
      
      // Also set it in the app context for composable access
      nuxtApp.provide('ingressPath', normalizedPath);
      
      console.log('[Ingress] Server-side ingress path detected:', normalizedPath);
    } else {
      // No ingress, use root
      nuxtApp.provide('ingressPath', '/');
    }
  }
});

