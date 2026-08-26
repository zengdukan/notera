import path from 'node:path';

import { startElectronDemoMedia } from '../electron-lifecycle';

describe('Electron demo Media lifecycle', () => {
  it('starts on a dynamic loopback port under userData/media', async () => {
    const close = jest.fn(async () => undefined);
    const startServer = jest.fn(async () => ({
      apiBaseUrl: 'http://127.0.0.1:43125/api/media',
      close,
    }));

    const server = await startElectronDemoMedia({
      appDataRoot: 'D:\\Notera User Data',
      startServer,
    });

    expect(startServer).toHaveBeenCalledWith({
      dataRoot: path.join('D:\\Notera User Data', 'media'),
      host: '127.0.0.1',
      port: 0,
    });
    await server.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
