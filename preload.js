// Preload script for secure Electron-Renderer communication
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window state operations for Dynamic Island behavior
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  setWindowState: (state) => ipcRenderer.invoke('set-window-state', state), // 'compact' | 'expanded'
  toggleWindowState: () => ipcRenderer.invoke('toggle-window-state'),
  animationComplete: (targetState) => ipcRenderer.invoke('animation-complete', targetState),

  // Event listeners for state changes from system tray or shortcuts
  onWindowStateChanged: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window-state-changed', handler);
    return () => ipcRenderer.removeListener('window-state-changed', handler);
  },

  onToggleState: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-state', handler);
    return () => ipcRenderer.removeListener('toggle-state', handler);
  },

  // Backend status monitoring
  checkBackendHealth: () => ipcRenderer.invoke('check-backend-health'),
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),

  // Event listeners for backend updates
  onBackendStatus: (callback) => ipcRenderer.on('backend-status', (_event, status) => callback(status)),
  onConnectionStateChange: (callback) => ipcRenderer.on('connection-state', (_event, state) => callback(state)),

  // Remove listeners to prevent memory leaks
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('window-state-changed');
    ipcRenderer.removeAllListeners('toggle-state');
    ipcRenderer.removeAllListeners('backend-status');
    ipcRenderer.removeAllListeners('connection-state');
  }
});