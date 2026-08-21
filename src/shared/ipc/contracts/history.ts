import { z } from 'zod';
import { adfDocumentSchema } from '../adf';
import {
  contentVersionSchema,
  limitedUnicodeString,
  timestampSchema,
  uuidSchema,
} from '../common';
import { defineRequestContract } from '../contract';
import { cursorPageRequestSchema, cursorPageSchema } from '../pagination';
import { noteSummarySchema } from './content-tree';

export const versionKindSchema = z.enum(['USER', 'SYSTEM_PROTECTION']);
export const versionRefSchema = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('CURRENT') }),
  z.strictObject({ source: z.literal('VERSION'), versionId: uuidSchema }),
]);

export const historySummarySchema = z.strictObject({
  versionId: uuidSchema,
  noteId: uuidSchema,
  kind: versionKindSchema,
  displayTitle: limitedUnicodeString(1000),
  createdAt: timestampSchema,
});

export const historySnapshotSchema = z.strictObject({
  ref: versionRefSchema,
  noteId: uuidSchema,
  title: limitedUnicodeString(1000),
  document: adfDocumentSchema,
  createdAt: timestampSchema,
});

const historyMutationErrors = [
  'PROFILE_LOCKED',
  'ENTITY_NOT_FOUND',
  'VERSION_NOTE_MISMATCH',
  'SAVE_FAILED',
  'DISK_FULL',
  'IPC_OPERATION_FAILED',
] as const;

export const historyList = defineRequestContract({
  key: 'history.list',
  channel: 'notera:history:list',
  request: cursorPageRequestSchema.extend({ noteId: uuidSchema }),
  data: cursorPageSchema(historySummarySchema),
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'INVALID_CURSOR',
    'IPC_OPERATION_FAILED',
  ],
});

export const historyGet = defineRequestContract({
  key: 'history.get',
  channel: 'notera:history:get',
  request: z.strictObject({ noteId: uuidSchema, versionId: uuidSchema }),
  data: historySnapshotSchema,
  errors: historyMutationErrors,
});

export const historyCreatePermanent = defineRequestContract({
  key: 'history.createPermanent',
  channel: 'notera:history:create-permanent',
  request: z.strictObject({ noteId: uuidSchema }),
  data: historySummarySchema,
  errors: historyMutationErrors,
});

export const historyCompare = defineRequestContract({
  key: 'history.compare',
  channel: 'notera:history:compare',
  request: z.strictObject({
    noteId: uuidSchema,
    left: versionRefSchema,
    right: versionRefSchema,
  }),
  data: z.strictObject({
    left: historySnapshotSchema,
    right: historySnapshotSchema,
  }),
  errors: historyMutationErrors,
});

export const historyRestore = defineRequestContract({
  key: 'history.restore',
  channel: 'notera:history:restore',
  request: z.strictObject({
    noteId: uuidSchema,
    versionId: uuidSchema,
    expectedContentVersion: contentVersionSchema,
  }),
  data: z.strictObject({
    noteId: uuidSchema,
    contentVersion: contentVersionSchema,
    protectionVersionId: uuidSchema,
  }),
  errors: [
    ...historyMutationErrors,
    'CONTENT_VERSION_CONFLICT',
    'CONTENT_VERSION_OVERFLOW',
  ],
});

export const historyCopy = defineRequestContract({
  key: 'history.copy',
  channel: 'notera:history:copy',
  request: z.strictObject({
    noteId: uuidSchema,
    versionId: uuidSchema,
    targetFolderId: uuidSchema,
  }),
  data: noteSummarySchema,
  errors: [...historyMutationErrors, 'PARENT_FOLDER_INVALID'],
});

export const historyContracts = {
  list: historyList,
  get: historyGet,
  createPermanent: historyCreatePermanent,
  compare: historyCompare,
  restore: historyRestore,
  copy: historyCopy,
} as const;
