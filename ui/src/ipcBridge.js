import { API_BASE } from './config';

// Universal Desktop Bridge supporting Tauri v2 + Browser
export const desktopAPI = {
  isTauri: () => typeof window !== 'undefined' && (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__)),

  anchorToCursor: async (width = 380, height = 320) => {
    if (desktopAPI.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('anchor_to_cursor', { width, height });
      } catch (err) {
        console.warn('Tauri anchorToCursor error:', err);
      }
    }
    return { x: 100, y: 100 };
  },

  getClipboardText: async () => {
    if (desktopAPI.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('get_clipboard_text');
      } catch (err) {
        console.warn('Tauri getClipboardText error:', err);
      }
    }
    if (navigator.clipboard) {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        return { text, has_content: text.length > 0 };
      } catch {
        return { text: '', has_content: false };
      }
    }
    return { text: '', has_content: false };
  },

  resizeWindow: async (width, height) => {
    if (desktopAPI.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('resize_window', { width, height });
      } catch (err) {
        console.warn('Tauri resizeWindow error:', err);
      }
    }
  },

  getWindowState: async () => {
    if (desktopAPI.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('get_window_state');
      } catch (err) {
        console.warn('Tauri getWindowState error:', err);
      }
    }
    return 'palette';
  },

  onWindowStateChanged: (callback) => {
    if (desktopAPI.isTauri()) {
      let unlisten = null;
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('window-state-changed', (event) => callback(event.payload)).then((fn) => {
          unlisten = fn;
        });
      }).catch(console.warn);
      return () => {
        if (unlisten) unlisten();
      };
    }
    return () => {};
  },

  onSummonCursor: (callback) => {
    return () => {};
  },

  checkBackendHealth: () => fetch(`${API_BASE}/api/health`).then((r) => r.json()),

  syncClipboardToBackend: async (content, category = null) => {
    if (!content || !content.trim()) return;
    try {
      await fetch(`${API_BASE}/api/clipboard/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), category })
      });
    } catch {
      // Background sync, ignore network errors
    }
  }
};

export const tauriAPI = desktopAPI;
