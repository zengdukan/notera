import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

import { createProfileManager, type ProfileManager } from '@notera/application';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  powerMonitor,
  protocol,
  shell,
  type BrowserWindowConstructorOptions,
} from 'electron';

import MenuBuilder from './menu';
import { startElectronMediaAdapter } from './media-adapter/electron-lifecycle';
import type { MediaAdapterServer } from './media-adapter/server';
import { createMainRuntime, type MainRuntime } from './runtime';
import { createMediaApiArgument } from '../shared/atlassian-editor/media-runtime';
import { resolveHtmlPath } from './util';
import { createSecureWindow } from './window';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'notera-media',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
  {
    scheme: 'notera-export-media',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
]);

let mainWindow: BrowserWindow | undefined;
let runtime: MainRuntime | undefined;
let manager: ProfileManager | undefined;
let mediaAdapter: MediaAdapterServer | undefined;
let shutdown: Promise<void> | undefined;
let exitAllowed = false;

function fixedLog(code: string): void {
  process.stderr.write(`[Notera] ${code}\n`);
}

async function start(): Promise<void> {
  const appDataRoot = app.getPath('userData');
  const preloadPath = app.isPackaged
    ? path.join(__dirname, 'preload.js')
    : path.join(__dirname, '../../.erb/dll/preload.js');
  const exportPreloadPath = app.isPackaged
    ? path.join(__dirname, 'export-preload.js')
    : path.join(__dirname, '../../.erb/dll/export-preload.js');
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(__dirname, '../../assets/icon.png');
  const entryUrl = resolveHtmlPath('index.html');
  const exportPageUrl = resolveHtmlPath('export.html');
  manager = await createProfileManager({ appDataRoot });
  mediaAdapter = await startElectronMediaAdapter({
    manager,
    allowedOrigin: new URL(entryUrl).origin,
    randomBytes: () => randomBytes(32),
    randomUUID,
    now: Date.now,
  });
  mainWindow = createSecureWindow({
    factory: {
      create: (options) =>
        new BrowserWindow(options as BrowserWindowConstructorOptions),
    },
    shell,
    preloadPath,
    entryUrl,
    iconPath,
    additionalArguments: [createMediaApiArgument(mediaAdapter.apiBaseUrl)],
  }) as BrowserWindow;
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
  new MenuBuilder(mainWindow).buildMenu();

  runtime = await createMainRuntime({
    appDataRoot,
    window: mainWindow,
    profileManager: manager,
    sessionMedia: mediaAdapter,
    electron: {
      createProfileManager,
      ipcMain,
      protocol,
      exportWindowFactory: {
        create: (options) =>
          new BrowserWindow(options as BrowserWindowConstructorOptions),
      },
      exportPreloadPath,
      exportPageUrl,
      dialogs: {
        async chooseImportPath() {
          if (mainWindow === undefined) return null;
          const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
          });
          return result.canceled ? null : (result.filePaths[0] ?? null);
        },
        async chooseSavePath() {
          if (mainWindow === undefined) return null;
          const result = await dialog.showSaveDialog(mainWindow, {});
          return result.canceled ? null : (result.filePath ?? null);
        },
        async chooseExportPath({ suggestedName, extension }) {
          if (mainWindow === undefined) return null;
          const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: suggestedName,
            filters: [
              {
                name: extension.toUpperCase(),
                extensions: [extension],
              },
            ],
          });
          return result.canceled ? null : (result.filePath ?? null);
        },
      },
      powerMonitor,
      scheduler: {
        setInterval: (callback, milliseconds) =>
          global.setInterval(callback, milliseconds),
        clearInterval: (handle) =>
          global.clearInterval(handle as ReturnType<typeof setInterval>),
        setTimeout: (callback, milliseconds) =>
          global.setTimeout(callback, milliseconds),
        clearTimeout: (handle) =>
          global.clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      confirmation: {
        async confirmRemove() {
          if (mainWindow === undefined) return false;
          const result = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Remove profile',
            message: 'Remove this profile from this device?',
            buttons: ['Remove', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            noLink: true,
          });
          return result.response === 0;
        },
      },
      logger: { error: fixedLog },
      randomUUID,
      randomBytes: () => randomBytes(32),
      now: Date.now,
    },
  });
  await runtime.start();
}

app.on('before-quit', (event) => {
  if (exitAllowed) return;
  event.preventDefault();
  if (shutdown !== undefined) return;
  shutdown = Promise.all([
    Promise.resolve(runtime?.close()).catch(() => undefined),
    Promise.resolve(mediaAdapter?.close()).catch(() => undefined),
    runtime === undefined
      ? Promise.resolve(manager?.close()).catch(() => undefined)
      : Promise.resolve(),
  ]).then(() => {
    exitAllowed = true;
    app.exit(0);
    return undefined;
  });
});

app.on('window-all-closed', () => app.quit());

app
  .whenReady()
  .then(start)
  .catch(async () => {
    await Promise.all([
      Promise.resolve(mediaAdapter?.close()).catch(() => undefined),
      Promise.resolve(manager?.close()).catch(() => undefined),
    ]);
    fixedLog('START_FAILED');
    app.exit(1);
  });
