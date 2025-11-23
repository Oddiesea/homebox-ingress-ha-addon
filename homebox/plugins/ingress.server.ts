export default defineNuxtPlugin((nuxtApp) => {
  const event = useRequestEvent();
  
  if (event) {
    const ingressPath = event.node.req.headers['x-ingress-path'] as string || '';
    
    if (ingressPath) {
      const normalizedPath = ingressPath.endsWith('/') ? ingressPath : ingressPath + '/';
      
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
      
      nuxtApp.provide('ingressPath', normalizedPath);
    } else {
      nuxtApp.provide('ingressPath', '/');
    }
  }
});

