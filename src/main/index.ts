import { app, BrowserWindow } from 'electron';
import { createDockWindow } from './windows/dockWindow';
import { createPetOverlayWindow } from './windows/petOverlayWindow';
import { precreatePopup } from './windows/popupWindows';
import { createTray } from './tray';
import { registerIpcHandlers } from './ipc/ipcHandlers';
import { initAutoUpdater } from './updater';

let dockWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
  });

  dockWindow = createDockWindow();
  createPetOverlayWindow();
  createTray(dockWindow);
  registerIpcHandlers();
  initAutoUpdater();

  // Keep the Lamp alive (hidden) so its audio element always exists — music
  // plays for both partners without needing to open the Lamp popup first.
  precreatePopup('lamp');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      dockWindow = createDockWindow();
      createPetOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});