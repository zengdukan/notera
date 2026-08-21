import { z } from 'zod';

export const cursorPageRequestSchema = z.strictObject({
  cursor: z.string().min(1).max(4096).optional(),
  limit: z.number().int().min(1).max(100),
});

export function cursorPageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.strictObject({
    items: z.array(itemSchema),
    nextCursor: z.string().min(1).max(4096).optional(),
  });
}
