import { unlink } from 'node:fs/promises';
import { asBlobId, type BlobId } from '@notera/domain';
import { AttachmentStorageError, mapAttachmentError } from './errors';
import { combineAbortSignals } from './cancellation';
import { importEncryptedBlob } from './importer';
import { BlobLeaseRegistry } from './leases';
import { createAttachmentPaths } from './paths';
import { openBlobReader } from './reader';
import { recoverStaging } from './recovery';
import type {
  AttachmentStore,
  BlobReader,
  ImportBlobInput,
  ImportedBlob,
  OpenBlobReaderInput,
  StartupRecoveryReport,
} from './types';

const openRoots = new Set<string>();

class LocalAttachmentStore implements AttachmentStore {
  readonly startupRecovery: StartupRecoveryReport;

  private readonly closeController = new AbortController();

  private readonly activeImports = new Set<Promise<ImportedBlob>>();

  private readonly readers = new Set<BlobReader>();

  private readonly leases = new BlobLeaseRegistry();

  private closed = false;

  private closeOperation: Promise<void> | undefined;

  constructor(
    private readonly paths: Awaited<ReturnType<typeof createAttachmentPaths>>,
    startupRecovery: StartupRecoveryReport,
  ) {
    this.startupRecovery = Object.freeze({ ...startupRecovery });
  }

  importBlob(input: ImportBlobInput): Promise<ImportedBlob> {
    if (this.closed) {
      return Promise.reject(new AttachmentStorageError('STORE_CLOSED'));
    }
    const combined = combineAbortSignals([
      input?.signal,
      this.closeController.signal,
    ]);
    const operation = importEncryptedBlob({
      paths: this.paths,
      vaultId: input?.vaultId,
      source: input?.source,
      signal: combined.signal,
    }).finally(combined.cleanup);
    this.activeImports.add(operation);
    void operation.then(
      () => this.activeImports.delete(operation),
      () => this.activeImports.delete(operation),
    );
    return operation;
  }

  async openReader(input: OpenBlobReaderInput): Promise<BlobReader> {
    if (this.closed) throw new AttachmentStorageError('STORE_CLOSED');
    const reader = await openBlobReader(
      {
        paths: this.paths,
        leases: this.leases,
        storeSignal: this.closeController.signal,
        onClosed: (closedReader) => this.readers.delete(closedReader),
      },
      input,
    );
    this.readers.add(reader);
    return reader;
  }

  async collectBlob(value: BlobId): Promise<void> {
    if (this.closed) throw new AttachmentStorageError('STORE_CLOSED');
    let blobId: BlobId;
    try {
      blobId = asBlobId(value);
    } catch {
      throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
    }
    const finishDelete = this.leases.beginDelete(blobId);
    try {
      await unlink(this.paths.blobFile(blobId));
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        (error as Record<string, unknown>).code !== 'ENOENT'
      ) {
        throw mapAttachmentError(error);
      }
    } finally {
      finishDelete();
    }
  }

  close(): Promise<void> {
    if (this.closeOperation) return this.closeOperation;
    this.closed = true;
    this.closeController.abort();
    const closeReaders = [...this.readers].map((reader) => reader.close());
    this.closeOperation = Promise.allSettled([
      ...this.activeImports,
      ...closeReaders,
    ]).then(() => {
      this.leases.close();
      openRoots.delete(this.paths.profileRoot);
    });
    return this.closeOperation;
  }
}

export async function createAttachmentStore(input: {
  readonly profileRoot: string;
}): Promise<AttachmentStore> {
  let canonicalRoot: string | undefined;
  try {
    const paths = await createAttachmentPaths(input?.profileRoot);
    canonicalRoot = paths.profileRoot;
    if (openRoots.has(canonicalRoot)) {
      throw new AttachmentStorageError('STORE_ALREADY_OPEN');
    }
    openRoots.add(canonicalRoot);
    const startupRecovery = await recoverStaging(paths.stagingRoot);
    return new LocalAttachmentStore(paths, startupRecovery);
  } catch (error) {
    if (canonicalRoot) openRoots.delete(canonicalRoot);
    throw mapAttachmentError(error);
  }
}
