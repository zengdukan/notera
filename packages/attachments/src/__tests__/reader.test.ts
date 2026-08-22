import { readFile, stat, truncate, writeFile } from 'node:fs/promises';
import { asBlobId, asVaultId } from '@notera/domain';
import { ATTACHMENT_CHUNK_BYTES } from '../constants';
import { BlobLeaseRegistry } from '../leases';
import { createAttachmentStore } from '../store';
import type { BlobReader, ImportedBlob } from '../types';
import {
  blobPath,
  createTestProfile,
  patternBytes,
  removeTestProfile,
  slicedSource,
  TEST_VAULT_ID,
} from './helpers';

const roots: string[] = [];

async function testRoot(): Promise<string> {
  const root = await createTestProfile();
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeTestProfile));
});

async function collect(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of source) {
    chunks.push(chunk);
    length += chunk.byteLength;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return result;
}

async function importBytes(
  root: string,
  plaintext: Uint8Array,
): Promise<{
  store: Awaited<ReturnType<typeof createAttachmentStore>>;
  imported: ImportedBlob;
}> {
  const store = await createAttachmentStore({ profileRoot: root });
  const imported = await store.importBlob({
    vaultId: TEST_VAULT_ID,
    source: slicedSource(plaintext, [17, 65537]),
  });
  return { store, imported };
}

async function openImported(
  store: Awaited<ReturnType<typeof createAttachmentStore>>,
  imported: ImportedBlob,
): Promise<BlobReader> {
  return store.openReader({
    vaultId: TEST_VAULT_ID,
    blobId: imported.blobId,
    fileKey: imported.fileKey,
    manifest: imported.manifest,
  });
}

describe('authenticated blob reading', () => {
  test('reads complete, individual, and ranged plaintext across chunks', async () => {
    const root = await testRoot();
    const plaintext = patternBytes(ATTACHMENT_CHUNK_BYTES + 257);
    const { store, imported } = await importBytes(root, plaintext);
    const reader = await openImported(store, imported);

    await expect(collect(reader.stream())).resolves.toEqual(plaintext);
    await expect(reader.readChunk(0)).resolves.toEqual(
      plaintext.slice(0, ATTACHMENT_CHUNK_BYTES),
    );
    await expect(reader.readChunk(1)).resolves.toEqual(
      plaintext.slice(ATTACHMENT_CHUNK_BYTES),
    );
    await expect(collect(reader.streamRange(31, 129))).resolves.toEqual(
      plaintext.slice(31, 129),
    );
    await expect(
      collect(
        reader.streamRange(
          ATTACHMENT_CHUNK_BYTES - 19,
          ATTACHMENT_CHUNK_BYTES + 23,
        ),
      ),
    ).resolves.toEqual(
      plaintext.slice(ATTACHMENT_CHUNK_BYTES - 19, ATTACHMENT_CHUNK_BYTES + 23),
    );
    await expect(collect(reader.streamRange(10, 10))).resolves.toEqual(
      new Uint8Array(),
    );

    await reader.close();
    await store.close();
  }, 60_000);

  test('authenticates an empty blob and validates read arguments', async () => {
    const root = await testRoot();
    const { store, imported } = await importBytes(root, new Uint8Array());
    const reader = await openImported(store, imported);

    await expect(collect(reader.stream())).resolves.toEqual(new Uint8Array());
    await expect(reader.readChunk(-1)).rejects.toMatchObject({
      code: 'INVALID_ATTACHMENT_INPUT',
    });
    await expect(reader.readChunk(1)).rejects.toMatchObject({
      code: 'INVALID_ATTACHMENT_INPUT',
    });
    await expect(collect(reader.streamRange(-1, 0))).rejects.toMatchObject({
      code: 'INVALID_ATTACHMENT_INPUT',
    });
    await expect(collect(reader.streamRange(0, 1))).rejects.toMatchObject({
      code: 'INVALID_ATTACHMENT_INPUT',
    });

    await reader.close();
    await expect(reader.readChunk(0)).rejects.toMatchObject({
      code: 'READER_CLOSED',
    });
    await store.close();
  });

  test('rejects ciphertext, hash, key, nonce, and vault substitution', async () => {
    const root = await testRoot();
    const plaintext = patternBytes(1024);
    const { store, imported } = await importBytes(root, plaintext);
    const path = blobPath(root, imported.blobId);
    const originalBlob = await readFile(path);

    const changedBlob = Buffer.from(originalBlob);
    changedBlob[0] ^= 1;
    await writeFile(path, changedBlob);
    const ciphertextReader = await openImported(store, imported);
    await expect(ciphertextReader.readChunk(0)).rejects.toMatchObject({
      code: 'BLOB_CORRUPT',
    });
    await ciphertextReader.close();
    await writeFile(path, originalBlob);

    const changedHashManifest = Uint8Array.from(imported.manifest);
    changedHashManifest[46] ^= 1;
    const hashReader = await store.openReader({
      vaultId: TEST_VAULT_ID,
      blobId: imported.blobId,
      fileKey: imported.fileKey,
      manifest: changedHashManifest,
    });
    await expect(hashReader.readChunk(0)).rejects.toMatchObject({
      code: 'BLOB_CORRUPT',
    });
    await hashReader.close();

    const wrongKeyReader = await store.openReader({
      vaultId: TEST_VAULT_ID,
      blobId: imported.blobId,
      fileKey: new Uint8Array(imported.fileKey.length).fill(0x44),
      manifest: imported.manifest,
    });
    await expect(wrongKeyReader.readChunk(0)).rejects.toMatchObject({
      code: 'BLOB_CORRUPT',
    });
    await wrongKeyReader.close();

    const changedNonceManifest = Uint8Array.from(imported.manifest);
    changedNonceManifest[10] ^= 1;
    const nonceReader = await store.openReader({
      vaultId: TEST_VAULT_ID,
      blobId: imported.blobId,
      fileKey: imported.fileKey,
      manifest: changedNonceManifest,
    });
    await expect(nonceReader.readChunk(0)).rejects.toMatchObject({
      code: 'BLOB_CORRUPT',
    });
    await nonceReader.close();

    const vaultReader = await store.openReader({
      vaultId: asVaultId('01890f47-6abc-7def-8abc-0123456789ac'),
      blobId: imported.blobId,
      fileKey: imported.fileKey,
      manifest: imported.manifest,
    });
    await expect(vaultReader.readChunk(0)).rejects.toMatchObject({
      code: 'BLOB_CORRUPT',
    });
    await vaultReader.close();
    await store.close();
  });

  test('rejects truncated and trailing blob files before reading', async () => {
    const root = await testRoot();
    const { store, imported } = await importBytes(root, patternBytes(1024));
    const path = blobPath(root, imported.blobId);
    const original = await readFile(path);
    await truncate(path, original.byteLength - 1);

    await expect(openImported(store, imported)).rejects.toMatchObject({
      code: 'BLOB_CORRUPT',
    });
    await writeFile(path, Buffer.concat([original, Buffer.from([0])]));
    await expect(openImported(store, imported)).rejects.toMatchObject({
      code: 'BLOB_CORRUPT',
    });
    await store.close();
  });
});

describe('blob leases and lifecycle', () => {
  test('blocks collection while a reader is open and deletes afterward', async () => {
    const root = await testRoot();
    const { store, imported } = await importBytes(root, patternBytes(128));
    const reader = await openImported(store, imported);

    await expect(store.collectBlob(imported.blobId)).rejects.toMatchObject({
      code: 'BLOB_IN_USE',
    });
    await expect(stat(blobPath(root, imported.blobId))).resolves.toBeDefined();

    await reader.close();
    await store.collectBlob(imported.blobId);
    await store.collectBlob(imported.blobId);
    await expect(openImported(store, imported)).rejects.toMatchObject({
      code: 'BLOB_MISSING',
    });
    await store.close();
  });

  test('prevents new reader leases while deletion is active', () => {
    const leases = new BlobLeaseRegistry();
    const blobId = asBlobId('123e4567-e89b-12d3-a456-426614174000');
    const finishDelete = leases.beginDelete(blobId);

    expect(() => leases.acquireReader(blobId)).toThrow(
      expect.objectContaining({ code: 'BLOB_IN_USE' }),
    );
    finishDelete();
    const release = leases.acquireReader(blobId);
    release();
  });

  test('store close closes readers and rejects later work', async () => {
    const root = await testRoot();
    const { store, imported } = await importBytes(root, patternBytes(128));
    const reader = await openImported(store, imported);

    await store.close();

    await expect(reader.readChunk(0)).rejects.toMatchObject({
      code: 'READER_CLOSED',
    });
    await expect(openImported(store, imported)).rejects.toMatchObject({
      code: 'STORE_CLOSED',
    });
    await expect(store.collectBlob(imported.blobId)).rejects.toMatchObject({
      code: 'STORE_CLOSED',
    });
  });

  test('rejects an already-cancelled reader without leaking paths', async () => {
    const root = await testRoot();
    const { store, imported } = await importBytes(root, patternBytes(128));
    const controller = new AbortController();
    controller.abort();

    await expect(
      store.openReader({
        vaultId: TEST_VAULT_ID,
        blobId: imported.blobId,
        fileKey: imported.fileKey,
        manifest: imported.manifest,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'OPERATION_ABORTED',
      message: 'The attachment operation was cancelled.',
    });
    await store.close();
  });
});
