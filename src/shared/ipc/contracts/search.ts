import { z } from 'zod';
import { limitedUnicodeString, timestampSchema, uuidSchema } from '../common';
import { defineRequestContract } from '../contract';
import { cursorPageRequestSchema, cursorPageSchema } from '../pagination';
import { folderPathItemSchema } from './content-tree';

export const highlightRangeSchema = z.strictObject({
  field: z.enum(['title', 'excerpt']),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
});

const searchResultBaseSchema = z.strictObject({
  noteId: uuidSchema,
  title: limitedUnicodeString(1000),
  excerpt: limitedUnicodeString(2000),
  folderPath: z.array(folderPathItemSchema).min(1).max(1000),
  updatedAt: timestampSchema,
  highlights: z.array(highlightRangeSchema).max(1000),
});

export const searchResultSchema = searchResultBaseSchema.superRefine(
  (result, context) => {
    const fieldOrder = { title: 0, excerpt: 1 } as const;
    let previousField = -1;
    let previousEnd = -1;

    result.highlights.forEach((range, index) => {
      const currentField = fieldOrder[range.field];
      const { length } = Array.from(result[range.field]);
      const ordered =
        currentField > previousField ||
        (currentField === previousField && range.start >= previousEnd);
      if (range.start >= range.end || range.end > length || !ordered) {
        context.addIssue({
          code: 'custom',
          path: ['highlights', index],
          message: 'Highlight ranges must be ordered, disjoint and in bounds.',
        });
      }
      previousField = currentField;
      previousEnd = range.end;
    });
  },
);

const querySchema = limitedUnicodeString(500).refine(
  (value) => value.trim().length > 0,
  { message: 'Search query cannot be blank.' },
);

export const searchQuery = defineRequestContract({
  key: 'search.query',
  channel: 'notera:search:query',
  request: cursorPageRequestSchema.extend({
    query: querySchema,
    folderId: uuidSchema.optional(),
  }),
  data: cursorPageSchema(searchResultSchema),
  errors: [
    'PROFILE_LOCKED',
    'ENTITY_NOT_FOUND',
    'INVALID_CURSOR',
    'IPC_OPERATION_FAILED',
  ],
});

export const searchContracts = { query: searchQuery } as const;
