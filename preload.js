const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', width, height),
  setWindowState: (state) => ipcRenderer.invoke('set-window-state', state),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  toggleWindowState: () => ipcRenderer.invoke('toggle-window-state'),
  anchorToCursor: (width, height) => ipcRenderer.invoke('anchor-to-cursor', width, height),
  getClipboardText: () => ipcRenderer.invoke('get-clipboard-text'),
  onWindowStateChanged: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window-state-changed', handler);
    return () => ipcRenderer.removeListener('window-state-changed', handler);
  },
  onSummonCursor: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('summon-cursor', handler);
    return () => ipcRenderer.removeListener('summon-cursor', handler);
  },
  animationComplete: (targetState) => ipcRenderer.invoke('animation-complete', targetState)
});