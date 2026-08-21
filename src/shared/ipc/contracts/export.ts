import { z } from 'zod';
import { uuidSchema } from '../common';
import { defineRequestContract } from '../contract';
import {
  exportFormatSchema,
  startOperationResultSchema,
} from './operation';

export const exportStartNote = defineRequestContract({
  key: 'export.startNote',
  channel: 'notera:export:start-note',
  request: z.strictObject({ noteId: uuidSchema, format: exportFormatSchema }),
  data: startOperationResultSchema,
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'BLOB_MISSING',
    'BLOB_CORRUPT',
    'EXPORT_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const exportContracts = { startNote: exportStartNote } as const;
