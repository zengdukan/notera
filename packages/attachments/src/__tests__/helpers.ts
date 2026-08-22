import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decryptAttachmentChunk } from '@notera/crypto';
import { asVaultId } from '@notera/domain';
import { decodeManifest } from '../manifest';
import type { ImportedBlob } from '../types';

export const TEST_VAULT_ID = asVaultId('01890f47-6abc-7def-8abc-0123456789ab');

export async function createTestProfile(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'notera-attachments-'));
}

export async function removeTestProfile(root: string): Promise<void> {
  await rm(root, { force: true, recursive: true });
}

export function blobPath(root: string, blobId: string): string {
  const compact = blobId.replace(/-/g, '');
  return join(root, 'blobs', compact.slice(0, 2), `${blobId}.blob`);
}

export function patternBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_value, index) => index % 251);
}

export async function* slicedSource(
  bytes: Uint8Array,
  sliceSizes: readonly number[],
): AsyncIterable<Uint8Array> {
  let offset = 0;
  let index = 0;
  while (offset < bytes.length) {
    const size = sliceSizes[index % sliceSizes.length];
    const end = Math.min(bytes.length, offset + size);
    yield bytes.slice(offset, end);
    offset = end;
    index += 1;
  }
}

export async function decryptImportedBlob(
  root: string,
  imported: ImportedBlob,
): Promise<Uint8Array> {
  const manifest = decodeManifest(imported.manifest);
  const ciphertext = await readFile(blobPath(root, imported.blobId));
  const chunks: Uint8Array[] = [];
  for (const chunk of manifest.chunks) {
    const encrypted = ciphertext.subarray(
      chunk.ciphertextOffset,
      chunk.ciphertextOffset + chunk.ciphertextLength,
    );
    chunks.push(
      await decryptAttachmentChunk(
        encrypted,
        imported.fileKey,
        manifest.noncePrefix,
        {
          formatVersion: 1,
          vaultId: TEST_VAULT_ID,
          blobId: imported.blobId,
          chunkIndex: chunk.index,
          plaintextLength: chunk.plaintextLength,
        },
      ),
    );
  }
  const result = new Uint8Array(imported.plaintextLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
