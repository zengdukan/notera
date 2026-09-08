import { z } from 'zod';

import { emptyObjectSchema, uuidSchema } from '../common';
import { defineEventContract, defineRequestContract } from '../contract';

export const appCloseRequested = defineEventContract({
  key: 'app.closeRequested',
  channel: 'notera:app:close-requested',
  payload: z.strictObject({ requestId: uuidSchema }),
});

export const appCompleteClose = defineRequestContract({
  key: 'app.completeClose',
  channel: 'notera:app:complete-close',
  request: z.strictObject({
    requestId: uuidSchema,
    action: z.enum(['proceed', 'cancel']),
  }),
  data: emptyObjectSchema,
  errors: ['INVALID_ENTITY_STATE', 'IPC_OPERATION_FAILED'],
});

export const appMinimizeWindow = defineRequestContract({
  key: 'app.minimizeWindow',
  channel: 'notera:app:minimize-window',
  request: emptyObjectSchema,
  data: emptyObjectSchema,
  errors: ['IPC_OPERATION_FAILED'],
});

export const appToggleMaximizeWindow = defineRequestContract({
  key: 'app.toggleMaximizeWindow',
  channel: 'notera:app:toggle-maximize-window',
  request: emptyObjectSchema,
  data: emptyObjectSchema,
  errors: ['IPC_OPERATION_FAILED'],
});

export const appCloseWindow = defineRequestContract({
  key: 'app.closeWindow',
  channel: 'notera:app:close-window',
  request: emptyObjectSchema,
  data: emptyObjectSchema,
  errors: ['IPC_OPERATION_FAILED'],
});

export const appContracts = {
  completeClose: appCompleteClose,
  minimizeWindow: appMinimizeWindow,
  toggleMaximizeWindow: appToggleMaximizeWindow,
  closeWindow: appCloseWindow,
} as const;
