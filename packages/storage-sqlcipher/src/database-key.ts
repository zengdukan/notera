import { StorageError } from './errors';

const DATABASE_KEY_BYTES = 32;

export function withDatabaseKeyHex<Result>(
  databaseKey: Uint8Array,
  operation: (hex: string) => Result,
): Result {
  if (
    !(databaseKey instanceof Uint8Array) ||
    databaseKey.byteLength !== DATABASE_KEY_BYTES
  ) {
    throw new StorageError(
      'INVALID_DATABASE_KEY',
      'The database key must contain exactly 32 bytes.',
    );
  }

  const temporaryKey = Buffer.from(databaseKey);
  try {
    return operation(temporaryKey.toString('hex'));
  } finally {
    temporaryKey.fill(0);
  }
}
