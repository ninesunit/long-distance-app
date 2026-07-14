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
  SPAWN_TREAT: 'pet:spawn-treat',
} as const;

let petSettings = { catSize: 64, overlayMode: 'semi' as 'full' | 'semi' | 'none', bottomOffset: -15 };

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

  ipcMain.on(IPC.SET_PET_INTERACTIVE, (_e, interactive: boolean) => {
    const overlay = getPetOverlayWindow();
    if (!overlay) return;
    overlay.setIgnoreMouseEvents(!interactive, { forward: true });
  });

  // Pet popup asks THIS user's overlay to spawn a draggable treat.
  ipcMain.on(IPC.SPAWN_TREAT, () => {
    getPetOverlayWindow()?.webContents.send(IPC.SPAWN_TREAT);
  });
}