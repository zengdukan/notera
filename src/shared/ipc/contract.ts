import { z } from 'zod';
import {
  createIpcResponseSchema,
  ipcFailure,
  type IpcResponse,
} from './common';
import type { IpcErrorCode } from './errors';

export interface RequestContract<
  Key extends string,
  Request extends z.ZodType,
  Data extends z.ZodType,
> {
  readonly key: Key;
  readonly channel: `notera:${string}`;
  readonly request: Request;
  readonly data: Data;
  readonly response: z.ZodType<IpcResponse<z.output<Data>>>;
  readonly errors: readonly IpcErrorCode[];
}

export interface EventContract<Key extends string, Payload extends z.ZodType> {
  readonly key: Key;
  readonly channel: `notera:${string}`;
  readonly payload: Payload;
}

export function defineRequestContract<
  const Key extends string,
  Request extends z.ZodType,
  Data extends z.ZodType,
>(input: {
  readonly key: Key;
  readonly channel: `notera:${string}`;
  readonly request: Request;
  readonly data: Data;
  readonly errors: readonly IpcErrorCode[];
}): RequestContract<Key, Request, Data> {
  return Object.freeze({
    ...input,
    response: createIpcResponseSchema(input.data, input.errors),
  });
}

export function defineEventContract<
  const Key extends string,
  Payload extends z.ZodType,
>(input: {
  readonly key: Key;
  readonly channel: `notera:${string}`;
  readonly payload: Payload;
}): EventContract<Key, Payload> {
  return Object.freeze(input);
}

export function parseRequest<T>(
  contract: { readonly request: z.ZodType<T> },
  value: unknown,
): IpcResponse<T> {
  const result = contract.request.safeParse(value);
  return result.success
    ? { ret: true, data: result.data }
    : ipcFailure('INVALID_IPC_REQUEST');
}

export function parseResponse<T>(
  contract: { readonly response: z.ZodType<IpcResponse<T>> },
  value: unknown,
): IpcResponse<T> {
  const result = contract.response.safeParse(value);
  return result.success ? result.data : ipcFailure('INVALID_IPC_RESPONSE');
}

export function parseEvent<T>(
  contract: { readonly payload: z.ZodType<T> },
  value: unknown,
): IpcResponse<T> {
  const result = contract.payload.safeParse(value);
  return result.success
    ? { ret: true, data: result.data }
    : ipcFailure('INVALID_IPC_RESPONSE');
}
