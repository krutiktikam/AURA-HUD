// Universal Desktop Bridge supporting Tauri v2 + Electron + Browser
export const desktopAPI = {
  isTauri: () => typeof window !== 'undefined' && (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__)),
  isElectron: () => typeof window !== 'undefined' && Boolean(window.electronAPI),

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
    return 'compact';
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

  checkBackendHealth: () => fetch('http://localhost:8000/api/health').then((r) => r.json())
};

// Aliases for compatibility
export const tauriAPI = desktopAPI;
