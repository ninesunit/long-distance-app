import { BrowserWindow, screen, app } from 'electron';
import path from 'path';

const isDev = !app.isPackaged;
let overlayWindow: BrowserWindow | null = null;

export function createPetOverlayWindow(): BrowserWindow {
  // Explicitly use the display Windows reports as primary — on multi-monitor
  // setups with a non-primary "main" monitor, this matters a lot.
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setFullScreenable(false);

  if (isDev) {
    win.loadURL('http://localhost:5173/pet-overlay.html');
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/pet-overlay.html'));
  }

  win.on('closed', () => {
    overlayWindow = null;
  });

  overlayWindow = win;

  setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      overlayWindow.moveTop();
    }
  }, 250);

  return win;
}

export function reloadPetOverlay(): void {
  overlayWindow?.reload();
}

export function getPetOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

export function setOverlayMode(mode: 'full' | 'semi' | 'none'): void {
  if (!overlayWindow) return;
  if (mode === 'full') {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else if (mode === 'semi') {
    overlayWindow.setAlwaysOnTop(true, 'floating');
    overlayWindow.setVisibleOnAllWorkspaces(false);
  } else {
    overlayWindow.setAlwaysOnTop(false);
  }
}