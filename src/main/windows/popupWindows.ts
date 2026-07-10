import { BrowserWindow, app } from 'electron';
import path from 'path';
import { getDockWindow } from './dockWindow';

const isDev = !app.isPackaged;

export type PopupName = 'pet' | 'note' | 'lamp' | 'settings';

const POPUP_SIZE: Record<PopupName, { width: number; height: number }> = {
  pet: { width: 260, height: 320 },
  note: { width: 280, height: 360 },
  lamp: { width: 260, height: 350 },
  settings: { width: 260, height: 340 },
};

const popups = new Map<PopupName, BrowserWindow>();
let activePopup: PopupName | null = null;

function positionPopup(win: BrowserWindow, name: PopupName): void {
  const dock = getDockWindow();
  if (!dock) return;
  const dockBounds = dock.getBounds();
  const { width, height } = POPUP_SIZE[name];
  const x = Math.round(dockBounds.x + dockBounds.width / 2 - width / 2);
  const y = Math.round(dockBounds.y - height - 10);
  win.setBounds({ x, y, width, height });
}

function createPopup(name: PopupName): BrowserWindow {
  const { width, height } = POPUP_SIZE[name];
  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    win.loadURL(`http://localhost:5173/${name}.html`);
    // win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, `../../renderer/${name}.html`));
  }

  win.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault();
      win.hide();
      if (activePopup === name) activePopup = null;
    }
  });

  popups.set(name, win);
  return win;
}

export function togglePopup(name: PopupName): void {
  if (activePopup && activePopup !== name) {
    popups.get(activePopup)?.hide();
    activePopup = null;
  }

  let win = popups.get(name);

  if (!win || win.isDestroyed()) {
    win = createPopup(name);
    win.once('ready-to-show', () => {
      positionPopup(win!, name);
      win!.show();
      activePopup = name;
      win!.webContents.send('popup:shown');
    });
    return;
  }

  if (win.isVisible()) {
    win.hide();
    activePopup = null;
  } else {
    positionPopup(win, name);
    win.show();
    win.focus();
    activePopup = name;
    win.webContents.send('popup:shown'); // tell it to refresh its data NOW
  }
}

export function hideAllPopups(): void {
  popups.forEach((win) => win.hide());
  activePopup = null;
}

export function repositionActivePopup(): void {
  if (!activePopup) return;
  const win = popups.get(activePopup);
  if (win && win.isVisible()) positionPopup(win, activePopup);
}

export function reloadAllPopups(): void {
  popups.forEach((win) => {
    if (!win.isDestroyed()) win.reload();
  });
}