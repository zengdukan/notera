import { wipeBytes } from '@notera/crypto';
import {
  createAttachmentBlob,
  type AttachmentId,
  type AttachmentLocalState,
  type BlobId,
  type Timestamp,
} from '@notera/domain';
import type { BlobReader, AttachmentStore } from '@notera/attachments';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type { AttachmentContentReader } from './types';
import { mapReadError } from './errors';
import { normalizeAttachmentId } from './validation';

function wipeStored(value: ReturnType<VaultDatabase['attachments']['getContent']>): void {
  if (value === undefined) return;
  wipeBytes(value.storedBlob.fileKey);
  wipeBytes(value.storedBlob.manifest);
  value.storedBlob.blob.contentSha256?.fill(0);
}

function markBlobFailure(
  database: VaultDatabase,
  attachmentId: AttachmentId,
  blobId: BlobId,
  state: Extract<AttachmentLocalState, 'MISSING' | 'CORRUPT'>,
  now: Timestamp,
): void {
  let current: ReturnType<VaultDatabase['attachments']['getContent']>;
  try {
    database.transaction((transaction) => {
      current = transaction.attachments.getContent(attachmentId);
      if (
        current !== undefined &&
        current.attachment.blobId === blobId &&
        current.storedBlob.blob.localState === 'READY'
      ) {
        transaction.attachments.replaceBlob({
          ...current.storedBlob,
          blob: createAttachmentBlob({
            ...current.storedBlob.blob,
            localState: state,
            updatedAt: now,
          }),
        });
      }
    });
  } catch {
    // The original stable read failure remains authoritative.
  } finally {
    wipeStored(current);
  }
}

function failureState(error: unknown): 'MISSING' | 'CORRUPT' | undefined {
  const mapped = mapReadError(error);
  if (mapped.code === 'BLOB_MISSING') return 'MISSING';
  if (mapped.code === 'BLOB_CORRUPT') return 'CORRUPT';
  return undefined;
}

class SafeAttachmentReader implements AttachmentContentReader {
  private closePromise: Promise<void> | undefined;

  readonly #reader: BlobReader;

  readonly #database: VaultDatabase;

  readonly #blobId: BlobId;

  readonly #sessionSignal: AbortSignal;

  readonly #now: () => Timestamp;

  constructor(
    readonly attachmentId: AttachmentId,
    readonly fileName: string,
    readonly mimeType: string,
    readonly byteLength: number,
    reader: BlobReader,
    database: VaultDatabase,
    blobId: BlobId,
    sessionSignal: AbortSignal,
    now: () => Timestamp,
  ) {
    this.#reader = reader;
    this.#database = database;
    this.#blobId = blobId;
    this.#sessionSignal = sessionSignal;
    this.#now = now;
  }

  private async *guarded(stream: AsyncIterable<Uint8Array>) {
    try {
      for await (const chunk of stream) yield Uint8Array.from(chunk);
    } catch (error) {
      const state = failureState(error);
      if (state !== undefined) {
        markBlobFailure(
          this.#database,
          this.attachmentId,
          this.#blobId,
          state,
          this.#now(),
        );
      }
      throw mapReadError(error, this.#sessionSignal);
    }
  }

  stream(): AsyncIterable<Uint8Array> {
    return this.guarded(this.#reader.stream());
  }

  streamRange(start: number, endExclusive: number): AsyncIterable<Uint8Array> {
    return this.guarded(this.#reader.streamRange(start, endExclusive));
  }

  close(): Promise<void> {
    this.closePromise ??= this.#reader.close();
    return this.closePromise;
  }
}

export async function openAttachmentReader(input: {
  readonly database: VaultDatabase;
  readonly attachments: AttachmentStore;
  readonly signal: AbortSignal;
  readonly attachmentId: unknown;
  readonly now: () => Timestamp;
}): Promise<AttachmentContentReader> {
  const attachmentId = normalizeAttachmentId(input.attachmentId);
  const content = input.database.attachments.getContent(attachmentId);
  if (content === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
  const references = input.database.attachments.listReferencesForAttachments([
    attachmentId,
  ]);
  if (references.length === 0) {
    wipeStored(content);
    throw new ApplicationError('ENTITY_NOT_FOUND');
  }
  const { attachment, storedBlob } = content;
  if (storedBlob.blob.localState === 'MISSING') {
    wipeStored(content);
    throw new ApplicationError('BLOB_MISSING');
  }
  if (storedBlob.blob.localState === 'CORRUPT') {
    wipeStored(content);
    throw new ApplicationError('BLOB_CORRUPT');
  }
  if (storedBlob.blob.localState !== 'READY') {
    wipeStored(content);
    throw new ApplicationError('DB_CORRUPT');
  }
  try {
    const reader = await input.attachments.openReader({
      vaultId: attachment.vaultId,
      blobId: storedBlob.blob.id,
      fileKey: storedBlob.fileKey,
      manifest: storedBlob.manifest,
      signal: input.signal,
    });
    return new SafeAttachmentReader(
      attachment.id,
      attachment.fileName,
      attachment.mimeType,
      storedBlob.blob.byteLength,
      reader,
      input.database,
      storedBlob.blob.id,
      input.signal,
      input.now,
    );
  } catch (error) {
    const state = failureState(error);
    if (state !== undefined) {
      markBlobFailure(
        input.database,
        attachmentId,
        storedBlob.blob.id,
        state,
        input.now(),
      );
    }
    throw mapReadError(error, input.signal);
  } finally {
    wipeStored(content);
  }
}
