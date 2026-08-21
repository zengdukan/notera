import { z } from 'zod';
import {
  limitedUnicodeString,
  timestampSchema,
  uuidSchema,
} from '../common';
import { defineEventContract, defineRequestContract } from '../contract';
import { ipcErrorSchema } from '../errors';

export const operationKindSchema = z.enum([
  'ATTACHMENT_IMPORT',
  'ATTACHMENT_SAVE_AS',
  'NOTE_EXPORT',
]);
export const operationStateSchema = z.enum([
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);
export const operationPhaseSchema = z.enum([
  'PREPARING',
  'READING',
  'ENCRYPTING',
  'WRITING',
  'RENDERING',
  'FINALIZING',
]);
export const exportFormatSchema = z.enum(['MARKDOWN', 'PDF']);

export const startOperationResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('cancelled') }),
  z.strictObject({ status: z.literal('started'), operationId: uuidSchema }),
]);

const operationAttachmentSummarySchema = z.strictObject({
  id: uuidSchema,
  fileName: limitedUnicodeString(255),
  mime: limitedUnicodeString(255),
  byteLength: z.number().int().min(0).max(100 * 1024 * 1024),
  localState: z.enum(['AVAILABLE', 'MISSING', 'CORRUPT']),
  previewable: z.boolean(),
  createdAt: timestampSchema,
});

export const exportReportSchema = z.strictObject({
  format: exportFormatSchema,
  attachmentCount: z.number().int().min(0),
  lossyNodeCount: z.number().int().min(0),
  completedAt: timestampSchema,
});

const runningOperationSchema = z.strictObject({
  operationId: uuidSchema,
  kind: operationKindSchema,
  state: z.literal('RUNNING'),
  phase: operationPhaseSchema,
  progress: z.number().finite().min(0).max(1).nullable(),
});

const importSucceededSchema = z.strictObject({
  operationId: uuidSchema,
  kind: z.literal('ATTACHMENT_IMPORT'),
  state: z.literal('SUCCEEDED'),
  result: z.strictObject({ attachment: operationAttachmentSummarySchema }),
});
const saveAsSucceededSchema = z.strictObject({
  operationId: uuidSchema,
  kind: z.literal('ATTACHMENT_SAVE_AS'),
  state: z.literal('SUCCEEDED'),
  result: z.strictObject({ completedAt: timestampSchema }),
});
const exportSucceededSchema = z.strictObject({
  operationId: uuidSchema,
  kind: z.literal('NOTE_EXPORT'),
  state: z.literal('SUCCEEDED'),
  result: z.strictObject({ report: exportReportSchema }),
});
const failedOperationSchema = z.strictObject({
  operationId: uuidSchema,
  kind: operationKindSchema,
  state: z.literal('FAILED'),
  error: ipcErrorSchema,
});
const cancelledOperationSchema = z.strictObject({
  operationId: uuidSchema,
  kind: operationKindSchema,
  state: z.literal('CANCELLED'),
});

export const operationTerminalStatusSchema = z.union([
  importSucceededSchema,
  saveAsSucceededSchema,
  exportSucceededSchema,
  failedOperationSchema,
  cancelledOperationSchema,
]);
export const operationStatusSchema = z.union([
  runningOperationSchema,
  operationTerminalStatusSchema,
]);

export const operationGetStatus = defineRequestContract({
  key: 'operation.getStatus',
  channel: 'notera:operation:get-status',
  request: z.strictObject({ operationId: uuidSchema }),
  data: operationStatusSchema,
  errors: ['PROFILE_LOCKED', 'OPERATION_NOT_FOUND', 'IPC_OPERATION_FAILED'],
});

export const operationCancel = defineRequestContract({
  key: 'operation.cancel',
  channel: 'notera:operation:cancel',
  request: z.strictObject({ operationId: uuidSchema }),
  data: operationStatusSchema,
  errors: ['PROFILE_LOCKED', 'OPERATION_NOT_FOUND', 'IPC_OPERATION_FAILED'],
});

export const profileLocked = defineEventContract({
  key: 'profile.locked',
  channel: 'notera:profile:locked',
  payload: z.strictObject({
    reason: z.enum([
      'MANUAL',
      'SWITCHED',
      'SYSTEM_LOCK',
      'SYSTEM_SUSPEND',
      'IDLE_TIMEOUT',
      'SESSION_CLOSED',
    ]),
  }),
});

export const operationProgress = defineEventContract({
  key: 'operation.progress',
  channel: 'notera:operation:progress',
  payload: runningOperationSchema.omit({ state: true }),
});

export const operationCompleted = defineEventContract({
  key: 'operation.completed',
  channel: 'notera:operation:completed',
  payload: operationTerminalStatusSchema,
});

export const operationContracts = {
  getStatus: operationGetStatus,
  cancel: operationCancel,
} as const;
