import type { WindowCloseController } from '../lifecycle/window-close';
import { defineIpcBinding, type IpcBinding } from './router';

// IPC binding factories are named consistently for registry composition.
// eslint-disable-next-line import/prefer-default-export
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
