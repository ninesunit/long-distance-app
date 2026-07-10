import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';
import path from 'path';
import { toggleDockVisibility } from './windows/dockWindow';


let tray: Tray | null = null;

export function createTray(dockWindow: BrowserWindow): Tray {
const iconPath = path.join(__dirname, '../renderer/assets/icons/pixel_heart.png');
const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
tray = new Tray(icon);
tray.setToolTip('Long Distance — stay close');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Dock',
      click: () => toggleDockVisibility(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    toggleDockVisibility();
  });

  return tray;
}