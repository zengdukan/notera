import type { BlobId, VaultId } from '@notera/domain';

export interface AttachmentManifestChunk {
  readonly index: number;
  readonly plaintextOffset: number;
  readonly ciphertextOffset: number;
  readonly plaintextLength: number;
  readonly ciphertextLength: number;
  readonly ciphertextSha256: Uint8Array;
}

export interface AttachmentManifestV1 {
  readonly version: 1;
  readonly chunkSize: number;
  readonly noncePrefix: Uint8Array;
  readonly plaintextLength: number;
  readonly ciphertextLength: number;
  readonly chunks: readonly AttachmentManifestChunk[];
}

export interface StartupRecoveryReport {
  readonly removedStagingFileCount: number;
  readonly unexpectedEntryCount: number;
}

export interface ImportBlobInput {
  readonly vaultId: VaultId;
  readonly source: AsyncIterable<Uint8Array>;
  readonly signal?: AbortSignal;
}

export interface ImportedBlob {
  readonly blobId: BlobId;
  readonly fileKey: Uint8Array;
  readonly manifestVersion: 1;
  readonly manifest: Uint8Array;
  readonly plaintextLength: number;
  readonly contentSha256: Uint8Array;
}

export interface OpenBlobReaderInput {
  readonly vaultId: VaultId;
  readonly blobId: BlobId;
  readonly fileKey: Uint8Array;
  readonly manifest: Uint8Array;
  readonly signal?: AbortSignal;
}

export interface BlobReader {
  stream(): AsyncIterable<Uint8Array>;
  readChunk(index: number): Promise<Uint8Array>;
  streamRange(start: number, endExclusive: number): AsyncIterable<Uint8Array>;
  close(): Promise<void>;
}

export interface ReconcileReport {
  readonly missingBlobIds: readonly BlobId[];
  readonly orphanBlobIds: readonly BlobId[];
  readonly unexpectedEntryCount: number;
}

export interface AttachmentStore {
  readonly startupRecovery: StartupRecoveryReport;
  importBlob(input: ImportBlobInput): Promise<ImportedBlob>;
  openReader(input: OpenBlobReaderInput): Promise<BlobReader>;
  collectBlob(blobId: BlobId): Promise<void>;
  reconcile(knownBlobIds: ReadonlySet<BlobId>): Promise<ReconcileReport>;
  close(): Promise<void>;
}
