import { apiFetch } from './api';
import { API_BASE } from './config';

// Universal Desktop Bridge supporting Tauri v2 + Browser
export const desktopAPI = {
  isTauri: () =>
    typeof window !== 'undefined' &&
    (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__)),

  getClipboardText: async () => {
    if (desktopAPI.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('get_clipboard_text');
      } catch (err) {
        console.warn('Tauri getClipboardText error:', err);
      }
    }
    if (navigator.clipboard?.readText) {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        return { text, has_content: text.length > 0 };
      } catch {
        return { text: '', has_content: false };
      }
    }
    return { text: '', has_content: false };
  },

  checkBackendHealth: () => apiFetch(`${API_BASE}/api/health`).then((r) => r.json()),

  syncClipboardToBackend: async (content, category = null) => {
    if (!content || !content.trim()) return { status: 'empty' };
    try {
      const response = await apiFetch(`${API_BASE}/api/clipboard/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), category }),
      });
      if (!response.ok) return { status: 'error' };
      return await response.json();
    } catch {
      return { status: 'error' };
    }
  },

  getClipboardSettings: async () => {
    try {
      const response = await apiFetch(`${API_BASE}/api/clipboard/settings`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

  setClipboardPaused: async (paused) => {
    try {
      const response = await apiFetch(`${API_BASE}/api/clipboard/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: Boolean(paused) }),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

  clearClipboardHistory: async () => {
    try {
      const response = await apiFetch(`${API_BASE}/api/clipboard/clear`, {
        method: 'POST',
      });
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data?.deleted === 'number' ? data.deleted : null;
    } catch {
      return null;
    }
  },
};

export const tauriAPI = desktopAPI;
