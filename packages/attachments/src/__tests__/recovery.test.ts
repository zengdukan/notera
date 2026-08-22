import {
  mkdir,
  readFile,
  readdir,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { asBlobId } from '@notera/domain';
import { createAttachmentStore } from '../store';
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

async function treeSnapshot(root: string): Promise<readonly string[]> {
  const result: string[] = [];
  async function visit(path: string, relative: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const childPath = join(path, entry.name);
      const childRelative = join(relative, entry.name).replace(/\\/g, '/');
      if (entry.isFile()) {
        const content = await readFile(childPath);
        result.push(
          `file:${childRelative}:${createHash('sha256')
            .update(content)
            .digest('hex')}`,
        );
      } else if (entry.isDirectory()) {
        result.push(`directory:${childRelative}`);
        await visit(childPath, childRelative);
      } else {
        result.push(`other:${childRelative}`);
      }
    }
  }
  await visit(root, '');
  return result;
}

describe('final blob reconciliation', () => {
  test('reports missing and orphan blobs in stable order', async () => {
    const root = await testRoot();
    const store = await createAttachmentStore({ profileRoot: root });
    const first = await store.importBlob({
      vaultId: TEST_VAULT_ID,
      source: slicedSource(patternBytes(16), [3]),
    });
    const second = await store.importBlob({
      vaultId: TEST_VAULT_ID,
      source: slicedSource(patternBytes(32), [7]),
    });
    const missingA = asBlobId('00000000-0000-4000-8000-000000000002');
    const missingB = asBlobId('00000000-0000-4000-8000-000000000001');

    const report = await store.reconcile(
      new Set([second.blobId, missingA, missingB]),
    );

    expect(report).toEqual({
      missingBlobIds: [missingB, missingA],
      orphanBlobIds: [first.blobId],
      unexpectedEntryCount: 0,
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.missingBlobIds)).toBe(true);
    expect(Object.isFrozen(report.orphanBlobIds)).toBe(true);
    await store.close();
  });

  test('counts unexpected entries without following or changing them', async () => {
    const root = await testRoot();
    const store = await createAttachmentStore({ profileRoot: root });
    const imported = await store.importBlob({
      vaultId: TEST_VAULT_ID,
      source: slicedSource(patternBytes(16), [16]),
    });
    const blobs = join(root, 'blobs');
    await writeFile(join(blobs, 'root-file'), 'keep');
    await mkdir(join(blobs, 'zz'), { recursive: true });
    await writeFile(join(blobs, 'zz', 'bad.blob'), 'keep');
    await mkdir(join(blobs, 'aa', 'nested'), { recursive: true });
    await writeFile(join(blobs, 'aa', 'wrong-name.blob'), 'keep');
    const linkTarget = join(root, 'link-target');
    await mkdir(linkTarget);
    await symlink(linkTarget, join(blobs, 'link'), 'junction');
    const before = await treeSnapshot(root);

    const report = await store.reconcile(new Set([imported.blobId]));

    expect(report).toEqual({
      missingBlobIds: [],
      orphanBlobIds: [],
      unexpectedEntryCount: 5,
    });
    expect(await treeSnapshot(root)).toEqual(before);
    await store.close();
  });

  test('copies the known set before asynchronous scanning', async () => {
    const root = await testRoot();
    const store = await createAttachmentStore({ profileRoot: root });
    const imported = await store.importBlob({
      vaultId: TEST_VAULT_ID,
      source: slicedSource(patternBytes(16), [16]),
    });
    const known = new Set([imported.blobId]);

    const reconciling = store.reconcile(known);
    known.clear();

    await expect(reconciling).resolves.toEqual({
      missingBlobIds: [],
      orphanBlobIds: [],
      unexpectedEntryCount: 0,
    });
    await store.close();
  });

  test('rejects invalid ids and a closed store with safe errors', async () => {
    const root = await testRoot();
    const store = await createAttachmentStore({ profileRoot: root });

    await expect(
      store.reconcile(
        new Set(['not-a-uuid']) as unknown as ReadonlySet<never>,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ATTACHMENT_INPUT',
      message: 'The attachment input is invalid.',
    });
    await store.close();
    await expect(store.reconcile(new Set())).rejects.toMatchObject({
      code: 'STORE_CLOSED',
    });
  });

  test('reports a missing known blob without creating it', async () => {
    const root = await testRoot();
    const store = await createAttachmentStore({ profileRoot: root });
    const missing = asBlobId('00000000-0000-4000-8000-000000000001');

    await expect(store.reconcile(new Set([missing]))).resolves.toEqual({
      missingBlobIds: [missing],
      orphanBlobIds: [],
      unexpectedEntryCount: 0,
    });
    await expect(stat(blobPath(root, missing))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await store.close();
  });
});
