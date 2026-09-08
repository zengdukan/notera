import type { WindowCloseController } from '../lifecycle/window-close';
import { defineIpcBinding, type IpcBinding } from './router';

export interface AppWindowPort {
  close(): void;
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  isMaximized(): boolean;
}

// IPC binding factories are named consistently for registry composition.
// eslint-disable-next-line import/prefer-default-export
export function createAppBindings(input: {
  readonly closeController: Pick<WindowCloseController, 'complete'>;
  readonly window: AppWindowPort;
}): readonly IpcBinding[] {
  return Object.freeze([
    defineIpcBinding('app.completeClose', async (value) => {
      input.closeController.complete(value);
      return {};
    }),
    defineIpcBinding('app.minimizeWindow', () => {
      input.window.minimize();
      return {};
    }),
    defineIpcBinding('app.toggleMaximizeWindow', () => {
      if (input.window.isMaximized()) input.window.unmaximize();
      else input.window.maximize();
      return {};
    }),
    defineIpcBinding('app.closeWindow', () => {
      input.window.close();
      return {};
    }),
  ]);
}
