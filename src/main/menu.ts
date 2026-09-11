import { BrowserWindow, globalShortcut, Menu } from 'electron';

export default class MenuBuilder {
  private readonly mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu(): void {
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true'
    ) {
      this.mainWindow.webContents.on('context-menu', (_event, properties) => {
        Menu.buildFromTemplate([
          {
            label: 'Inspect element',
            click: () =>
              this.mainWindow.webContents.inspectElement(
                properties.x,
                properties.y,
              ),
          },
        ]).popup({ window: this.mainWindow });
      });
    }

    Menu.setApplicationMenu(null);

    if (process.env.NODE_ENV === 'development') {
      globalShortcut.register('CmdOrCtrl+R', () => {
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.reload();
        }
      });
      globalShortcut.register('CmdOrCtrl+Shift+I', () => {
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.toggleDevTools();
        }
      });
      this.mainWindow.on('closed', () => {
        globalShortcut.unregister('CmdOrCtrl+R');
        globalShortcut.unregister('CmdOrCtrl+Shift+I');
      });
    }
  }
}