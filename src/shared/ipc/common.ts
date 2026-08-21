import { z } from 'zod';
import {
  ipcErrorSchema,
  IPC_ERROR_MESSAGES,
  type IpcError,
  type IpcErrorCode,
} from './errors';

export type IpcResponse<T> =
  | { readonly ret: true; readonly data: T }
  | { readonly ret: false; readonly error: IpcError };

export type IpcFailure = Extract<IpcResponse<never>, { readonly ret: false }>;

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const emptyObjectSchema = z.strictObject({});
export const uuidSchema = z.string().regex(CANONICAL_UUID);
export const timestampSchema = z.number().int().safe().min(0);
export const contentVersionSchema = z.number().int().safe().min(1);
export const sortOrderSchema = z.number().int().safe().min(0);

export function limitedUnicodeString(maxCodePoints: number): z.ZodString {
  if (!Number.isSafeInteger(maxCodePoints) || maxCodePoints < 0) {
    throw new TypeError('The Unicode length limit must be a safe integer.');
  }

  return z
    .string()
    .refine((value) => Array.from(value).length <= maxCodePoints, {
      message: `String must contain at most ${maxCodePoints} Unicode code points.`,
    });
}

export function ipcFailure(code: IpcErrorCode): IpcFailure {
  return {
    ret: false,
    error: { code, message: IPC_ERROR_MESSAGES[code] },
  };
}

export function createIpcResponseSchema<T extends z.ZodType>(
  dataSchema: T,
  allowedErrors: readonly IpcErrorCode[],
): z.ZodType<IpcResponse<z.output<T>>> {
  const allowed = new Set<IpcErrorCode>(allowedErrors);
  const allowedErrorSchema = ipcErrorSchema.superRefine((error, context) => {
    if (!allowed.has(error.code)) {
      context.addIssue({
        code: 'custom',
        message: 'The error code is not allowed for this request.',
      });
    }
  });
  const schema = z.union([
    z.strictObject({ ret: z.literal(true), data: dataSchema }),
    z.strictObject({ ret: z.literal(false), error: allowedErrorSchema }),
  ]);

  return schema as z.ZodType<IpcResponse<z.output<T>>>;
}
