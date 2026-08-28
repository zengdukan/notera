import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ATTACHMENT_CHUNK_BYTES, MAX_ATTACHMENT_BYTES } from '../constants';
import { fixedSizeChunks } from '../chunker';
import { publishStagedBlob, writeAll } from '../importer';
import { createAttachmentPaths } from '../paths';
import { createAttachmentStore } from '../store';
import {
  blobPath,
  createTestProfile,
  decryptImportedBlob,
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

describe('attachment store startup', () => {
  test('cleans only recognized staging files and reports other entries', async () => {
    const root = await testRoot();
    const staging = join(root, 'staging');
    await mkdir(join(staging, 'unknown-directory'), { recursive: true });
    const stagedName = `123e4567-e89b-12d3-a456-426614174000.${'ab'.repeat(
      16,
    )}.part`;
    await writeFile(join(staging, stagedName), 'ciphertext');
    await writeFile(join(staging, 'keep.txt'), 'user data');

    const store = await createAttachmentStore({ profileRoot: root });

    expect(store.startupRecovery).toEqual({
      removedStagingFileCount: 1,
      unexpectedEntryCount: 2,
    });
    expect((await readdir(staging)).sort()).toEqual([
      'keep.txt',
      'unknown-directory',
    ]);
    await store.close();
  });

  test('enforces one store per canonical profile root and releases on close', async () => {
    const root = await testRoot();
    const first = await createAttachmentStore({ profileRoot: root });

    await expect(
      createAttachmentStore({ profileRoot: join(root, '.') }),
    ).rejects.toMatchObject({ code: 'STORE_ALREADY_OPEN' });

    await first.close();
    const reopened = await createAttachmentStore({ profileRoot: root });
    await reopened.close();
  });
});

describe('streaming attachment import', () => {
  test('returns the SHA-256 digest of empty plaintext', async () => {
    const root = await testRoot();
    const store = await createAttachmentStore({ profileRoot: root });

    const imported = await store.importBlob({
      vaultId: TEST_VAULT_ID,
      source: slicedSource(new Uint8Array(), [1]),
    });

    expect(Buffer.from(imported.contentSha256).toString('hex')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    await store.close();
  });

  test.each([
    [ATTACHMENT_CHUNK_BYTES, [1, 8191, 77777]],
    [ATTACHMENT_CHUNK_BYTES + 1, [ATTACHMENT_CHUNK_BYTES + 1]],
  ] as const)(
    'hashes %i plaintext bytes independently of source slicing',
    async (length, sliceSizes) => {
      const root = await testRoot();
      const store = await createAttachmentStore({ profileRoot: root });
      const plaintext = patternBytes(length);
      const expected = createHash('sha256').update(plaintext).digest();

      const imported = await store.importBlob({
        vaultId: TEST_VAULT_ID,
        source: slicedSource(plaintext, sliceSizes),
      });

      expect(imported.contentSha256).toEqual(new Uint8Array(expected));
      await store.close();
    },
    30_000,
  );

  test('repeated content shares a defensive digest but not encrypted identity', async () => {
    const root = await testRoot();
    const store = await createAttachmentStore({ profileRoot: root });
    const plaintext = patternBytes(ATTACHMENT_CHUNK_BYTES + 1);

    const first = await store.importBlob({
      vaultId: TEST_VAULT_ID,
      source: slicedSource(plaintext, [1, 8191]),
    });
    const expectedDigest = Uint8Array.from(first.contentSha256);
    first.contentSha256.fill(0);
    const second = await store.importBlob({
      vaultId: TEST_VAULT_ID,
      source: slicedSource(plaintext, [77777]),
    });

    expect(second.contentSha256).toEqual(expectedDigest);
    expect(second.blobId).not.toBe(first.blobId);
    expect(second.fileKey).not.toEqual(first.fileKey);
    expect(second.manifest).not.toEqual(first.manifest);
    await store.close();
  }, 30_000);

  test.each([0, 1, ATTACHMENT_CHUNK_BYTES + 1])(
    'imports and decrypts %i plaintext bytes',
    async (length) => {
      const root = await testRoot();
      const store = await createAttachmentStore({ profileRoot: root });
      const plaintext = patternBytes(length);

      const imported = await store.importBlob({
        vaultId: TEST_VAULT_ID,
        source: slicedSource(plaintext, [1, 8191, 77777]),
      });

      expect(imported.plaintextLength).toBe(length);
      await expect(decryptImportedBlob(root, imported)).resolves.toEqual(
        plaintext,
      );
      expect(await readdir(join(root, 'staging'))).toEqual([]);
      const encrypted = await readFile(blobPath(root, imported.blobId));
      expect(
        plaintext.byteLength < 32 ||
          !encrypted.includes(Buffer.from(plaintext.subarray(0, 32))),
      ).toBe(true);
      await store.close();
    },
    30_000,
  );

  test('chunks exactly 500 MiB and rejects the first excess byte', async () => {
    const chunkCount = MAX_ATTACHMENT_BYTES / ATTACHMENT_CHUNK_BYTES;
    async function* source(extraByte: boolean): AsyncIterable<Uint8Array> {
      for (let index = 0; index < chunkCount; index += 1) {
        yield new Uint8Array(ATTACHMENT_CHUNK_BYTES);
      }
      if (extraByte) yield new Uint8Array(1);
    }

    let total = 0;
    let count = 0;
    for await (const chunk of fixedSizeChunks(source(false))) {
      total += chunk.byteLength;
      count += 1;
    }
    expect({ total, count }).toEqual({
      total: MAX_ATTACHMENT_BYTES,
      count: chunkCount,
    });
    let consumed = 0;
    await expect(async () => {
      for await (const chunk of fixedSizeChunks(source(true))) {
        consumed += chunk.byteLength;
      }
    }).rejects.toMatchObject({ code: 'ATTACHMENT_TOO_LARGE' });
    expect(consumed).toBe(MAX_ATTACHMENT_BYTES);
  });

  test('cleans staging after source failure and cancellation', async () => {
    const root = await testRoot();
    const store = await createAttachmentStore({ profileRoot: root });
    const failedSource = async function* failedAttachmentSource() {
      yield new Uint8Array([1, 2, 3]);
      throw new Error('sensitive source failure');
    };
    await expect(
      store.importBlob({ vaultId: TEST_VAULT_ID, source: failedSource() }),
    ).rejects.toMatchObject({
      code: 'ATTACHMENT_IO_FAILED',
      message: 'The attachment storage operation failed.',
    });

    const controller = new AbortController();
    const cancelledSource = async function* cancelledAttachmentSource() {
      yield new Uint8Array([1, 2, 3]);
      controller.abort();
      yield new Uint8Array([4]);
    };
    await expect(
      store.importBlob({
        vaultId: TEST_VAULT_ID,
        source: cancelledSource(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_ABORTED' });

    expect(await readdir(join(root, 'staging'))).toEqual([]);
    expect(await readdir(join(root, 'blobs'))).toEqual([]);
    await store.close();
  });

  test('closing the store cancels a pending source and rejects new imports', async () => {
    const root = await testRoot();
    const store = await createAttachmentStore({ profileRoot: root });
    let announceStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      announceStarted = resolve;
    });
    const source = {
      async *[Symbol.asyncIterator]() {
        announceStarted();
        await new Promise<never>(() => {
          // Keep the source pending until store closure aborts iteration.
        });
      },
    };
    const importing = store.importBlob({
      vaultId: TEST_VAULT_ID,
      source,
    });
    await started;

    await store.close();

    await expect(importing).rejects.toMatchObject({
      code: 'OPERATION_ABORTED',
    });
    await expect(
      store.importBlob({
        vaultId: TEST_VAULT_ID,
        source: slicedSource(new Uint8Array(), [1]),
      }),
    ).rejects.toMatchObject({ code: 'STORE_CLOSED' });
    expect(await readdir(join(root, 'staging'))).toEqual([]);
  });
});

describe('atomic blob file helpers', () => {
  test('writeAll retries short writes and rejects zero progress', async () => {
    const writes: Array<{ offset: number; length: number }> = [];
    const shortWriter = {
      async write(
        _buffer: Uint8Array,
        offset: number,
        length: number,
      ): Promise<{ bytesWritten: number }> {
        writes.push({ offset, length });
        return { bytesWritten: Math.min(2, length) };
      },
    };

    await writeAll(shortWriter, new Uint8Array(5));
    expect(writes).toEqual([
      { offset: 0, length: 5 },
      { offset: 2, length: 3 },
      { offset: 4, length: 1 },
    ]);
    await expect(
      writeAll(
        {
          async write() {
            return { bytesWritten: 0 };
          },
        },
        new Uint8Array(1),
      ),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_IO_FAILED' });
  });

  test('refuses to overwrite an existing final blob', async () => {
    const root = await testRoot();
    const paths = await createAttachmentPaths(root);
    const blobId = '123e4567-e89b-12d3-a456-426614174000';
    const finalPath = blobPath(root, blobId);
    const stagingPath = join(
      paths.stagingRoot,
      `${blobId}.${'ab'.repeat(16)}.part`,
    );
    await mkdir(join(root, 'blobs', '12'), { recursive: true });
    await writeFile(finalPath, 'original');
    await writeFile(stagingPath, 'replacement');

    await expect(
      publishStagedBlob(paths, blobId, stagingPath),
    ).rejects.toMatchObject({ code: 'BLOB_ALREADY_EXISTS' });
    await expect(readFile(finalPath, 'utf8')).resolves.toBe('original');
  });
});
