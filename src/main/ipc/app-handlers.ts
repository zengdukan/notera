import type { WindowCloseController } from '../lifecycle/window-close';
import { defineIpcBinding, type IpcBinding } from './router';

export function createAppBindings(input: {
  readonly closeController: Pick<WindowCloseController, 'complete'>;
}): readonly IpcBinding[] {
  return Object.freeze([
    defineIpcBinding('app.completeClose', async (value) => {
      input.closeController.complete(value);
      return {};
    }),
  ]);
}
