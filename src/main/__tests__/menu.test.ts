import { Menu } from 'electron';

import MenuBuilder from '../menu';

const buildFromTemplate = Menu.buildFromTemplate as jest.Mock;
const setApplicationMenu = Menu.setApplicationMenu as jest.Mock;

jest.mock('electron', () => ({
  Menu: {
    buildFromTemplate: jest.fn(),
    setApplicationMenu: jest.fn(),
  },
}));

describe('frameless application menu', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    buildFromTemplate.mockReset();
    setApplicationMenu.mockReset();
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('removes the application menu outside development', () => {
    process.env.NODE_ENV = 'production';
    const mainWindow = {
      webContents: { on: jest.fn() },
    };

    expect(new MenuBuilder(mainWindow as never).buildMenu()).toBeNull();
    expect(setApplicationMenu).toHaveBeenCalledWith(null);
    expect(buildFromTemplate).not.toHaveBeenCalled();
    expect(mainWindow.webContents.on).not.toHaveBeenCalled();
  });

  it('keeps only hidden reload and DevTools roles in development', () => {
    process.env.NODE_ENV = 'development';
    const menu = { items: [] };
    buildFromTemplate.mockReturnValue(menu);
    const mainWindow = {
      webContents: { on: jest.fn() },
    };

    expect(new MenuBuilder(mainWindow as never).buildMenu()).toBe(menu);
    expect(buildFromTemplate).toHaveBeenCalledWith([
      { role: 'reload', visible: false },
      { role: 'toggleDevTools', visible: false },
    ]);
    expect(setApplicationMenu).toHaveBeenCalledWith(menu);
  });

  it('retains the development Inspect Element context menu', () => {
    process.env.NODE_ENV = 'development';
    const popup = jest.fn();
    buildFromTemplate
      .mockReturnValueOnce({ items: [] })
      .mockReturnValueOnce({ popup });
    let openContextMenu:
      | ((event: unknown, properties: { x: number; y: number }) => void)
      | undefined;
    const mainWindow = {
      webContents: {
        on: jest.fn((event, listener) => {
          if (event === 'context-menu') openContextMenu = listener;
        }),
        inspectElement: jest.fn(),
      },
    };
    new MenuBuilder(mainWindow as never).buildMenu();

    openContextMenu?.({}, { x: 10, y: 20 });
    const contextTemplate = buildFromTemplate.mock.calls[1]?.[0];
    contextTemplate[0].click();

    expect(mainWindow.webContents.inspectElement).toHaveBeenCalledWith(10, 20);
    expect(popup).toHaveBeenCalledWith({ window: mainWindow });
  });
});
