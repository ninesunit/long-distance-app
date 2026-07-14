import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { hideAllPopups } from './popupWindows';
import { rendererUrl } from '../staticServer';

let toastWindow: BrowserWindow | null = null;

export function getOrCreateToastWindow(): BrowserWindow {
  if (toastWindow && !toastWindow.isDestroyed()) return toastWindow;

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 320;
  const winHeight = 120;

  toastWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: width - winWidth - 20,
    y: height - winHeight - 20,
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

  toastWindow.setIgnoreMouseEvents(false);

  toastWindow.loadURL(rendererUrl('toast.html'));

  return toastWindow;
}
