import fs from 'node:fs';
import path from 'node:path';
import { ipcFailure } from '../shared';
import type { NoteraApi } from '../shared/ipc/api';

const mockExposeInMainWorld = jest.fn();
const mockInvoke = jest.fn();
const mockOn = jest.fn();
const mockRemoveListener = jest.fn();

jest.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mockExposeInMainWorld },
  ipcRenderer: {
    invoke: mockInvoke,
    on: mockOn,
    removeListener: mockRemoveListener,
  },
}));

function loadPreload(): NoteraApi {
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    require('../main/preload');
  });
  expect(mockExposeInMainWorld).toHaveBeenCalledTimes(2);
  expect(mockExposeInMainWorld).toHaveBeenCalledWith(
    'notera',
    expect.any(Object),
  );
  return mockExposeInMainWorld.mock.calls.find(
    ([name]) => name === 'notera',
  )?.[1] as NoteraApi;
}

describe('validated preload bridge', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    process.argv = [
      'electron',
      '--atlassian-editor-media-api-base-url=http://127.0.0.1:43125/api/media',
    ];
    mockExposeInMainWorld.mockClear();
    mockInvoke.mockReset();
    mockOn.mockReset();
    mockRemoveListener.mockReset();
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  it('exposes only the validated read-only Atlassian Editor runtime address', () => {
    loadPreload();

    expect(mockExposeInMainWorld).toHaveBeenCalledWith(
      'atlassianEditor',
      Object.freeze({
        mediaApiBaseUrl: 'http://127.0.0.1:43125/api/media',
      }),
    );
  });

  it('exposes only the named Notera business modules', () => {
    const api = loadPreload();

    expect(Object.keys(api)).toEqual([
      'profile',
      'contentTree',
      'note',
      'tag',
      'favorite',
      'batch',
      'history',
      'trash',
      'search',
      'attachment',
      'export',
      'operation',
      'settings',
      'app',
      'events',
    ]);
    expect(api).not.toHaveProperty('ipcRenderer');
    expect(api).not.toHaveProperty('sendMessage');
  });

  it('invokes a fixed channel with parsed request data', async () => {
    mockInvoke.mockResolvedValue({
      ret: true,
      data: { items: [], nextCursor: 'next' },
    });
    const api = loadPreload();

    await expect(api.profile.list({ limit: 10 })).resolves.toEqual({
      ret: true,
      data: { items: [], nextCursor: 'next' },
    });
    expect(mockInvoke).toHaveBeenCalledWith('notera:profile:list', {
      limit: 10,
    });
  });

  it('exposes history rename through its fixed contract channel', async () => {
    const versionId = '10000000-0000-4000-8000-000000000001';
    const noteId = '20000000-0000-4000-8000-000000000002';
    mockInvoke.mockResolvedValue({
      ret: true,
      data: {
        versionId,
        noteId,
        displayTitle: 'Version',
        createdAt: 1,
        kind: 'USER',
        protectionReason: null,
        versionName: null,
      },
    });
    const api = loadPreload();

    await expect(
      api.history.rename({ noteId, versionId, versionName: null }),
    ).resolves.toMatchObject({ ret: true });
    expect(mockInvoke).toHaveBeenCalledWith('notera:history:rename', {
      noteId,
      versionId,
      versionName: null,
    });
  });

  it('rejects invalid input before invoking Electron', async () => {
    const api = loadPreload();

    await expect(api.note.get({ noteId: 'private title' })).resolves.toEqual(
      ipcFailure('INVALID_IPC_REQUEST'),
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('replaces invalid responses and Electron rejections with fixed errors', async () => {
    const api = loadPreload();
    mockInvoke.mockResolvedValueOnce({
      ret: true,
      data: { items: [], leakedPath: 'C:\\secret' },
    });
    await expect(api.profile.list({ limit: 10 })).resolves.toEqual(
      ipcFailure('INVALID_IPC_RESPONSE'),
    );

    mockInvoke.mockRejectedValueOnce(new Error('C:\\private\\vault.db'));
    await expect(api.profile.list({ limit: 10 })).resolves.toEqual(
      ipcFailure('IPC_OPERATION_FAILED'),
    );
  });

  it('validates event payloads and removes the identical wrapper listener', () => {
    const listener = jest.fn();
    const api = loadPreload();
    const unsubscribe = api.events.onProfileLocked(listener);
    const [channel, wrapped] = mockOn.mock.calls[0];

    expect(channel).toBe('notera:profile:locked');
    wrapped({ sender: 'electron' }, { reason: 'SYSTEM_LOCK' });
    wrapped({ sender: 'electron' }, { reason: 'UNKNOWN', path: 'C:\\secret' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ reason: 'SYSTEM_LOCK' });

    unsubscribe();
    expect(mockRemoveListener).toHaveBeenCalledWith(channel, wrapped);
  });

  it('removes the ipc-example boilerplate from main and renderer startup', () => {
    const mainSource = fs.readFileSync(
      path.join(process.cwd(), 'src/main/main.ts'),
      'utf8',
    );
    const rendererSource = fs.readFileSync(
      path.join(process.cwd(), 'src/renderer/index.tsx'),
      'utf8',
    );

    expect(mainSource).not.toContain('ipc-example');
    expect(rendererSource).not.toContain('ipc-example');
  });

  it('removes boilerplate updaters, logging, and help links', () => {
    const mainSource = fs.readFileSync(
      path.join(process.cwd(), 'src/main/main.ts'),
      'utf8',
    );
    const menuSource = fs.readFileSync(
      path.join(process.cwd(), 'src/main/menu.ts'),
      'utf8',
    );
    const packageJson = fs.readFileSync(
      path.join(process.cwd(), 'package.json'),
      'utf8',
    );
    const combined = `${mainSource}\n${menuSource}\n${packageJson}`;

    expect(combined).not.toContain('AppUpdater');
    expect(combined).not.toContain('electron-updater');
    expect(combined).not.toContain('electron-log');
    expect(combined).not.toContain('Electron Boilerplate Help');
    expect(menuSource).not.toContain('electronjs.org');
    expect(menuSource).not.toContain('github.com/electron');
  });
});
