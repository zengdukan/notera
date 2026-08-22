import type { FileHandle } from 'node:fs/promises';
import { lstat, open } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CryptoError,
  decryptAttachmentChunk,
  KEY_BYTES,
  wipeBytes,
} from '@notera/crypto';
import { asBlobId, asVaultId, type BlobId, type VaultId } from '@notera/domain';
import { combineAbortSignals, throwIfAborted } from './cancellation';
import { AttachmentStorageError, mapAttachmentError } from './errors';
import type { BlobLeaseRegistry } from './leases';
import { decodeManifest } from './manifest';
import type { AttachmentPaths } from './paths';
import type {
  AttachmentManifestChunk,
  AttachmentManifestV1,
  BlobReader,
  OpenBlobReaderInput,
} from './types';

function nativeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : undefined;
}

function invalidInput(): never {
  throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
}

function validateVaultId(value: VaultId): VaultId {
  try {
    return asVaultId(value);
  } catch {
    return invalidInput();
  }
}

function validateBlobId(value: BlobId): BlobId {
  try {
    return asBlobId(value);
  } catch {
    return invalidInput();
  }
}

async function readExact(
  handle: FileHandle,
  position: number,
  length: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const result = new Uint8Array(length);
  let offset = 0;
  while (offset < length) {
    throwIfAborted(signal);
    const { bytesRead } = await handle.read(
      result,
      offset,
      length - offset,
      position + offset,
    );
    if (bytesRead <= 0 || bytesRead > length - offset) {
      throw new AttachmentStorageError('BLOB_CORRUPT');
    }
    offset += bytesRead;
  }
  throwIfAborted(signal);
  return result;
}

class LocalBlobReader implements BlobReader {
  private readonly closeController = new AbortController();

  private readonly signalState;

  private readonly activeOperations = new Set<Promise<unknown>>();

  private closed = false;

  private closeOperation: Promise<void> | undefined;

  constructor(
    private readonly handle: FileHandle,
    private readonly vaultId: VaultId,
    private readonly blobId: BlobId,
    private readonly fileKey: Uint8Array,
    private readonly manifest: AttachmentManifestV1,
    externalSignals: readonly (AbortSignal | undefined)[],
    private readonly releaseLease: () => void,
    private readonly onClosed: () => void,
  ) {
    this.signalState = combineAbortSignals([
      ...externalSignals,
      this.closeController.signal,
    ]);
    this.signalState.signal.addEventListener(
      'abort',
      () => void this.close(),
      { once: true },
    );
  }

  private track<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) {
      return Promise.reject(new AttachmentStorageError('READER_CLOSED'));
    }
    const promise = operation();
    this.activeOperations.add(promise);
    void promise.then(
      () => this.activeOperations.delete(promise),
      () => this.activeOperations.delete(promise),
    );
    return promise;
  }

  private async readChunkValue(
    chunk: AttachmentManifestChunk,
  ): Promise<Uint8Array> {
    const ciphertext = await readExact(
      this.handle,
      chunk.ciphertextOffset,
      chunk.ciphertextLength,
      this.signalState.signal,
    );
    const actualHash = createHash('sha256').update(ciphertext).digest();
    if (
      chunk.ciphertextSha256.byteLength !== actualHash.byteLength ||
      !timingSafeEqual(actualHash, chunk.ciphertextSha256)
    ) {
      throw new AttachmentStorageError('BLOB_CORRUPT');
    }
    try {
      const plaintext = await decryptAttachmentChunk(
        ciphertext,
        this.fileKey,
        this.manifest.noncePrefix,
        {
          formatVersion: 1,
          vaultId: this.vaultId,
          blobId: this.blobId,
          chunkIndex: chunk.index,
          plaintextLength: chunk.plaintextLength,
        },
      );
      throwIfAborted(this.signalState.signal);
      if (plaintext.byteLength !== chunk.plaintextLength) {
        throw new AttachmentStorageError('BLOB_CORRUPT');
      }
      return plaintext;
    } catch (error) {
      if (error instanceof AttachmentStorageError) throw error;
      if (error instanceof CryptoError) {
        throw new AttachmentStorageError('BLOB_CORRUPT');
      }
      throw mapAttachmentError(error);
    }
  }

  readChunk(index: number): Promise<Uint8Array> {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= this.manifest.chunks.length
    ) {
      return Promise.reject(
        new AttachmentStorageError('INVALID_ATTACHMENT_INPUT'),
      );
    }
    return this.track(() => this.readChunkValue(this.manifest.chunks[index]));
  }

  async *stream(): AsyncIterable<Uint8Array> {
    for (let index = 0; index < this.manifest.chunks.length; index += 1) {
      yield await this.readChunk(index);
    }
  }

  async *streamRange(
    start: number,
    endExclusive: number,
  ): AsyncIterable<Uint8Array> {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(endExclusive) ||
      start < 0 ||
      start > endExclusive ||
      endExclusive > this.manifest.plaintextLength
    ) {
      return invalidInput();
    }
    if (start === endExclusive) return;
    const firstChunk = Math.floor(start / this.manifest.chunkSize);
    const lastChunk = Math.floor((endExclusive - 1) / this.manifest.chunkSize);
    for (let index = firstChunk; index <= lastChunk; index += 1) {
      const chunk = this.manifest.chunks[index];
      const plaintext = await this.readChunk(index);
      const sliceStart = Math.max(0, start - chunk.plaintextOffset);
      const sliceEnd = Math.min(
        chunk.plaintextLength,
        endExclusive - chunk.plaintextOffset,
      );
      yield plaintext.slice(sliceStart, sliceEnd);
    }
  }

  close(): Promise<void> {
    if (this.closeOperation) return this.closeOperation;
    this.closed = true;
    this.closeOperation = Promise.resolve().then(async () => {
      this.closeController.abort();
      await Promise.allSettled([...this.activeOperations]);
      try {
        await this.handle.close();
      } catch {
        // Closing is idempotent and does not expose native handle failures.
      }
      wipeBytes(this.fileKey);
      this.releaseLease();
      this.signalState.cleanup();
      this.onClosed();
    });
    return this.closeOperation;
  }
}

interface OpenBlobReaderEnvironment {
  readonly paths: AttachmentPaths;
  readonly leases: BlobLeaseRegistry;
  readonly storeSignal: AbortSignal;
  readonly onClosed: (reader: BlobReader) => void;
}

export async function openBlobReader(
  environment: OpenBlobReaderEnvironment,
  input: OpenBlobReaderInput,
): Promise<BlobReader> {
  const combined = combineAbortSignals([input?.signal, environment.storeSignal]);
  let releaseLease: (() => void) | undefined;
  let handle: FileHandle | undefined;
  try {
    throwIfAborted(combined.signal);
    const vaultId = validateVaultId(input?.vaultId);
    const blobId = validateBlobId(input?.blobId);
    if (!(input?.fileKey instanceof Uint8Array) || input.fileKey.length !== KEY_BYTES) {
      return invalidInput();
    }
    if (!(input.manifest instanceof Uint8Array)) return invalidInput();
    const manifest = decodeManifest(input.manifest);
    releaseLease = environment.leases.acquireReader(blobId);
    const path = environment.paths.blobFile(blobId);
    let entry;
    try {
      entry = await lstat(path);
    } catch (error) {
      if (nativeCode(error) === 'ENOENT') {
        throw new AttachmentStorageError('BLOB_MISSING');
      }
      throw error;
    }
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new AttachmentStorageError('BLOB_CORRUPT');
    }
    handle = await open(path, 'r');
    const file = await handle.stat();
    if (!file.isFile() || file.size !== manifest.ciphertextLength) {
      throw new AttachmentStorageError('BLOB_CORRUPT');
    }
    throwIfAborted(combined.signal);
    let reader!: BlobReader;
    reader = new LocalBlobReader(
      handle,
      vaultId,
      blobId,
      Uint8Array.from(input.fileKey),
      manifest,
      [input.signal, environment.storeSignal],
      releaseLease,
      () => environment.onClosed(reader),
    );
    handle = undefined;
    releaseLease = undefined;
    combined.cleanup();
    if (environment.storeSignal.aborted || input.signal?.aborted) {
      await reader.close();
      throw new AttachmentStorageError('OPERATION_ABORTED');
    }
    return reader;
  } catch (error) {
    try {
      await handle?.close();
    } catch {
      // The original stable error remains authoritative.
    }
    releaseLease?.();
    combined.cleanup();
    if (error instanceof AttachmentStorageError) throw error;
    throw mapAttachmentError(error);
  }
}
