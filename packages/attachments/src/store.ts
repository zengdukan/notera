import { AttachmentStorageError, mapAttachmentError } from './errors';
import { combineAbortSignals } from './cancellation';
import { importEncryptedBlob } from './importer';
import { createAttachmentPaths } from './paths';
import { recoverStaging } from './recovery';
import type {
  AttachmentStore,
  ImportBlobInput,
  ImportedBlob,
  StartupRecoveryReport,
} from './types';

const openRoots = new Set<string>();

class LocalAttachmentStore implements AttachmentStore {
  readonly startupRecovery: StartupRecoveryReport;

  private readonly closeController = new AbortController();

  private readonly activeImports = new Set<Promise<ImportedBlob>>();

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

  close(): Promise<void> {
    if (this.closeOperation) return this.closeOperation;
    this.closed = true;
    this.closeController.abort();
    this.closeOperation = Promise.allSettled([...this.activeImports]).then(
      () => {
        openRoots.delete(this.paths.profileRoot);
      },
    );
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
