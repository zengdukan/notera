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

type MutableJson =
  | JsonPrimitive
  | { [key: string]: MutableJson }
  | MutableJson[];

interface VisitFrame {
  readonly kind: 'VISIT';
  readonly value: unknown;
  readonly parent?: { [key: string]: MutableJson } | MutableJson[];
  readonly key?: string | number;
}

interface ExitFrame {
  readonly kind: 'EXIT';
  readonly source: object;
  readonly target: { [key: string]: MutableJson } | MutableJson[];
}

type CloneFrame = VisitFrame | ExitFrame;

function assignClone(
  parent: VisitFrame['parent'],
  key: VisitFrame['key'],
  value: MutableJson,
): void {
  if (!parent || key === undefined) {
    return;
  }
  if (Array.isArray(parent)) {
    parent[key as number] = value;
    return;
  }
  Object.defineProperty(parent, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

function arrayValues(value: readonly unknown[]): readonly unknown[] {
  const keys = Reflect.ownKeys(value);
  if (
    keys.some(
      (key) =>
        typeof key === 'symbol' ||
        (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)),
    )
  ) {
    failDomain('INVALID_ADF_DOCUMENT');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[index];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      failDomain('INVALID_ADF_DOCUMENT');
    }
    return descriptor.value;
  });
}

function objectEntries(value: object): readonly [string, unknown][] {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    failDomain('INVALID_ADF_DOCUMENT');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key === 'symbol')) {
    failDomain('INVALID_ADF_DOCUMENT');
  }
  return Object.entries(descriptors).map(([key, descriptor]) => {
    if (
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      failDomain('INVALID_ADF_DOCUMENT');
    }
    return [key, descriptor.value];
  });
}

function cloneJson(value: unknown): JsonValue {
  const stack: CloneFrame[] = [{ kind: 'VISIT', value }];
  const activeAncestors = new Set<object>();
  let result: MutableJson | undefined;

  while (stack.length > 0) {
    const frame = stack.pop() as CloneFrame;
    if (frame.kind === 'EXIT') {
      activeAncestors.delete(frame.source);
      Object.freeze(frame.target);
      continue;
    }

    const assign = (item: MutableJson) => {
      if (frame.parent) {
        assignClone(frame.parent, frame.key, item);
      } else {
        result = item;
      }
    };

    if (
      frame.value === null ||
      typeof frame.value === 'string' ||
      typeof frame.value === 'boolean'
    ) {
      assign(frame.value);
      continue;
    }
    if (typeof frame.value === 'number') {
      if (!Number.isFinite(frame.value)) {
        failDomain('INVALID_ADF_DOCUMENT');
      }
      assign(frame.value);
      continue;
    }
    if (
      typeof frame.value !== 'object' ||
      activeAncestors.has(frame.value)
    ) {
      failDomain('INVALID_ADF_DOCUMENT');
    }

    const source = frame.value;
    const target: { [key: string]: MutableJson } | MutableJson[] = Array.isArray(
      source,
    )
      ? []
      : {};
    assign(target);
    activeAncestors.add(source);
    stack.push({ kind: 'EXIT', source, target });

    const entries: readonly [string | number, unknown][] = Array.isArray(source)
      ? arrayValues(source).map((item, index) => [index, item])
      : objectEntries(source);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, item] = entries[index];
      stack.push({ kind: 'VISIT', value: item, parent: target, key });
    }
  }

  if (result === undefined) {
    failDomain('INVALID_ADF_DOCUMENT');
  }
  return result as JsonValue;
}

export function asAdfDocument(value: unknown): AdfDocument {
  const document = cloneJson(value);
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
