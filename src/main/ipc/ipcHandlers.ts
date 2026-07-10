import { ipcMain, BrowserWindow } from 'electron';
import { getOrCreateToastWindow } from '../windows/toastWindow';
import { togglePopup, hideAllPopups, reloadAllPopups } from '../windows/popupWindows';
import { reloadPetOverlay, getPetOverlayWindow } from '../windows/petOverlayWindow';
import type { PopupName } from '../windows/popupWindows';

const IPC = {
  SHOW_TOAST: 'toast:show',
  HIDE_TOAST: 'toast:hide',
  RELAY_TO_TOAST: 'relay:to-toast',
  TOGGLE_WINDOW: 'window:toggle',
  HIDE_ALL_POPUPS: 'window:hide-all-popups',
  AUTH_CHANGED: 'auth:changed',
  PET_SETTINGS_CHANGED: 'pet:settings-changed',
  GET_PET_SETTINGS: 'pet:get-settings',
  SET_PET_INTERACTIVE: 'pet:set-interactive',
} as const;

let petSettings = { taskbarOffset: -10, catSize: 64, overlayMode: 'semi' as 'full' | 'semi' | 'none' };

export function registerIpcHandlers(): void {
  ipcMain.on(IPC.SHOW_TOAST, (_e, payload) => {
    const win = getOrCreateToastWindow();
    win.showInactive();
    win.webContents.send(IPC.RELAY_TO_TOAST, payload);
  });

  ipcMain.on(IPC.HIDE_TOAST, () => getOrCreateToastWindow().hide());

  ipcMain.on(IPC.TOGGLE_WINDOW, (_e, name: PopupName) => togglePopup(name));

  ipcMain.on(IPC.HIDE_ALL_POPUPS, () => hideAllPopups());

  ipcMain.on(IPC.AUTH_CHANGED, () => {
    hideAllPopups();
    reloadAllPopups();
    reloadPetOverlay();
  });

  ipcMain.on(IPC.PET_SETTINGS_CHANGED, (_e, settings) => {
    petSettings = settings;
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.PET_SETTINGS_CHANGED, petSettings);
    });
  });

  ipcMain.handle(IPC.GET_PET_SETTINGS, () => petSettings);

  // Toggle click-through on/off for the pet overlay based on whether the
  // cursor is currently over the cat sprite (renderer tells us via hit-test)
  ipcMain.on(IPC.SET_PET_INTERACTIVE, (_e, interactive: boolean) => {
    const overlay = getPetOverlayWindow();
    if (!overlay) return;
    overlay.setIgnoreMouseEvents(!interactive, { forward: true });
  });
}