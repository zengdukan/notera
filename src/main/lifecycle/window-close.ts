import { ApplicationError } from '@notera/application';

export interface CloseEventLike {
  preventDefault(): void;
}

export interface WindowCloseController {
  request(event: CloseEventLike): void;
  complete(input: {
    readonly requestId: string;
    readonly action: 'proceed' | 'cancel';
  }): void;
}

type CompleteCloseInput = Parameters<WindowCloseController['complete']>[0];

export function createWindowCloseController(input: {
  readonly publish: (payload: { readonly requestId: string }) => void;
  readonly close: () => void;
  readonly randomUUID: () => string;
}): WindowCloseController {
  let pendingRequestId: string | undefined;
  let allowNextClose = false;

  return Object.freeze({
    request(event: CloseEventLike): void {
      if (allowNextClose) {
        allowNextClose = false;
        return;
      }
      event.preventDefault();
      if (pendingRequestId !== undefined) return;
      pendingRequestId = input.randomUUID();
      input.publish({ requestId: pendingRequestId });
    },

    complete(value: CompleteCloseInput): void {
      if (pendingRequestId === undefined || value.requestId !== pendingRequestId) {
        throw new ApplicationError('INVALID_ENTITY_STATE');
      }
      pendingRequestId = undefined;
      if (value.action === 'cancel') return;
      allowNextClose = true;
      input.close();
    },
  });
}
