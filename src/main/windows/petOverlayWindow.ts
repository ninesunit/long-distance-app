import { BrowserWindow, screen, app } from 'electron';
import path from 'path';

const isDev = !app.isPackaged;
let overlayWindow: BrowserWindow | null = null;

export function createPetOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) {
    win.loadURL('http://localhost:5173/pet-overlay.html');
  } else {
    win.loadFile(path.join(__dirname, '../../renderer/pet-overlay.html'));
  }

  win.on('closed', () => {
    overlayWindow = null;
  });

  overlayWindow = win;
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
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else if (mode === 'semi') {
    overlayWindow.setAlwaysOnTop(true, 'floating');
    overlayWindow.setVisibleOnAllWorkspaces(false);
  } else {
    overlayWindow.setAlwaysOnTop(false);
  }
}