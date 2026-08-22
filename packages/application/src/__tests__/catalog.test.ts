import {
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { asTimestamp } from '@notera/domain';

import { createProfileCatalog } from '../catalog';
import { ApplicationError } from '../errors';
import { createApplicationPaths } from '../paths';
import { VaultMetaStore } from '../vault-meta';
import {
  cleanupTempRoots,
  keyPackage,
  localProfileId,
  tempRoot,
  TEST_VAULT_ID,
} from './helpers';

const SESSION = 'abcdefabcdefabcdefabcdefabcdefab';

function entry(index: number, sortOrder = index) {
  return {
    localProfileId: localProfileId(index),
    displayName: ` Profile ${index} `,
    sortOrder,
    lastUsedAt: asTimestamp(index),
  };
}

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect((error as ApplicationError).code).toBe(code);
  }
}

afterEach(() => cleanupTempRoots());

describe('ProfileCatalog', () => {
  it('creates an empty catalog and atomically adds, updates, removes, and paginates', async () => {
    const paths = await createApplicationPaths(tempRoot());
    const { catalog } = await createProfileCatalog(paths, {
      createSessionName: () => SESSION,
    });
    expect(catalog.list({ limit: 10 }).items).toEqual([]);

    await catalog.add(entry(2, 1));
    await catalog.add(entry(1, 1));
    await catalog.add(entry(3, 2));
    expect(catalog.get(localProfileId(1))?.displayName).toBe('Profile 1');
    const first = catalog.list({ limit: 2 }, localProfileId(1));
    expect(first.items.map(({ localProfileId }) => localProfileId)).toEqual([
      localProfileId(1),
      localProfileId(2),
    ]);
    expect(first.items[0].isCurrent).toBe(true);
    const second = catalog.list({ limit: 2, cursor: first.nextCursor });
    expect(second.items.map(({ localProfileId }) => localProfileId)).toEqual([
      localProfileId(3),
    ]);

    await catalog.updateCache({ ...entry(1, 1), displayName: 'Real Name' });
    expect(catalog.get(localProfileId(1))?.displayName).toBe('Real Name');
    await catalog.remove(localProfileId(2));
    expect(catalog.has(localProfileId(2))).toBe(false);
    expect(JSON.parse(readFileSync(paths.catalog, 'utf8'))).toMatchObject({
      version: 1,
      entries: expect.any(Array),
    });
    expect(readFileSync(paths.catalogBackup, 'utf8')).toContain('Profile 2');

    expectCode(() => catalog.list({ limit: 0 }), 'OPERATION_FAILED');
    expectCode(
      () => catalog.list({ limit: 2, cursor: 'tampered' }),
      'OPERATION_FAILED',
    );
  });

  it('does not mutate memory when snapshot persistence fails', async () => {
    const paths = await createApplicationPaths(tempRoot());
    let fail = false;
    const { catalog } = await createProfileCatalog(paths, {
      createSessionName: () => SESSION,
      async writeSnapshot(target, backup, current, next, sessionName) {
        if (fail) throw new ApplicationError('DISK_FULL');
        const { replaceFileWithBackup } = await import('../atomic-file');
        await replaceFileWithBackup(target, backup, current, next, sessionName);
      },
    });
    await catalog.add(entry(1));
    fail = true;
    await expect(catalog.add(entry(2))).rejects.toMatchObject({
      code: 'DISK_FULL',
    });
    expect(catalog.has(localProfileId(1))).toBe(true);
    expect(catalog.has(localProfileId(2))).toBe(false);
  });

  it('restores a corrupt primary from backup and rejects invalid mutations', async () => {
    const paths = await createApplicationPaths(tempRoot());
    const created = await createProfileCatalog(paths, {
      createSessionName: () => SESSION,
    });
    await created.catalog.add(entry(1));
    await created.catalog.add(entry(2));
    mkdirSync(paths.profile(localProfileId(1)).root);
    mkdirSync(paths.profile(localProfileId(2)).root);
    writeFileSync(paths.catalog, '{broken');

    const reopened = await createProfileCatalog(paths, {
      createSessionName: () => SESSION,
    });
    expect(reopened.catalog.has(localProfileId(1))).toBe(true);
    expect(reopened.catalog.has(localProfileId(2))).toBe(false);
    expect(readFileSync(paths.catalog, 'utf8')).toBe(
      readFileSync(paths.catalogBackup, 'utf8'),
    );

    await expect(
      reopened.catalog.add({ ...entry(3), displayName: ' '.repeat(2) }),
    ).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(
      reopened.catalog.add({ ...entry(3), sortOrder: -1 }),
    ).rejects.toMatchObject({ code: 'OPERATION_FAILED' });
  });
});

describe('catalog startup recovery', () => {
  it('rebuilds valid unindexed metadata and cleans unpublished creating directories', async () => {
    const paths = await createApplicationPaths(tempRoot());
    const validId = localProfileId(11);
    const validPaths = paths.profile(validId);
    mkdirSync(validPaths.root);
    await new VaultMetaStore(validPaths, () => SESSION).writeInitial({
      metaVersion: 1,
      localProfileId: validId,
      vaultId: TEST_VAULT_ID,
      fileFormatVersion: 1,
      keyPackage: keyPackage(),
    });

    const unpublishedId = localProfileId(12);
    const unpublished = paths.profile(unpublishedId);
    mkdirSync(unpublished.root);
    writeFileSync(unpublished.creatingMarker, '');

    const { catalog, report } = await createProfileCatalog(paths, {
      createSessionName: () => SESSION,
    });
    expect(catalog.get(validId)?.displayName).toBe('Profile 20000000');
    expect(catalog.has(unpublishedId)).toBe(false);
    expect(report.recoveredProfileCount).toBe(1);
    expect(report.removedCreatingDirectoryCount).toBe(1);
  });

  it('continues safe deleting entries and preserves links and unknown trees', async () => {
    const root = tempRoot();
    const paths = await createApplicationPaths(root);
    mkdirSync(paths.deletingRoot);
    const removedId = localProfileId(21);
    const deletion = join(paths.deletingRoot, `${removedId}.${SESSION}`);
    mkdirSync(deletion);
    writeFileSync(join(deletion, 'data'), 'delete');

    const outside = join(root, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'keep'), 'keep');
    symlinkSync(outside, join(paths.profilesRoot, 'linked'), 'junction');
    mkdirSync(join(paths.profilesRoot, 'unknown-tree'));

    const { report } = await createProfileCatalog(paths, {
      createSessionName: () => SESSION,
    });
    expect(report.resumedDeletionCount).toBe(1);
    expect(report.unexpectedEntryCount).toBe(2);
    expect(readFileSync(join(outside, 'keep'), 'utf8')).toBe('keep');
  });
});
