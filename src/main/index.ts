import { app, BrowserWindow } from 'electron';
import path from 'path';
import { createDockWindow } from './windows/dockWindow';
import { createPetOverlayWindow } from './windows/petOverlayWindow';
import { precreatePopup } from './windows/popupWindows';
import { createTray } from './tray';
import { registerIpcHandlers } from './ipc/ipcHandlers';
import { initAutoUpdater } from './updater';
import { startRendererServer } from './staticServer';

let dockWindow: BrowserWindow | null = null;

// Only ever one copy running. Two instances (e.g. the launch-at-login copy plus
// a manual reopen) would lock each other's files and make the auto-update
// installer fail with "failed to delete old version".
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (dockWindow && !dockWindow.isDestroyed()) {
      dockWindow.show();
      dockWindow.focus();
    }
  });

app.whenReady().then(async () => {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
  });

  // Serve the renderer over http://localhost when packaged (gives a real web
  // origin so YouTube embeds work). Must finish before any window loads.
  if (app.isPackaged) {
    try {
      await startRendererServer(path.join(__dirname, '../renderer'));
    } catch (e) {
      console.error('Failed to start renderer server:', e);
    }
  }

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
}