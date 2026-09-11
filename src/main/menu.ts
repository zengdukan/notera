import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';

export default class MenuBuilder {
  private readonly mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu(): Menu {
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

    const template: MenuItemConstructorOptions[] = [
      ...(process.platform === 'darwin'
        ? [
            {
              label: 'Notera',
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
      {
        label: 'File',
        submenu: [
          {
            label: 'Close',
            accelerator: 'CmdOrCtrl+W',
            click: () => this.mainWindow.close(),
          },
          {
            label: 'Quit',
            accelerator: 'CmdOrCtrl+Q',
            click: () => app.quit(),
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          ...(process.env.NODE_ENV === 'development'
            ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }]
            : []),
          { role: 'togglefullscreen' },
        ],
      },
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    return menu;
  }
}
