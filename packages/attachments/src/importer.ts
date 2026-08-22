import type { FileHandle } from 'node:fs/promises';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  encryptAttachmentChunk,
  generateAttachmentFileKey,
  generateAttachmentNoncePrefix,
  wipeBytes,
} from '@notera/crypto';
import { asBlobId, asVaultId, type BlobId, type VaultId } from '@notera/domain';
import { fixedSizeChunks } from './chunker';
import { throwIfAborted } from './cancellation';
import { AttachmentStorageError, mapAttachmentError } from './errors';
import { decodeManifest, encodeManifestV1 } from './manifest';
import type { AttachmentPaths } from './paths';
import type { ImportedBlob } from './types';

export interface AsyncWriter {
  write(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position?: number | null,
  ): Promise<{ bytesWritten: number }>;
}

export async function writeAll(
  writer: AsyncWriter,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await writer.write(
      bytes,
      offset,
      bytes.byteLength - offset,
      null,
    );
    if (
      !Number.isSafeInteger(bytesWritten) ||
      bytesWritten <= 0 ||
      bytesWritten > bytes.byteLength - offset
    ) {
      throw new AttachmentStorageError('ATTACHMENT_IO_FAILED');
    }
    offset += bytesWritten;
  }
}

function nativeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const { code } = error as Record<string, unknown>;
  return typeof code === 'string' ? code : undefined;
}

async function targetExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (nativeCode(error) === 'ENOENT') return false;
    throw error;
  }
}

export async function publishStagedBlob(
  paths: AttachmentPaths,
  blobIdValue: BlobId | string,
  stagingPath: string,
): Promise<void> {
  const blobId = asBlobId(blobIdValue);
  const expectedPrefix = `${blobId}.`;
  if (
    !stagingPath.startsWith(`${paths.stagingRoot}\\`) &&
    !stagingPath.startsWith(`${paths.stagingRoot}/`)
  ) {
    throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
  }
  const name = stagingPath.slice(paths.stagingRoot.length + 1);
  if (!name.startsWith(expectedPrefix) || !name.endsWith('.part')) {
    throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
  }
  const finalDirectory = paths.blobDirectory(blobId);
  const finalPath = paths.blobFile(blobId);
  try {
    await mkdir(finalDirectory, { recursive: true });
    if (await targetExists(finalPath)) {
      throw new AttachmentStorageError('BLOB_ALREADY_EXISTS');
    }
    await rename(stagingPath, finalPath);
  } catch (error) {
    if (error instanceof AttachmentStorageError) throw error;
    if (nativeCode(error) === 'EEXIST') {
      throw new AttachmentStorageError('BLOB_ALREADY_EXISTS');
    }
    throw mapAttachmentError(error);
  }
}

interface ImportEncryptedBlobInput {
  readonly paths: AttachmentPaths;
  readonly vaultId: VaultId;
  readonly source: AsyncIterable<Uint8Array>;
  readonly signal: AbortSignal;
}

function validateVaultId(value: VaultId): VaultId {
  try {
    return asVaultId(value);
  } catch {
    throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
  }
}

async function safeClose(handle: FileHandle | undefined): Promise<void> {
  try {
    await handle?.close();
  } catch {
    // The original operation error remains authoritative.
  }
}

export async function importEncryptedBlob(
  input: ImportEncryptedBlobInput,
): Promise<ImportedBlob> {
  throwIfAborted(input.signal);
  const vaultId = validateVaultId(input.vaultId);
  if (
    typeof input.source !== 'object' ||
    input.source === null ||
    typeof input.source[Symbol.asyncIterator] !== 'function'
  ) {
    throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
  }
  const blobId = asBlobId(randomUUID());
  const token = randomBytes(16).toString('hex');
  const stagingPath = input.paths.stagingFile(blobId, token);
  const fileKey = await generateAttachmentFileKey();
  const noncePrefix = await generateAttachmentNoncePrefix();
  let handle: FileHandle | undefined;
  let committed = false;
  try {
    handle = await open(stagingPath, 'wx', 0o600);
    const plaintextSha256 = createHash('sha256');
    const chunks = [];
    let plaintextLength = 0;
    let chunkIndex = 0;
    for await (const plaintext of fixedSizeChunks(input.source, input.signal)) {
      throwIfAborted(input.signal);
      plaintextSha256.update(plaintext);
      const ciphertext = await encryptAttachmentChunk(
        plaintext,
        fileKey,
        noncePrefix,
        {
          formatVersion: 1,
          vaultId,
          blobId,
          chunkIndex,
          plaintextLength: plaintext.byteLength,
        },
      );
      throwIfAborted(input.signal);
      await writeAll(handle, ciphertext);
      chunks.push({
        plaintextLength: plaintext.byteLength,
        ciphertextLength: ciphertext.byteLength,
        ciphertextSha256: new Uint8Array(
          createHash('sha256').update(ciphertext).digest(),
        ),
      });
      plaintextLength += plaintext.byteLength;
      chunkIndex += 1;
    }
    throwIfAborted(input.signal);
    await handle.sync();
    await handle.close();
    handle = undefined;
    const manifest = encodeManifestV1({
      noncePrefix,
      plaintextLength,
      chunks,
    });
    decodeManifest(manifest);
    throwIfAborted(input.signal);
    await publishStagedBlob(input.paths, blobId, stagingPath);
    committed = true;
    const contentSha256 = new Uint8Array(plaintextSha256.digest());
    const result = Object.freeze({
      blobId,
      fileKey: Uint8Array.from(fileKey),
      manifestVersion: 1 as const,
      manifest,
      plaintextLength,
      contentSha256,
    });
    return result;
  } catch (error) {
    throw mapAttachmentError(error);
  } finally {
    await safeClose(handle);
    if (!committed) {
      try {
        await rm(stagingPath, { force: true });
      } catch {
        // Cleanup failure does not replace the operation's stable result.
      }
    }
    wipeBytes(fileKey);
  }
}
