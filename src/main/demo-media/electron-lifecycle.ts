import path from 'node:path';

import { startDemoMediaServer, type DemoMediaServer } from './server';

type StartServer = typeof startDemoMediaServer;

export function startElectronDemoMedia(input: {
  readonly appDataRoot: string;
  readonly startServer?: StartServer;
}): Promise<DemoMediaServer> {
  return (input.startServer ?? startDemoMediaServer)({
    dataRoot: path.join(input.appDataRoot, 'media'),
    host: '127.0.0.1',
    port: 0,
  });
}
