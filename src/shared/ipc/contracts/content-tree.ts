import { z } from 'zod';
import {
  contentVersionSchema,
  limitedUnicodeString,
  timestampSchema,
  uuidSchema,
} from '../common';
import { defineRequestContract } from '../contract';
import { cursorPageRequestSchema, cursorPageSchema } from '../pagination';

const folderNameSchema = limitedUnicodeString(255).refine(
  (value) => value.trim().length > 0,
  { message: 'Folder name cannot be blank.' },
);
export const noteTitleSchema = limitedUnicodeString(1000);
export const contentSortSchema = z.strictObject({
  field: z.enum(['CREATED_AT', 'UPDATED_AT', 'TITLE']),
  direction: z.enum(['ASC', 'DESC']),
});

export const entryRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('folder'), id: uuidSchema }),
  z.strictObject({ kind: z.literal('note'), id: uuidSchema }),
]);

export const folderSummarySchema = z.strictObject({
  kind: z.literal('folder'),
  id: uuidSchema,
  name: folderNameSchema,
  parentId: uuidSchema,
  updatedAt: timestampSchema,
  hasChildren: z.boolean(),
});

export const noteSummarySchema = z.strictObject({
  kind: z.literal('note'),
  id: uuidSchema,
  title: noteTitleSchema,
  folderId: uuidSchema,
  contentVersion: contentVersionSchema,
  updatedAt: timestampSchema,
});

export const treeEntrySummarySchema = z.discriminatedUnion('kind', [
  folderSummarySchema,
  noteSummarySchema,
]);

export const contentTreeListChildren = defineRequestContract({
  key: 'contentTree.listChildren',
  channel: 'notera:content-tree:list-children',
  request: cursorPageRequestSchema.extend({
    parentFolderId: uuidSchema,
    sort: contentSortSchema.optional(),
  }),
  data: cursorPageSchema(treeEntrySummarySchema),
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'INVALID_CURSOR',
    'IPC_OPERATION_FAILED',
  ],
});

export const folderPathItemSchema = z.strictObject({
  id: uuidSchema,
  name: noteTitleSchema,
});

export const contentTreeGetFolderPath = defineRequestContract({
  key: 'contentTree.getFolderPath',
  channel: 'notera:content-tree:get-folder-path',
  request: z.strictObject({ folderId: uuidSchema }),
  data: z.strictObject({
    items: z.array(folderPathItemSchema).min(1).max(1000),
  }),
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'DB_CORRUPT',
    'IPC_OPERATION_FAILED',
  ],
});

export const contentTreeCreateFolder = defineRequestContract({
  key: 'contentTree.createFolder',
  channel: 'notera:content-tree:create-folder',
  request: z.strictObject({
    parentFolderId: uuidSchema,
    name: folderNameSchema,
  }),
  data: folderSummarySchema,
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'INVALID_NAME',
    'PARENT_FOLDER_INVALID',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const contentTreeRenameFolder = defineRequestContract({
  key: 'contentTree.renameFolder',
  channel: 'notera:content-tree:rename-folder',
  request: z.strictObject({ folderId: uuidSchema, name: folderNameSchema }),
  data: folderSummarySchema,
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'INVALID_NAME',
    'ROOT_FOLDER_IMMUTABLE',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const contentTreeMoveFolder = defineRequestContract({
  key: 'contentTree.moveFolder',
  channel: 'notera:content-tree:move-folder',
  request: z.strictObject({ folderId: uuidSchema, targetParentId: uuidSchema }),
  data: folderSummarySchema,
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'FOLDER_CYCLE',
    'ROOT_FOLDER_IMMUTABLE',
    'PARENT_FOLDER_INVALID',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

const trashResultSchema = z.strictObject({ trashEntryId: uuidSchema });

export const contentTreeTrashFolder = defineRequestContract({
  key: 'contentTree.trashFolder',
  channel: 'notera:content-tree:trash-folder',
  request: z.strictObject({ folderId: uuidSchema }),
  data: trashResultSchema,
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'ROOT_FOLDER_IMMUTABLE',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const contentTreeContracts = {
  listChildren: contentTreeListChildren,
  getFolderPath: contentTreeGetFolderPath,
  createFolder: contentTreeCreateFolder,
  renameFolder: contentTreeRenameFolder,
  moveFolder: contentTreeMoveFolder,
  trashFolder: contentTreeTrashFolder,
} as const;
