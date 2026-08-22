/* eslint-disable no-restricted-syntax */
import { createWriteStream } from 'node:fs';
import { link, open, rm, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';

import type { ExportPackaging } from '@notera/export';
import { ApplicationError } from '@notera/application';
import archiver from 'archiver';

import { MainIpcError } from '../ipc/errors';
import type { ExportEntry } from './types';

function nativeCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

function mapped(error: unknown, signal: AbortSignal): Error {
  if (error instanceof ApplicationError || error instanceof MainIpcError) {
    return error;
  }
  if (signal.aborted || nativeCode(error) === 'ABORT_ERR') {
    return new ApplicationError('OPERATION_ABORTED');
  }
  return new MainIpcError(
    nativeCode(error) === 'ENOSPC' ? 'DISK_FULL' : 'EXPORT_FAILED',
  );
}

function validateEntries(
  packaging: ExportPackaging,
  target: string,
  entries: readonly ExportEntry[],
): number {
  const paths = new Set<string>();
  let documentCount = 0;
  let total = 0;
  entries.forEach((entry) => {
    if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) {
      throw new MainIpcError('EXPORT_FAILED');
    }
    const folded = entry.archivePath.toLocaleLowerCase('en-US');
    if (paths.has(folded)) throw new MainIpcError('EXPORT_FAILED');
    paths.add(folded);
    if (/^[^/\\]+$/u.test(entry.archivePath)) {
      documentCount += 1;
    } else if (!/^assets\/[^/\\]+$/u.test(entry.archivePath)) {
      throw new MainIpcError('EXPORT_FAILED');
    }
    if (
      entry.archivePath.includes('..') ||
      /^[a-z]:/iu.test(entry.archivePath)
    ) {
      throw new MainIpcError('EXPORT_FAILED');
    }
    total += entry.byteLength;
    if (!Number.isSafeInteger(total)) throw new MainIpcError('EXPORT_FAILED');
  });
  if (documentCount !== 1 || entries.length === 0) {
    throw new MainIpcError('EXPORT_FAILED');
  }
  if (
    packaging === 'DIRECT' &&
    (entries.length !== 1 || entries[0].archivePath !== basename(target))
  ) {
    throw new MainIpcError('EXPORT_FAILED');
  }
  return total;
}

async function closeQuietly(handle: FileHandle | undefined): Promise<void> {
  await handle?.close().catch(() => undefined);
}

async function writeAll(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await handle.write(
      bytes,
      offset,
      bytes.byteLength - offset,
      null,
    );
    if (result.bytesWritten <= 0) throw new MainIpcError('EXPORT_FAILED');
    offset += result.bytesWritten;
  }
}

async function writeDirect(input: {
  readonly part: string;
  readonly entry: ExportEntry;
  readonly total: number;
  readonly signal: AbortSignal;
  readonly onBytes: (completed: number, total: number) => void;
}): Promise<void> {
  let handle: FileHandle | undefined;
  let completed = 0;
  try {
    handle = await open(input.part, 'wx');
    for await (const chunk of input.entry.open(input.signal)) {
      if (input.signal.aborted) throw new ApplicationError('OPERATION_ABORTED');
      await writeAll(handle, chunk);
      completed += chunk.byteLength;
      if (completed > input.entry.byteLength) {
        throw new MainIpcError('EXPORT_FAILED');
      }
      input.onBytes(completed, input.total);
    }
    if (completed !== input.entry.byteLength) {
      throw new MainIpcError('EXPORT_FAILED');
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
  } finally {
    await closeQuietly(handle);
  }
}

async function writeZip(input: {
  readonly part: string;
  readonly entries: readonly ExportEntry[];
  readonly total: number;
  readonly signal: AbortSignal;
  readonly onBytes: (completed: number, total: number) => void;
}): Promise<void> {
  const output = createWriteStream(input.part, {
    flags: 'wx',
  });
  const archive = archiver('zip', { zlib: { level: 6 } });
  let completed = 0;
  const sources: Readable[] = [];
  let failZip: (error: Error) => void = () => undefined;
  const completedZip = new Promise<void>((resolve, reject) => {
    failZip = (error) => {
      archive.abort();
      if (!output.destroyed) output.destroy();
      reject(error);
    };
    output.once('close', resolve);
    output.once('error', failZip);
    archive.once('error', failZip);
  });
  const outputClosed = output.closed
    ? Promise.resolve()
    : new Promise<void>((resolve) => output.once('close', resolve));
  const abort = () => failZip(new ApplicationError('OPERATION_ABORTED'));
  input.signal.addEventListener('abort', abort, { once: true });
  archive.pipe(output);
  try {
    if (input.signal.aborted) abort();
    input.entries.forEach((entry) => {
      let entryBytes = 0;
      const counted = (async function* count() {
        for await (const chunk of entry.open(input.signal)) {
          if (input.signal.aborted) {
            throw new ApplicationError('OPERATION_ABORTED');
          }
          entryBytes += chunk.byteLength;
          completed += chunk.byteLength;
          if (entryBytes > entry.byteLength || completed > input.total) {
            throw new MainIpcError('EXPORT_FAILED');
          }
          input.onBytes(completed, input.total);
          yield chunk;
        }
        if (entryBytes !== entry.byteLength) {
          throw new MainIpcError('EXPORT_FAILED');
        }
      })();
      const source = Readable.from(counted);
      source.once('error', failZip);
      sources.push(source);
      archive.append(source, { name: entry.archivePath });
    });
    await Promise.all([archive.finalize(), completedZip]);
    if (completed !== input.total) throw new MainIpcError('EXPORT_FAILED');
    const syncHandle = await open(input.part, 'r+');
    try {
      await syncHandle.sync();
    } finally {
      await syncHandle.close();
    }
  } finally {
    input.signal.removeEventListener('abort', abort);
    sources.forEach((source) => {
      source.removeListener('error', failZip);
      if (!source.destroyed) source.destroy();
    });
    if (!output.closed) {
      if (!output.destroyed) output.destroy();
      await outputClosed;
    }
    output.removeListener('error', failZip);
    archive.removeListener('error', failZip);
  }
}

export async function writeExportEntries(input: {
  readonly target: string;
  readonly packaging: ExportPackaging;
  readonly partId: string;
  readonly entries: readonly ExportEntry[];
  readonly signal: AbortSignal;
  readonly onBytes: (completed: number, total: number) => void;
}): Promise<void> {
  const part = join(
    dirname(input.target),
    `.${basename(input.target)}.notera-${input.partId}.part`,
  );
  try {
    if (input.signal.aborted) throw new ApplicationError('OPERATION_ABORTED');
    const total = validateEntries(input.packaging, input.target, input.entries);
    if (input.packaging === 'DIRECT') {
      await writeDirect({
        part,
        entry: input.entries[0],
        total,
        signal: input.signal,
        onBytes: input.onBytes,
      });
    } else {
      await writeZip({
        part,
        entries: input.entries,
        total,
        signal: input.signal,
        onBytes: input.onBytes,
      });
    }
    if (input.signal.aborted) throw new ApplicationError('OPERATION_ABORTED');
    await link(part, input.target);
    await rm(part);
  } catch (error) {
    await rm(part, { force: true }).catch(() => undefined);
    throw mapped(error, input.signal);
  }
}
