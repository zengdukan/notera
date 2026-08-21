import { failDomain } from './errors';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | Readonly<{ [key: string]: JsonValue }>
  | readonly JsonValue[];
export type JsonObject = Readonly<{ [key: string]: JsonValue }>;

export interface AdfDocument {
  readonly type: 'doc';
  readonly version: 1;
  readonly content?: readonly JsonValue[];
  readonly [key: string]: JsonValue | undefined;
}

function cloneJson(value: unknown, ancestors: Set<object>): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      failDomain('INVALID_ADF_DOCUMENT');
    }
    return value;
  }
  if (typeof value !== 'object') {
    failDomain('INVALID_ADF_DOCUMENT');
  }
  if (ancestors.has(value)) {
    failDomain('INVALID_ADF_DOCUMENT');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((item) => cloneJson(item, ancestors)));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      failDomain('INVALID_ADF_DOCUMENT');
    }
    const clone = Object.entries(value).reduce<Record<string, JsonValue>>(
      (result, [key, item]) => {
        result[key] = cloneJson(item, ancestors);
        return result;
      },
      {},
    );
    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

export function asAdfDocument(value: unknown): AdfDocument {
  const document = cloneJson(value, new Set());
  if (
    document === null ||
    Array.isArray(document) ||
    typeof document !== 'object'
  ) {
    failDomain('INVALID_ADF_DOCUMENT');
  }
  const root = document as JsonObject;
  if (
    root.type !== 'doc' ||
    root.version !== 1 ||
    ('content' in root && !Array.isArray(root.content))
  ) {
    failDomain('INVALID_ADF_DOCUMENT');
  }
  return root as AdfDocument;
}
