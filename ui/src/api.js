import { API_BASE } from './config';

let cachedToken = null;
let tokenPromise = null;

/**
 * Retrieve and memoize the API token.
 * In Tauri: invokes 'get_api_token' from the Rust backend.
 * In a plain browser: returns import.meta.env.VITE_AURA_DEV_TOKEN only when DEV is true.
 * Otherwise throws an error.
 */
export async function getToken() {
  if (cachedToken) {
    return cachedToken;
  }

  if (!tokenPromise) {
    tokenPromise = (async () => {
      const isTauri =
        typeof window !== 'undefined' &&
        (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__));

      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const token = await invoke('get_api_token');
        cachedToken = token;
        return token;
      }

      if (import.meta.env.DEV && import.meta.env.VITE_AURA_DEV_TOKEN) {
        const token = import.meta.env.VITE_AURA_DEV_TOKEN;
        cachedToken = token;
        return token;
      }

      throw new Error('API token not available in plain browser outside DEV mode');
    })().catch((err) => {
      tokenPromise = null;
      throw err;
    });
  }

  return tokenPromise;
}

/**
 * Authenticated fetch wrapper that attaches the Bearer token in the Authorization header.
 */
export async function apiFetch(pathOrUrl, options = {}) {
  const token = await getToken();
  const url =
    pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')
      ? pathOrUrl
      : `${API_BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(url, {
    ...options,
    headers,
  });
}
