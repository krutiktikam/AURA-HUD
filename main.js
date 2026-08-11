const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let tray = null;
let currentState = 'compact'; // 'compact' | 'expanded'

const COMPACT_WIDTH = 140;
const COMPACT_HEIGHT = 40;
const EXPANDED_WIDTH = 1113;
const EXPANDED_HEIGHT = 385;
const TOP_OFFSET = 10;

function getWindowPosition(width) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workArea;
  const x = Math.floor((screenWidth - width) / 2);
  return { x, y: TOP_OFFSET };
}

function updateWindowState(newState) {
  if (!win || win.isDestroyed()) return;
  currentState = newState === 'expanded' ? 'expanded' : 'compact';
  const width = currentState === 'expanded' ? EXPANDED_WIDTH : COMPACT_WIDTH;
  const height = currentState === 'expanded' ? EXPANDED_HEIGHT : COMPACT_HEIGHT;
  const { x, y } = getWindowPosition(width);

  win.setBounds({ x, y, width, height }, true);
  win.webContents.send('window-state-changed', currentState);
}

function createWindow() {
  const { x, y } = getWindowPosition(COMPACT_WIDTH);

  win = new BrowserWindow({
    width: COMPACT_WIDTH,
    height: COMPACT_HEIGHT,
    x: x,
    y: y,
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

  // Auto-collapse when user clicks outside the window (Blur event)
  win.on('blur', () => {
    if (currentState === 'expanded' && win && !win.isDestroyed()) {
      updateWindowState('compact');
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
      label: 'Toggle Island (Compact/Expanded)',
      click: () => {
        const nextState = currentState === 'compact' ? 'expanded' : 'compact';
        updateWindowState(nextState);
      }
    },
    {
      label: 'Show/Hide Window',
      click: () => {
        if (!win) return;
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
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

  tray.setToolTip('AI Companion - Dynamic HUD');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!win) return;
    if (win.isVisible()) {
      if (currentState === 'compact') {
        updateWindowState('expanded');
      } else {
        win.hide();
      }
    } else {
      win.show();
      win.focus();
    }
  });
}

function setupIPC() {
  ipcMain.handle('set-window-state', (_event, state) => {
    updateWindowState(state);
    return currentState;
  });

  ipcMain.handle('get-window-state', () => {
    return currentState;
  });

  ipcMain.handle('toggle-window-state', () => {
    const nextState = currentState === 'compact' ? 'expanded' : 'compact';
    updateWindowState(nextState);
    return currentState;
  });

  ipcMain.handle('animation-complete', () => {
    if (win && !win.isDestroyed()) {
      win.hide();
    }
    return true;
  });
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+Y', () => {
    if (!win) return;
    if (!win.isVisible()) {
      win.show();
      win.focus();
      updateWindowState('compact');
    } else if (currentState === 'compact') {
      updateWindowState('expanded');
      win.focus();
    } else {
      updateWindowState('compact');
    }
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