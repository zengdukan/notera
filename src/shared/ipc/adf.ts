import { z } from 'zod';

export const MAX_ADF_BYTES = 8 * 1024 * 1024;
export const MAX_ADF_NODES = 100_000;
export const MAX_ADF_DEPTH = 128;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export interface AdfDocument {
  readonly type: 'doc';
  readonly version: 1;
  readonly content?: readonly JsonValue[];
  readonly [key: string]: JsonValue | undefined;
}

interface Frame {
  readonly value: unknown;
  readonly depth: number;
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateArray(
  value: readonly unknown[],
  stack: Frame[],
  depth: number,
) {
  const keys = Reflect.ownKeys(value);
  if (
    keys.some(
      (key) =>
        typeof key === 'symbol' ||
        (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)),
    )
  ) {
    return false;
  }

  return Array.from({ length: value.length }, (_, index) => index).every(
    (index) => {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        return false;
      }
      stack.push({ value: value[index], depth: depth + 1 });
      return true;
    },
  );
}

function validateObject(value: object, stack: Frame[], depth: number): boolean {
  if (!isPlainObject(value)) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
    return false;
  }

  return Object.values(descriptors).every((descriptor) => {
    if (
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      return false;
    }
    stack.push({ value: descriptor.value, depth: depth + 1 });
    return true;
  });
}

function isBoundedJson(value: unknown): value is JsonValue {
  const stack: Frame[] = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;

  try {
    // An explicit stack is required so malicious deep ADF cannot overflow the
    // JavaScript call stack. The repository's loop restriction is intended for
    // transpiled iterators, not this bounded synchronous traversal.
    // eslint-disable-next-line no-restricted-syntax
    while (stack.length > 0) {
      const frame = stack.pop() as Frame;
      nodes += 1;
      if (nodes > MAX_ADF_NODES || frame.depth > MAX_ADF_DEPTH) {
        return false;
      }

      if (
        frame.value === null ||
        typeof frame.value === 'string' ||
        typeof frame.value === 'boolean'
      ) {
        // Primitive is already valid and has no children.
      } else if (typeof frame.value === 'number') {
        if (!Number.isFinite(frame.value)) {
          return false;
        }
      } else {
        if (typeof frame.value !== 'object' || seen.has(frame.value)) {
          return false;
        }

        seen.add(frame.value);
        if (Array.isArray(frame.value)) {
          if (!validateArray(frame.value, stack, frame.depth)) {
            return false;
          }
        } else if (!validateObject(frame.value, stack, frame.depth)) {
          return false;
        }
      }
    }

    const serialized = JSON.stringify(value);
    return (
      typeof serialized === 'string' &&
      new TextEncoder().encode(serialized).byteLength <= MAX_ADF_BYTES
    );
  } catch {
    return false;
  }
}

function isAdfDocument(value: unknown): value is AdfDocument {
  if (!isBoundedJson(value) || value === null || Array.isArray(value)) {
    return false;
  }

  const root = value as Record<string, JsonValue>;
  return (
    root.type === 'doc' &&
    root.version === 1 &&
    (!Object.prototype.hasOwnProperty.call(root, 'content') ||
      Array.isArray(root.content))
  );
}

export const adfDocumentSchema = z.custom<AdfDocument>(isAdfDocument, {
  message: 'The ADF document is invalid.',
});
