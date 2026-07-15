import { BrowserWindow, app } from 'electron';
import path from 'path';
import { getDockWindow } from './dockWindow';
import { rendererUrl } from '../staticServer';

const isDev = !app.isPackaged;

export type PopupName = 'pet' | 'note' | 'lamp' | 'settings' | 'game';

const POPUP_SIZE: Record<PopupName, { width: number; height: number }> = {
  pet: { width: 260, height: 372 },
  note: { width: 280, height: 360 },
  lamp: { width: 260, height: 350 },
  settings: { width: 260, height: 340 },
  game: { width: 300, height: 400 },
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

  win.loadURL(rendererUrl(`${name}.html`));
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

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

  // Recreate if the window or its renderer is gone (e.g. a renderer crash) so a
  // dead window can't wedge the popup permanently.
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
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

// Create a popup window hidden and keep it alive, without showing it. Used so
// the Lamp's audio element always exists — both partners hear a track the
// moment it plays, without having to open the Lamp popup first.
export function precreatePopup(name: PopupName): void {
  const existing = popups.get(name);
  if (!existing || existing.isDestroyed()) createPopup(name);
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