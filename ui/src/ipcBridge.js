// Universal Desktop Bridge supporting Tauri v2 + Electron + Browser
export const desktopAPI = {
  isTauri: () => typeof window !== 'undefined' && (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__)),
  isElectron: () => typeof window !== 'undefined' && Boolean(window.electronAPI),

  anchorToCursor: async (width = 380, height = 320) => {
    if (desktopAPI.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('anchor_to_cursor', { width, height });
      } catch (err) {
        console.warn('Tauri anchorToCursor error:', err);
      }
    }
    if (window.electronAPI?.anchorToCursor) {
      return await window.electronAPI.anchorToCursor(width, height);
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
    if (window.electronAPI?.getClipboardText) {
      return await window.electronAPI.getClipboardText();
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
    if (window.electronAPI?.resizeWindow) {
      return await window.electronAPI.resizeWindow(width, height);
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
    if (window.electronAPI?.getWindowState) {
      return await window.electronAPI.getWindowState();
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
    if (window.electronAPI?.onWindowStateChanged) {
      return window.electronAPI.onWindowStateChanged(callback);
    }
    return () => {};
  },

  onSummonCursor: (callback) => {
    if (window.electronAPI?.onSummonCursor) {
      return window.electronAPI.onSummonCursor(callback);
    }
    return () => {};
  },

  checkBackendHealth: () => fetch('http://localhost:8000/api/health').then((r) => r.json()),

  syncClipboardToBackend: async (content, category = null) => {
    if (!content || !content.trim()) return;
    try {
      await fetch('http://localhost:8000/api/clipboard/add', {
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
