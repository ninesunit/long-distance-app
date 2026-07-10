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
} as const;

interface ToastPayload {
  id: string;
  type: 'note' | 'pet' | 'status';
  title: string;
  message?: string;
  emoji?: string;
}

interface PetSettings {
  taskbarOffset: number;
  catSize: number;
}

const api = {
  showToast: (payload: ToastPayload) => ipcRenderer.send(IPC.SHOW_TOAST, payload),
  hideToast: () => ipcRenderer.send(IPC.HIDE_TOAST),
  onToastRelay: (callback: (payload: ToastPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: ToastPayload) => callback(payload);
    ipcRenderer.on(IPC.RELAY_TO_TOAST, listener);
    return () => ipcRenderer.removeListener(IPC.RELAY_TO_TOAST, listener);
  },
  toggleWindow: (name: 'pet' | 'note' | 'lamp' | 'settings') => ipcRenderer.send(IPC.TOGGLE_WINDOW, name),
  resizeDock: (width: number, height: number) => ipcRenderer.send('window:resize-dock', width, height),
  hideAllPopups: () => ipcRenderer.send(IPC.HIDE_ALL_POPUPS),
  notifyAuthChanged: () => ipcRenderer.send(IPC.AUTH_CHANGED),
  onPopupShown: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC.POPUP_SHOWN, listener);
    return () => ipcRenderer.removeListener(IPC.POPUP_SHOWN, listener);
  },
  setPetSettings: (settings: PetSettings) => ipcRenderer.send(IPC.PET_SETTINGS_CHANGED, settings),
  onPetSettingsChanged: (callback: (settings: PetSettings) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, settings: PetSettings) => callback(settings);
    ipcRenderer.on(IPC.PET_SETTINGS_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC.PET_SETTINGS_CHANGED, listener);
  },
  getPetSettings: (): Promise<PetSettings> => ipcRenderer.invoke(IPC.GET_PET_SETTINGS),
  setPetInteractive: (interactive: boolean) => ipcRenderer.send(IPC.SET_PET_INTERACTIVE, interactive),
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronApi = typeof api;