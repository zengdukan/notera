import { asAdfDocument, type AdfDocument } from '@notera/domain';

import { StorageError } from '../errors';

type SerializationFrame =
  | Readonly<{ kind: 'VALUE'; value: unknown }>
  | Readonly<{ kind: 'TEXT'; text: string }>
  | Readonly<{ kind: 'EXIT'; source: object; closer: ']' | '}' }>;

function serializationFailure(): never {
  throw new StorageError('STORAGE_OPERATION_FAILED');
}

export function serializeAdf(document: AdfDocument): string {
  const output: string[] = [];
  const stack: SerializationFrame[] = [{ kind: 'VALUE', value: document }];
  const active = new Set<object>();

  while (stack.length > 0) {
    const frame = stack.pop() as SerializationFrame;
    if (frame.kind === 'TEXT') {
      output.push(frame.text);
      continue;
    }
    if (frame.kind === 'EXIT') {
      active.delete(frame.source);
      output.push(frame.closer);
      continue;
    }

    const { value } = frame;
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      output.push(JSON.stringify(value));
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        serializationFailure();
      }
      output.push(JSON.stringify(value));
      continue;
    }
    if (typeof value !== 'object' || active.has(value)) {
      serializationFailure();
    }

    active.add(value);
    if (Array.isArray(value)) {
      output.push('[');
      stack.push({ kind: 'EXIT', source: value, closer: ']' });
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ kind: 'VALUE', value: value[index] });
        if (index > 0) {
          stack.push({ kind: 'TEXT', text: ',' });
        }
      }
      continue;
    }

    const entries = Object.entries(value);
    output.push('{');
    stack.push({ kind: 'EXIT', source: value, closer: '}' });
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, item] = entries[index];
      stack.push({ kind: 'VALUE', value: item });
      stack.push({ kind: 'TEXT', text: `${JSON.stringify(key)}:` });
      if (index > 0) {
        stack.push({ kind: 'TEXT', text: ',' });
      }
    }
  }
  return output.join('');
}

export function parseAdf(json: string): AdfDocument {
  try {
    return asAdfDocument(JSON.parse(json));
  } catch {
    throw new StorageError('DB_CORRUPT');
  }
}
