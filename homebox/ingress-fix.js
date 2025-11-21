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
})();

