const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain, screen, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let tray = null;
let currentState = 'palette'; // 'palette' | 'expanded' | 'compact'

// Dimensions
const PALETTE_WIDTH = 420;
const PALETTE_HEIGHT = 420;
const COMPACT_WIDTH = 160;
const COMPACT_HEIGHT = 60;
const EXPANDED_WIDTH = 1150;
const EXPANDED_HEIGHT = 420;

function anchorToCursor(width = PALETTE_WIDTH, height = PALETTE_HEIGHT) {
  if (!win || win.isDestroyed()) return null;

  const cursor = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursor);
  const { x: screenX, y: screenY, width: screenW, height: screenH } = currentDisplay.workArea;

  const rawX = cursor.x - Math.floor(width / 2);
  const rawY = cursor.y + 12;

  const minX = screenX + 12;
  const maxX = screenX + screenW - width - 12;
  const minY = screenY + 12;
  const maxY = screenY + screenH - height - 12;

  const clampedX = Math.max(minX, Math.min(rawX, maxX));
  const clampedY = Math.max(minY, Math.min(rawY, maxY));

  win.setBounds({ x: clampedX, y: clampedY, width, height }, true);
  win.show();
  win.focus();

  currentState = 'palette';
  win.webContents.send('window-state-changed', 'palette');
  win.webContents.send('summon-cursor', { x: clampedX, y: clampedY });

  return { x: clampedX, y: clampedY };
}

function updateWindowState(newState) {
  if (!win || win.isDestroyed()) return;
  currentState = newState;

  let width = PALETTE_WIDTH;
  let height = PALETTE_HEIGHT;

  if (currentState === 'expanded') {
    width = EXPANDED_WIDTH;
    height = EXPANDED_HEIGHT;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW } = primaryDisplay.workArea;
    const x = Math.floor((screenW - width) / 2);
    win.setBounds({ x, y: 20, width, height }, true);
  } else if (currentState === 'compact') {
    width = COMPACT_WIDTH;
    height = COMPACT_HEIGHT;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW } = primaryDisplay.workArea;
    const x = Math.floor((screenW - width) / 2);
    win.setBounds({ x, y: 10, width, height }, true);
  } else {
    anchorToCursor(PALETTE_WIDTH, PALETTE_HEIGHT);
    return;
  }

  win.webContents.send('window-state-changed', currentState);
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW } = primaryDisplay.workArea;
  const x = Math.floor((screenW - PALETTE_WIDTH) / 2);

  win = new BrowserWindow({
    width: PALETTE_WIDTH,
    height: PALETTE_HEIGHT,
    x: x,
    y: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = 'http://localhost:3000';
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    win.loadURL(devUrl).catch(() => {
      win.loadFile(path.join(__dirname, 'ui', 'dist', 'index.html'));
    });
  } else {
    win.loadFile(path.join(__dirname, 'ui', 'dist', 'index.html'));
  }

  // Auto-collapse / dismiss on blur
  win.on('blur', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('window-blur');
    }
  });

  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Summon Cursor Palette (Ctrl+Shift+A)',
      click: () => {
        anchorToCursor(PALETTE_WIDTH, PALETTE_HEIGHT);
      }
    },
    {
      label: 'Toggle Full Dashboard (Ctrl+Shift+Y)',
      click: () => {
        const nextState = currentState === 'expanded' ? 'compact' : 'expanded';
        updateWindowState(nextState);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Companion',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('AI Companion - Cursor HUD');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    anchorToCursor(PALETTE_WIDTH, PALETTE_HEIGHT);
  });
}

function setupIPC() {
  ipcMain.handle('anchor-to-cursor', (_event, width, height) => {
    return anchorToCursor(width, height);
  });

  ipcMain.handle('get-clipboard-text', () => {
    const text = clipboard.readText().trim();
    return {
      text,
      has_content: text.length > 0
    };
  });

  ipcMain.handle('resize-window', (_event, width, height) => {
    if (!win || win.isDestroyed()) return false;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW } = primaryDisplay.workArea;
    const x = Math.floor((screenW - width) / 2);
    win.setBounds({ x, y: 20, width, height }, true);
    return true;
  });

  ipcMain.handle('set-window-state', (_event, state) => {
    updateWindowState(state);
    return currentState;
  });

  ipcMain.handle('get-window-state', () => currentState);

  ipcMain.handle('toggle-window-state', () => {
    const nextState = currentState === 'expanded' ? 'palette' : 'expanded';
    updateWindowState(nextState);
    return currentState;
  });

  ipcMain.handle('animation-complete', (_event, targetState) => {
    if (win && !win.isDestroyed() && targetState === 'compact') {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenW } = primaryDisplay.workArea;
      const x = Math.floor((screenW - COMPACT_WIDTH) / 2);
      win.setBounds({ x, y: 10, width: COMPACT_WIDTH, height: COMPACT_HEIGHT }, true);
    }
    return true;
  });
}

function registerShortcuts() {
  // Primary Hotkeys: Ctrl+Shift+A & Ctrl+Shift+Space for Cursor Anchor
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    anchorToCursor(PALETTE_WIDTH, PALETTE_HEIGHT);
  });

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    anchorToCursor(PALETTE_WIDTH, PALETTE_HEIGHT);
  });

  // Secondary Hotkey: Ctrl+Shift+Y for Full Dashboard
  globalShortcut.register('CommandOrControl+Shift+Y', () => {
    if (!win) return;
    const nextState = currentState === 'expanded' ? 'palette' : 'expanded';
    updateWindowState(nextState);
  });
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  createTray();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});