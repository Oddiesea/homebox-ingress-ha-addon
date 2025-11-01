// Home Assistant Ingress path fix
// Uses window.__HASS_INGRESS_PATH__ to fix static resource paths
(function() {
  'use strict';
  
  const ingressPath = window.__HASS_INGRESS_PATH__ || '';
  
  if (!ingressPath) {
    return; // Not in Ingress mode
  }
  
  // Fix asset paths using ingress path
  function fixPaths() {
    // Fix existing script and link tags
    document.querySelectorAll('script[src^="/_nuxt/"], link[href^="/_nuxt/"]').forEach(function(el) {
      const attr = el.tagName === 'SCRIPT' ? 'src' : 'href';
      const path = el.getAttribute(attr);
      if (path && path.startsWith('/_nuxt/')) {
        el.setAttribute(attr, ingressPath + path);
      }
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
        if (node.nodeName === 'SCRIPT' && node.src && node.src.startsWith('/_nuxt/')) {
          node.src = ingressPath + node.src;
        }
        if (node.nodeName === 'LINK' && node.href && node.href.startsWith('/_nuxt/')) {
          node.href = ingressPath + node.href;
        }
      });
    });
  }).observe(document.head, { childList: true, subtree: true });
})();

