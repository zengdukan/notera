import { z } from 'zod';

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

interface VisitFrame {
  readonly kind: 'VISIT';
  readonly value: unknown;
}

interface ExitFrame {
  readonly kind: 'EXIT';
  readonly value: object;
}

type Frame = VisitFrame | ExitFrame;

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateArray(value: readonly unknown[], stack: Frame[]) {
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
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return false;
      }
      stack.push({ kind: 'VISIT', value: descriptor.value });
      return true;
    },
  );
}

function validateObject(value: object, stack: Frame[]): boolean {
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
    stack.push({ kind: 'VISIT', value: descriptor.value });
    return true;
  });
}

function isJsonValue(value: unknown): value is JsonValue {
  const stack: Frame[] = [{ kind: 'VISIT', value }];
  const activeAncestors = new WeakSet<object>();

  try {
    // An explicit stack is required so malicious deep ADF cannot overflow the
    // JavaScript call stack. The repository's loop restriction is intended for
    // transpiled iterators, not this bounded synchronous traversal.
    // eslint-disable-next-line no-restricted-syntax
    while (stack.length > 0) {
      const frame = stack.pop() as Frame;
      if (frame.kind === 'EXIT') {
        activeAncestors.delete(frame.value);
        continue;
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
        if (
          typeof frame.value !== 'object' ||
          activeAncestors.has(frame.value)
        ) {
          return false;
        }

        activeAncestors.add(frame.value);
        stack.push({ kind: 'EXIT', value: frame.value });
        if (Array.isArray(frame.value)) {
          if (!validateArray(frame.value, stack)) {
            return false;
          }
        } else if (!validateObject(frame.value, stack)) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function isAdfDocument(value: unknown): value is AdfDocument {
  if (!isJsonValue(value) || value === null || Array.isArray(value)) {
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
