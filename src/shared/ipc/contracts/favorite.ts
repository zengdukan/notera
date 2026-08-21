import { z } from 'zod';
import { emptyObjectSchema, sortOrderSchema, uuidSchema } from '../common';
import { defineRequestContract } from '../contract';
import { cursorPageRequestSchema, cursorPageSchema } from '../pagination';
import { noteSummarySchema } from './content-tree';

export const favoriteNoteSchema = noteSummarySchema.extend({
  favoriteSortOrder: sortOrderSchema,
});

const favoriteMutationErrors = [
  'PROFILE_LOCKED',
  'ENTITY_NOT_FOUND',
  'SAVE_FAILED',
  'DISK_FULL',
  'IPC_OPERATION_FAILED',
] as const;

export const favoriteList = defineRequestContract({
  key: 'favorite.list',
  channel: 'notera:favorite:list',
  request: cursorPageRequestSchema,
  data: cursorPageSchema(favoriteNoteSchema),
  errors: ['PROFILE_LOCKED', 'INVALID_CURSOR', 'IPC_OPERATION_FAILED'],
});

export const favoriteAdd = defineRequestContract({
  key: 'favorite.add',
  channel: 'notera:favorite:add',
  request: z.strictObject({ noteId: uuidSchema }),
  data: emptyObjectSchema,
  errors: favoriteMutationErrors,
});

export const favoriteRemove = defineRequestContract({
  key: 'favorite.remove',
  channel: 'notera:favorite:remove',
  request: z.strictObject({ noteId: uuidSchema }),
  data: emptyObjectSchema,
  errors: favoriteMutationErrors,
});

export const favoriteReorder = defineRequestContract({
  key: 'favorite.reorder',
  channel: 'notera:favorite:reorder',
  request: z.strictObject({
    noteId: uuidSchema,
    beforeNoteId: uuidSchema.optional(),
  }),
  data: emptyObjectSchema,
  errors: favoriteMutationErrors,
});

export const favoriteContracts = {
  list: favoriteList,
  add: favoriteAdd,
  remove: favoriteRemove,
  reorder: favoriteReorder,
} as const;
