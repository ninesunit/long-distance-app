import { autoUpdater } from 'electron-updater';
import { app, ipcMain, BrowserWindow } from 'electron';

// Broadcast an update event to every renderer window (the Settings popup listens).
function broadcast(channel: string, payload?: unknown): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  });
}

export function initAutoUpdater(): void {
  // We drive downloading ourselves (the "Update" button in Settings), so it only
  // happens when the user asks — no surprise background downloads.
  autoUpdater.autoDownload = false;
  // …but if they downloaded and didn't restart, install on the next quit anyway.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => broadcast('update:available', { version: info.version }));
  autoUpdater.on('update-not-available', () => broadcast('update:none'));
  autoUpdater.on('download-progress', (p) => broadcast('update:progress', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => broadcast('update:downloaded', { version: info.version }));
  autoUpdater.on('error', (err) => broadcast('update:error', { message: String(err?.message ?? err) }));

  // Renderer → main controls.
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { state: 'dev' as const };
    try {
      await autoUpdater.checkForUpdates(); // emits update-available / update-not-available
      return { state: 'checked' as const };
    } catch (e) {
      broadcast('update:error', { message: String(e) });
      return { state: 'error' as const };
    }
  });

  ipcMain.on('update:download', () => {
    if (app.isPackaged) autoUpdater.downloadUpdate().catch((e) => broadcast('update:error', { message: String(e) }));
  });

  ipcMain.on('update:install', () => {
    // Mark quitting so every window (dock, overlay, tray-held lamp) actually
    // closes — a lingering process is what makes the NSIS installer fail with
    // "failed to delete old version". quitAndInstall quits then runs the setup.
    (app as any).isQuitting = true;
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });

  if (!app.isPackaged) return;

  // Background check so the Settings "Update" button can appear on its own.
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
}
