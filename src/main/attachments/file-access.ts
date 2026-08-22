/* eslint-disable no-await-in-loop, no-restricted-syntax */
import { createReadStream } from 'node:fs';
import { lstat, open, rename, rm, type FileHandle } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import { ApplicationError } from '@notera/application';

import { MAX_ATTACHMENT_BYTES } from '../../shared';
import { MainIpcError } from '../ipc/errors';

export interface ImportSelection {
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteLength: number;
  open(input: {
    readonly signal: AbortSignal;
    readonly onBytes: (completed: number) => void;
  }): AsyncIterable<Uint8Array>;
}

export interface SaveSelection {
  write(input: {
    readonly source: AsyncIterable<Uint8Array>;
    readonly byteLength: number;
    readonly signal: AbortSignal;
    readonly onBytes: (completed: number) => void;
  }): Promise<void>;
}

export interface AttachmentFileAccess {
  chooseImport(): Promise<ImportSelection | null>;
  chooseSave(): Promise<SaveSelection | null>;
}

export interface AttachmentDialogPort {
  chooseImportPath(): Promise<string | null>;
  chooseSavePath(): Promise<string | null>;
}

const mimeTypes = new Map<string, string>([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.txt', 'text/plain'],
  ['.webp', 'image/webp'],
]);

function mapImportError(error: unknown): Error {
  if (error instanceof MainIpcError || error instanceof ApplicationError) {
    return error;
  }
  return new MainIpcError('ATTACHMENT_IMPORT_FAILED');
}

function nativeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

function mapSaveError(error: unknown, signal: AbortSignal): Error {
  if (error instanceof MainIpcError || error instanceof ApplicationError) {
    return error;
  }
  if (signal.aborted || nativeCode(error) === 'ABORT_ERR') {
    return new ApplicationError('OPERATION_ABORTED');
  }
  return new MainIpcError(
    nativeCode(error) === 'ENOSPC' ? 'DISK_FULL' : 'ATTACHMENT_SAVE_FAILED',
  );
}

async function closeQuietly(handle: FileHandle | undefined): Promise<void> {
  if (handle === undefined) return;
  await handle.close().catch(() => undefined);
}

async function writeAll(handle: FileHandle, chunk: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const result = await handle.write(
      chunk,
      offset,
      chunk.byteLength - offset,
      null,
    );
    if (result.bytesWritten <= 0) {
      throw new MainIpcError('ATTACHMENT_SAVE_FAILED');
    }
    offset += result.bytesWritten;
  }
}

export function createAttachmentFileAccess(input: {
  readonly dialogs: AttachmentDialogPort;
  readonly randomUUID: () => string;
}): AttachmentFileAccess {
  return Object.freeze({
    async chooseImport(): Promise<ImportSelection | null> {
      const path = await input.dialogs.chooseImportPath();
      if (path === null) return null;
      try {
        const info = await lstat(path);
        if (info.isSymbolicLink() || !info.isFile()) {
          throw new MainIpcError('ATTACHMENT_IMPORT_FAILED');
        }
        if (!Number.isSafeInteger(info.size) || info.size < 0) {
          throw new MainIpcError('ATTACHMENT_IMPORT_FAILED');
        }
        if (info.size > MAX_ATTACHMENT_BYTES) {
          throw new MainIpcError('ATTACHMENT_TOO_LARGE');
        }
        const fileName = basename(path);
        if (fileName.length === 0) {
          throw new MainIpcError('ATTACHMENT_IMPORT_FAILED');
        }
        const mimeType =
          mimeTypes.get(extname(fileName).toLocaleLowerCase('en-US')) ??
          'application/octet-stream';
        const selection: ImportSelection = {
          fileName,
          mimeType,
          byteLength: info.size,
          open: ({ signal, onBytes }) =>
            (async function* read(): AsyncIterable<Uint8Array> {
              let completed = 0;
              try {
                if (signal.aborted) {
                  throw new ApplicationError('OPERATION_ABORTED');
                }
                const stream = createReadStream(path, { signal });
                for await (const raw of stream) {
                  if (signal.aborted) {
                    throw new ApplicationError('OPERATION_ABORTED');
                  }
                  const chunk = Uint8Array.from(raw as Uint8Array);
                  completed += chunk.byteLength;
                  onBytes(completed);
                  yield chunk;
                }
              } catch (error) {
                if (signal.aborted || nativeCode(error) === 'ABORT_ERR') {
                  throw new ApplicationError('OPERATION_ABORTED');
                }
                throw mapImportError(error);
              }
            })(),
        };
        return Object.freeze(selection);
      } catch (error) {
        throw mapImportError(error);
      }
    },

    async chooseSave(): Promise<SaveSelection | null> {
      const target = await input.dialogs.chooseSavePath();
      if (target === null) return null;
      const name = basename(target);
      if (name.length === 0) {
        throw new MainIpcError('ATTACHMENT_SAVE_FAILED');
      }
      const selection: SaveSelection = {
        async write({ source, byteLength, signal, onBytes }): Promise<void> {
          const temporary = join(
            dirname(target),
            `.${name}.notera-${input.randomUUID()}.part`,
          );
          let handle: FileHandle | undefined;
          let completed = 0;
          try {
            if (signal.aborted) {
              throw new ApplicationError('OPERATION_ABORTED');
            }
            handle = await open(temporary, 'wx');
            for await (const chunk of source) {
              if (signal.aborted) {
                throw new ApplicationError('OPERATION_ABORTED');
              }
              await writeAll(handle, chunk);
              completed += chunk.byteLength;
              if (completed > byteLength) {
                throw new MainIpcError('ATTACHMENT_SAVE_FAILED');
              }
              onBytes(completed);
            }
            if (completed !== byteLength) {
              throw new MainIpcError('ATTACHMENT_SAVE_FAILED');
            }
            await handle.sync();
            await handle.close();
            handle = undefined;
            await rename(temporary, target);
          } catch (error) {
            await closeQuietly(handle);
            await rm(temporary, { force: true }).catch(() => undefined);
            throw mapSaveError(error, signal);
          }
        },
      };
      return Object.freeze(selection);
    },
  });
}
