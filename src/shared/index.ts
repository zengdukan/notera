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
export * from './ipc/contracts/attachment';
export * from './ipc/contracts/content-tree';
export * from './ipc/contracts/batch';
export * from './ipc/contracts/favorite';
export * from './ipc/contracts/history';
export * from './ipc/contracts/note';
export * from './ipc/contracts/operation';
export * from './ipc/contracts/profile';
export * from './ipc/contracts/search';
export * from './ipc/contracts/tag';
export * from './ipc/contracts/trash';
export * from './ipc/contracts/export';
export * from './ipc/errors';
export * from './ipc/pagination';
