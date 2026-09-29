/**
 * Base URLs for the two platform APIs this application talks to.
 *
 * TEMPORARY: once the typed clients are generated (see the sprint README's
 * "Generating the typed clients" section), the generated client's own
 * BASE_PATH / Configuration objects should be the single source of truth for
 * these values, and this file can be deleted. Until then, this is the one
 * place both interim API services read the base URL from.
 *
 * Nothing here is a secret — these are just hostnames, safe to ship in the
 * bundle. Do not add API keys or signing secrets to this file or any file
 * under src/.
 */
export const API_CONFIG = {
  authApiBaseUrl: 'http://localhost:3000',
  tradeApiBaseUrl: 'http://localhost:8080',
} as const;
