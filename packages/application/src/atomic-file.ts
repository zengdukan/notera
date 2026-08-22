import { link, open, rename, unlink } from 'node:fs/promises';

import { ApplicationError, mapFileError } from './errors';
import { asInternalSessionName } from './paths';

export interface AtomicFileHandle {
  write(
    bytes: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ readonly bytesWritten: number }>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicFileOperations {
  open(path: string, flags: 'wx', mode: number): Promise<AtomicFileHandle>;
  link(source: string, destination: string): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

const NODE_FILE_OPERATIONS: AtomicFileOperations = {
  open: async (path, flags, mode) => open(path, flags, mode),
  link,
  rename,
  unlink,
};

function temporaryPath(target: string, sessionName: string): string {
  return `${target}.${asInternalSessionName(sessionName)}.tmp`;
}

async function ignoreUnlink(
  path: string,
  operations: AtomicFileOperations,
): Promise<void> {
  try {
    await operations.unlink(path);
  } catch {
    // Cleanup is best effort and is restricted to this exact temporary path.
  }
}

async function persistTemporary(
  temporary: string,
  bytes: Uint8Array,
  operations: AtomicFileOperations,
): Promise<void> {
  let handle: AtomicFileHandle;
  try {
    handle = await operations.open(temporary, 'wx', 0o600);
  } catch (error) {
    await ignoreUnlink(temporary, operations);
    throw mapFileError(error, 'SAVE_FAILED');
  }

  let failure: unknown;
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      // Writes are intentionally sequential because each offset depends on the prior short write.
      // eslint-disable-next-line no-await-in-loop
      const { bytesWritten } = await handle.write(
        bytes,
        offset,
        bytes.byteLength - offset,
        offset,
      );
      if (
        !Number.isSafeInteger(bytesWritten) ||
        bytesWritten <= 0 ||
        bytesWritten > bytes.byteLength - offset
      ) {
        throw new ApplicationError('SAVE_FAILED');
      }
      offset += bytesWritten;
    }
    await handle.sync();
  } catch (error) {
    failure = error;
  }
  try {
    await handle.close();
  } catch (error) {
    failure ??= error;
  }
  if (failure !== undefined) {
    await ignoreUnlink(temporary, operations);
    throw mapFileError(failure, 'SAVE_FAILED');
  }
}

async function commitTemporary(
  target: string,
  bytes: Uint8Array,
  sessionName: string,
  operations: AtomicFileOperations,
  commit: (temporary: string) => Promise<void>,
): Promise<void> {
  const temporary = temporaryPath(target, sessionName);
  await persistTemporary(temporary, Uint8Array.from(bytes), operations);
  try {
    await commit(temporary);
  } catch (error) {
    await ignoreUnlink(temporary, operations);
    throw mapFileError(error, 'SAVE_FAILED');
  }
  await ignoreUnlink(temporary, operations);
}

export async function writeFileExclusively(
  target: string,
  bytes: Uint8Array,
  sessionName: string,
  operations: AtomicFileOperations = NODE_FILE_OPERATIONS,
): Promise<void> {
  await commitTemporary(target, bytes, sessionName, operations, (temporary) =>
    operations.link(temporary, target),
  );
}

export async function replaceFileAtomically(
  target: string,
  bytes: Uint8Array,
  sessionName: string,
  operations: AtomicFileOperations = NODE_FILE_OPERATIONS,
): Promise<void> {
  await commitTemporary(target, bytes, sessionName, operations, (temporary) =>
    operations.rename(temporary, target),
  );
}

export async function replaceFileWithBackup(
  target: string,
  backup: string,
  currentBytes: Uint8Array,
  nextBytes: Uint8Array,
  sessionName: string,
  operations: AtomicFileOperations = NODE_FILE_OPERATIONS,
): Promise<void> {
  await replaceFileAtomically(backup, currentBytes, sessionName, operations);
  await replaceFileAtomically(target, nextBytes, sessionName, operations);
}
