import { app, BrowserWindow } from 'electron';
import { createDockWindow } from './windows/dockWindow';
import { createPetOverlayWindow } from './windows/petOverlayWindow';
import { createTray } from './tray';
import { registerIpcHandlers } from './ipc/ipcHandlers';

let dockWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  dockWindow = createDockWindow();
  createPetOverlayWindow();
  createTray(dockWindow);
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      dockWindow = createDockWindow();
      createPetOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // tray-only behavior
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});