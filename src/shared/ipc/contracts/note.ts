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

const tagNameSchema = limitedUnicodeString(100).refine(
  (value) => value.trim().length > 0,
  { message: 'Tag name cannot be blank.' },
);

export const tagSummarySchema = z.strictObject({
  id: uuidSchema,
  name: tagNameSchema,
  updatedAt: timestampSchema,
});

export const noteDetailSchema = noteSummarySchema.extend({
  document: adfDocumentSchema,
  createdAt: timestampSchema,
  isFavorite: z.boolean(),
  tags: z.array(tagSummarySchema).max(1000),
});

const noteMutationErrors = [
  'PROFILE_LOCKED',
  'ENTITY_NOT_FOUND',
  'PARENT_FOLDER_INVALID',
  'SAVE_FAILED',
  'DISK_FULL',
  'IPC_OPERATION_FAILED',
] as const;

export const noteCreate = defineRequestContract({
  key: 'note.create',
  channel: 'notera:note:create',
  request: z.strictObject({
    folderId: uuidSchema,
    title: noteTitleSchema.optional(),
  }),
  data: noteDetailSchema,
  errors: noteMutationErrors,
});

export const noteGet = defineRequestContract({
  key: 'note.get',
  channel: 'notera:note:get',
  request: z.strictObject({ noteId: uuidSchema }),
  data: noteDetailSchema,
  errors: ['PROFILE_LOCKED', 'ENTITY_NOT_FOUND', 'IPC_OPERATION_FAILED'],
});

export const noteRename = defineRequestContract({
  key: 'note.rename',
  channel: 'notera:note:rename',
  request: z.strictObject({ noteId: uuidSchema, title: noteTitleSchema }),
  data: noteSummarySchema,
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'CONTENT_VERSION_OVERFLOW',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const saveDraftResultSchema = z.strictObject({
  noteId: uuidSchema,
  contentVersion: contentVersionSchema,
  savedAt: timestampSchema,
});

export const noteSaveDraft = defineRequestContract({
  key: 'note.saveDraft',
  channel: 'notera:note:save-draft',
  request: z.strictObject({
    noteId: uuidSchema,
    title: noteTitleSchema,
    document: adfDocumentSchema,
  }),
  data: saveDraftResultSchema,
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'CONTENT_VERSION_OVERFLOW',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const noteMove = defineRequestContract({
  key: 'note.move',
  channel: 'notera:note:move',
  request: z.strictObject({ noteId: uuidSchema, targetFolderId: uuidSchema }),
  data: noteSummarySchema,
  errors: noteMutationErrors,
});

export const noteCopy = defineRequestContract({
  key: 'note.copy',
  channel: 'notera:note:copy',
  request: z.strictObject({ noteId: uuidSchema, targetFolderId: uuidSchema }),
  data: noteSummarySchema,
  errors: noteMutationErrors,
});

export const noteTrash = defineRequestContract({
  key: 'note.trash',
  channel: 'notera:note:trash',
  request: z.strictObject({ noteId: uuidSchema }),
  data: z.strictObject({ trashEntryId: uuidSchema }),
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const noteListRecent = defineRequestContract({
  key: 'note.listRecent',
  channel: 'notera:note:list-recent',
  request: cursorPageRequestSchema,
  data: cursorPageSchema(noteSummarySchema),
  errors: ['PROFILE_LOCKED', 'INVALID_CURSOR', 'IPC_OPERATION_FAILED'],
});

export const noteContracts = {
  create: noteCreate,
  get: noteGet,
  rename: noteRename,
  saveDraft: noteSaveDraft,
  move: noteMove,
  copy: noteCopy,
  trash: noteTrash,
  listRecent: noteListRecent,
} as const;
