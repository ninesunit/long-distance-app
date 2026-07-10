export const IPC = {
  SHOW_TOAST: 'toast:show',
  HIDE_TOAST: 'toast:hide',
  LAMP_UPDATE: 'lamp:update',
  PET_BOUNCE: 'pet:bounce',
  STATUS_CHANGED: 'status:changed',
  SET_TRAY_STATUS: 'tray:set-status',
  RELAY_TO_TOAST: 'relay:to-toast', // hub -> main -> toast window
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];