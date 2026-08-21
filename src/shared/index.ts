export type Channels = 'ipc-example';

export interface ElectronHandler {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]): void;
    on(channel: Channels, func: (...args: unknown[]) => void): () => void;
    once(channel: Channels, func: (...args: unknown[]) => void): void;
  };
}

export * from './ipc/adf';
export * from './ipc/common';
export * from './ipc/contract';
export * from './ipc/errors';
export * from './ipc/pagination';
