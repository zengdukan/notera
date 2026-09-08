import {
  Menu,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron';

export default class MenuBuilder {
  private readonly mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu(): Menu | null {
    if (process.env.NODE_ENV === 'development') {
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

    if (process.env.NODE_ENV !== 'development') {
      Menu.setApplicationMenu(null);
      return null;
    }

    const template: MenuItemConstructorOptions[] = [
      { role: 'reload', visible: false },
      { role: 'toggleDevTools', visible: false },
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    return menu;
  }
}
