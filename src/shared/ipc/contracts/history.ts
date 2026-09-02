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
import { noteSummarySchema, noteTitleSchema } from './content-tree';

export const versionKindSchema = z.enum(['USER', 'SYSTEM_PROTECTION']);
const protectionReasonSchema = z.enum([
  'BEFORE_HISTORY_RESTORE',
  'BEFORE_MIGRATION',
]);
const versionNameSchema = limitedUnicodeString(100).refine(
  (value) => value.trim().length > 0,
  { message: 'Version name cannot be blank.' },
);
export const versionRefSchema = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('CURRENT') }),
  z.strictObject({ source: z.literal('VERSION'), versionId: uuidSchema }),
]);

const historySummaryBase = {
  versionId: uuidSchema,
  noteId: uuidSchema,
  displayTitle: limitedUnicodeString(1000),
  createdAt: timestampSchema,
} as const;

export const historySummarySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...historySummaryBase,
    kind: z.literal('USER'),
    protectionReason: z.null(),
    versionName: versionNameSchema.nullable(),
  }),
  z.strictObject({
    ...historySummaryBase,
    kind: z.literal('SYSTEM_PROTECTION'),
    protectionReason: protectionReasonSchema,
    versionName: z.null(),
  }),
]);

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
  'INVALID_NAME',
  'INVALID_ENTITY_STATE',
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
  request: z.strictObject({
    noteId: uuidSchema,
    versionName: versionNameSchema.optional(),
  }),
  data: historySummarySchema,
  errors: historyMutationErrors,
});

export const historyRename = defineRequestContract({
  key: 'history.rename',
  channel: 'notera:history:rename',
  request: z.strictObject({
    noteId: uuidSchema,
    versionId: uuidSchema,
    versionName: versionNameSchema.nullable(),
  }),
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
    title: noteTitleSchema.refine((value) => value.trim().length > 0, {
      message: 'Note title cannot be blank.',
    }),
  }),
  data: noteSummarySchema,
  errors: [...historyMutationErrors, 'PARENT_FOLDER_INVALID'],
});

export const historyContracts = {
  list: historyList,
  get: historyGet,
  createPermanent: historyCreatePermanent,
  rename: historyRename,
  compare: historyCompare,
  restore: historyRestore,
  copy: historyCopy,
} as const;
