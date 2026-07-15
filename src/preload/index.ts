import { contextBridge, ipcRenderer } from 'electron';

const IPC = {
  SHOW_TOAST: 'toast:show',
  HIDE_TOAST: 'toast:hide',
  RELAY_TO_TOAST: 'relay:to-toast',
  TOGGLE_WINDOW: 'window:toggle',
  HIDE_ALL_POPUPS: 'window:hide-all-popups',
  AUTH_CHANGED: 'auth:changed',
  POPUP_SHOWN: 'popup:shown',
  PET_SETTINGS_CHANGED: 'pet:settings-changed',
  GET_PET_SETTINGS: 'pet:get-settings',
  SET_PET_INTERACTIVE: 'pet:set-interactive',
  PET_HITBOX_DOWN: 'pet:hitbox-down',
  PET_HITBOX_MOVE: 'pet:hitbox-move',
  PET_HITBOX_UP: 'pet:hitbox-up',
  PET_MOVE_HITBOX: 'pet:move-hitbox',
  SPAWN_STICKER: 'pet:spawn-sticker',

} as const;

interface ToastPayload {
  id: string;
  type: 'note' | 'pet' | 'status';
  title: string;
  message?: string;
  emoji?: string;
}

interface PetSettings {
  catSize: number;
  overlayMode: 'full' | 'semi' | 'none';
  bottomOffset: number;
}

const api = {
  showToast: (payload: ToastPayload) => ipcRenderer.send(IPC.SHOW_TOAST, payload),
  hideToast: () => ipcRenderer.send(IPC.HIDE_TOAST),
  onToastRelay: (callback: (payload: ToastPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: ToastPayload) => callback(payload);
    ipcRenderer.on(IPC.RELAY_TO_TOAST, listener);
    return () => {
      ipcRenderer.removeListener(IPC.RELAY_TO_TOAST, listener);
    };
  },
  toggleWindow: (name: 'pet' | 'note' | 'lamp' | 'settings' | 'game') => ipcRenderer.send(IPC.TOGGLE_WINDOW, name),
  resizeDock: (width: number, height: number) => ipcRenderer.send('window:resize-dock', width, height),
  hideAllPopups: () => ipcRenderer.send(IPC.HIDE_ALL_POPUPS),
  notifyAuthChanged: () => ipcRenderer.send(IPC.AUTH_CHANGED),
  onPopupShown: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC.POPUP_SHOWN, listener);
    return () => {
      ipcRenderer.removeListener(IPC.POPUP_SHOWN, listener);
    };
  },
  setPetSettings: (settings: PetSettings) => ipcRenderer.send(IPC.PET_SETTINGS_CHANGED, settings),
  onPetSettingsChanged: (callback: (settings: PetSettings) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, settings: PetSettings) => callback(settings);
    ipcRenderer.on(IPC.PET_SETTINGS_CHANGED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.PET_SETTINGS_CHANGED, listener);
    };
  },
  getPetSettings: (): Promise<PetSettings> => ipcRenderer.invoke(IPC.GET_PET_SETTINGS),
  setPetInteractive: (interactive: boolean) => ipcRenderer.send(IPC.SET_PET_INTERACTIVE, interactive),

  // Ask THIS user's overlay to spawn a draggable sticker to place on the desktop.
  spawnSticker: (emoji: string, kind: string) => ipcRenderer.send(IPC.SPAWN_STICKER, { emoji, kind }),
  onSpawnSticker: (callback: (emoji: string, kind: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { emoji: string; kind: string }) =>
      callback(payload.emoji, payload.kind);
    ipcRenderer.on(IPC.SPAWN_STICKER, listener);
    return () => {
      ipcRenderer.removeListener(IPC.SPAWN_STICKER, listener);
    };
  },

  // --- Auto-update (manual control from Settings) ---
  checkForUpdate: (): Promise<{ state: 'dev' | 'checked' | 'error' }> => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.send('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdateStatus: (
    callback: (s: { state: 'available' | 'none' | 'downloading' | 'downloaded' | 'error'; version?: string; percent?: number; message?: string }) => void
  ) => {
    const handlers: Record<string, (e: Electron.IpcRendererEvent, d: any) => void> = {
      'update:available': (_e, d) => callback({ state: 'available', version: d?.version }),
      'update:none': () => callback({ state: 'none' }),
      'update:progress': (_e, d) => callback({ state: 'downloading', percent: d?.percent }),
      'update:downloaded': (_e, d) => callback({ state: 'downloaded', version: d?.version }),
      'update:error': (_e, d) => callback({ state: 'error', message: d?.message }),
    };
    for (const [ch, fn] of Object.entries(handlers)) ipcRenderer.on(ch, fn);
    return () => {
      for (const [ch, fn] of Object.entries(handlers)) ipcRenderer.removeListener(ch, fn);
    };
  },

  notifyPetHitboxDown: (clientX: number, clientY: number, screenX: number, screenY: number) =>
    ipcRenderer.send(IPC.PET_HITBOX_DOWN, { clientX, clientY, screenX, screenY }),
  movePetHitbox: (x: number, y: number, size: number) => ipcRenderer.send(IPC.PET_MOVE_HITBOX, { x, y, size }),
  onHitboxDown: (callback: (screenX: number, screenY: number) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { screenX: number; screenY: number }) =>
      callback(data.screenX, data.screenY);
    ipcRenderer.on(IPC.PET_HITBOX_DOWN, listener);
    return () => {
      ipcRenderer.removeListener(IPC.PET_HITBOX_DOWN, listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronApi = typeof api;