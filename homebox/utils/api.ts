/**
 * API utility functions with ingress path support
 * 
 * These utilities automatically prepend the ingress path to API calls
 * when running under Home Assistant Ingress.
 */

import { useIngressUrl } from '~/composables/useIngressPath'

/**
 * Wrapper around $fetch that automatically handles ingress paths
 * 
 * @param url - The API endpoint (e.g., "/api/items" or "api/items")
 * @param options - Fetch options (same as $fetch)
 * @returns The fetch response
 * 
 * @example
 * // This will automatically use the ingress path if available
 * const items = await useApiFetch('/api/items')
 */
export const useApiFetch = async <T = any>(
  url: string,
  options?: any
): Promise<T> => {
  const ingressUrl = useIngressUrl(url)
  return await $fetch<T>(ingressUrl, options)
}

/**
 * Helper to build API URLs with ingress path support
 * 
 * @param endpoint - The API endpoint path
 * @returns The full URL with ingress path prepended
 * 
 * @example
 * const url = useApiUrl('/api/items')
 * // Returns: "/api/hassio_ingress/abc123/api/items" (if in ingress)
 * // Or: "/api/items" (if not in ingress)
 */
export const useApiUrl = (endpoint: string): string => {
  return useIngressUrl(endpoint)
}

