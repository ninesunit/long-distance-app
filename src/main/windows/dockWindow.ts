import { BrowserWindow, screen, app, ipcMain } from 'electron';
import path from 'path';
import { repositionActivePopup, hideAllPopups } from './popupWindows';
import { rendererUrl } from '../staticServer';

let dockWindow: BrowserWindow | null = null;

const DOCK_WIDTH = 280;
const DOCK_HEIGHT = 72;

export function createDockWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { x: originX, y: originY, width, height } = display.workArea;

  const win = new BrowserWindow({
    width: DOCK_WIDTH,
    height: DOCK_HEIGHT,
    x: Math.round(originX + width / 2 - DOCK_WIDTH / 2),
    y: originY + height - DOCK_HEIGHT - 8,
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

  win.loadURL(rendererUrl('dock.html'));

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

ipcMain.on('window:resize-dock', (_event, newWidth: number, newHeight: number) => {
  if (!dockWindow) return;
  const display = screen.getPrimaryDisplay();
  const { x: originX, y: originY, width: screenWidth, height: screenHeight } = display.workArea;
  const currentBounds = dockWindow.getBounds();

  const centerX = currentBounds.x + currentBounds.width / 2;
  const bottomEdge = currentBounds.y + currentBounds.height;

  let newX = Math.round(centerX - newWidth / 2);
  let newY = Math.round(bottomEdge - newHeight);

  newX = Math.max(originX, Math.min(originX + screenWidth - newWidth, newX));
  newY = Math.max(originY, Math.min(originY + screenHeight - newHeight, newY));

  dockWindow.setBounds({ width: newWidth, height: newHeight, x: newX, y: newY });
});