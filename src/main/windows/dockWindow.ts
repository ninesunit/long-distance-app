import { BrowserWindow, screen, app, ipcMain } from 'electron';
import path from 'path';
import { repositionActivePopup } from './popupWindows';
import { hideAllPopups } from './popupWindows';

const isDev = !app.isPackaged;
let dockWindow: BrowserWindow | null = null;

const DOCK_WIDTH = 280;
const DOCK_HEIGHT = 72;

export function createDockWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: DOCK_WIDTH,
    height: DOCK_HEIGHT,
    x: Math.round(width / 2 - DOCK_WIDTH / 2),
    y: height - DOCK_HEIGHT - 8,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

    win.setAlwaysOnTop(true, 'screen-saver');

  if (isDev) {
    win.loadURL('http://localhost:5173/dock.html');
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/dock.html'));
  }

  win.on('move', () => {
    repositionActivePopup();
  });

  win.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  dockWindow = win;
  return win;
}

export function getDockWindow(): BrowserWindow | null {
  return dockWindow;
}

export function toggleDockVisibility(): void {
  if (!dockWindow) return;
  if (dockWindow.isVisible()) {
    dockWindow.hide();
    hideAllPopups();
  } else {
    dockWindow.show();
  }
}

// Resize while PRESERVING the dock's current top-left position — only the
// very first `createDockWindow()` call centers it. Every subsequent resize
// (e.g. auth screen growing/shrinking the window) keeps wherever the user
// last dragged it to, just clamped so it doesn't go off-screen.
ipcMain.on('window:resize-dock', (_event, newWidth: number, newHeight: number) => {
  if (!dockWindow) return;
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const currentBounds = dockWindow.getBounds();

  const centerX = currentBounds.x + currentBounds.width / 2;
  const bottomEdge = currentBounds.y + currentBounds.height;

  let newX = Math.round(centerX - newWidth / 2);
  let newY = Math.round(bottomEdge - newHeight); // anchor bottom, grow upward

  newX = Math.max(0, Math.min(screenWidth - newWidth, newX));
  newY = Math.max(0, Math.min(screenHeight - newHeight, newY));

  dockWindow.setBounds({ width: newWidth, height: newHeight, x: newX, y: newY });
});