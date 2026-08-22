import fs from 'node:fs';
import path from 'node:path';

const mockExposeInMainWorld = jest.fn();
const mockOn = jest.fn();
const mockRemoveListener = jest.fn();
const mockSend = jest.fn();

jest.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mockExposeInMainWorld },
  ipcRenderer: {
    on: mockOn,
    removeListener: mockRemoveListener,
    send: mockSend,
  },
}));

const operationId = '10000000-0000-4000-8000-000000000001';
const nonce = 'n'.repeat(43);
const validDocument = {
  operationId,
  nonce,
  title: 'Export title',
  document: { type: 'doc', version: 1 },
  mediaBaseUrl: 'notera-export-media://10000000-0000-4000-8000-000000000001',
  attachments: [],
};

function loadBridge(): Record<string, (...args: never[]) => unknown> {
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    require('../main/export-preload');
  });
  expect(mockExposeInMainWorld).toHaveBeenCalledWith(
    'noteraExport',
    expect.any(Object),
  );
  return mockExposeInMainWorld.mock.calls[0][1] as Record<
    string,
    (...args: never[]) => unknown
  >;
}

describe('export-only preload bridge', () => {
  beforeEach(() => {
    mockExposeInMainWorld.mockClear();
    mockOn.mockReset();
    mockRemoveListener.mockReset();
    mockSend.mockReset();
  });

  it('exposes exactly three fixed methods in its own world key', () => {
    const bridge = loadBridge();

    expect(Object.keys(bridge)).toEqual(['receiveDocument', 'ready', 'failed']);
    expect(bridge).not.toHaveProperty('ipcRenderer');
    expect(bridge).not.toHaveProperty('notera');
  });

  it('delivers the first valid document and releases the exact wrapper', () => {
    const bridge = loadBridge();
    const listener = jest.fn();
    const unsubscribe = bridge.receiveDocument(listener as never) as () => void;
    const [channel, wrapped] = mockOn.mock.calls[0];

    expect(channel).toBe('notera:export-render:document');
    wrapped({}, { ...validDocument, leakedPath: 'C:\\private' });
    expect(listener).not.toHaveBeenCalled();

    wrapped({}, validDocument);
    wrapped({}, validDocument);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(validDocument);
    expect(mockRemoveListener).toHaveBeenCalledWith(channel, wrapped);

    unsubscribe();
    expect(mockRemoveListener).toHaveBeenCalledTimes(1);
  });

  it('validates ready and failed payloads before fixed sends', () => {
    const bridge = loadBridge();

    bridge.ready({ operationId, nonce, lossyNodeCount: 1 } as never);
    bridge.ready({ operationId, nonce: 'short', lossyNodeCount: 0 } as never);
    bridge.failed({ operationId, nonce } as never);
    bridge.failed({ operationId, nonce, path: 'C:\\private' } as never);

    expect(mockSend.mock.calls).toEqual([
      ['notera:export-render:ready', { operationId, nonce, lossyNodeCount: 1 }],
      ['notera:export-render:failed', { operationId, nonce }],
    ]);
  });

  it('keeps internal channels out of the main preload', () => {
    const mainPreload = fs.readFileSync(
      path.join(process.cwd(), 'src/main/preload.ts'),
      'utf8',
    );
    expect(mainPreload).not.toContain('export-render:document');
    expect(mainPreload).not.toContain('noteraExport');
  });

  it('builds isolated renderer HTML and export preload entries', () => {
    const read = (name: string) =>
      fs.readFileSync(path.join(process.cwd(), '.erb/configs', name), 'utf8');
    const rendererDev = read('webpack.config.renderer.dev.ts');
    const rendererProd = read('webpack.config.renderer.prod.ts');
    const mainDev = read('webpack.config.main.dev.ts');
    const mainProd = read('webpack.config.main.prod.ts');
    const preloadDev = read('webpack.config.preload.dev.ts');

    for (const source of [rendererDev, rendererProd]) {
      expect(source).toContain("filename: 'export.html'");
      expect(source).toContain("chunks: ['renderer']");
      expect(source).toContain("chunks: ['export']");
      expect(source).toContain("'export/index.tsx'");
    }
    expect(rendererDev).toContain("filename: '[name].dev.js'");
    expect(rendererProd).toContain("filename: '[name].js'");

    for (const source of [mainDev, mainProd, preloadDev]) {
      expect(source).toContain("'export-preload'");
      expect(source).toContain("'export-preload.ts'");
    }
    expect(preloadDev).toContain("filename: '[name].js'");
  });
});
