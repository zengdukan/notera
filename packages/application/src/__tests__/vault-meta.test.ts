import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { LocalProfileId } from '@notera/domain';

import {
  replaceFileAtomically,
  replaceFileWithBackup,
  type AtomicFileHandle,
  type AtomicFileOperations,
  writeFileExclusively,
} from '../atomic-file';
import { ApplicationError } from '../errors';
import { createApplicationPaths } from '../paths';
import {
  decodeVaultMeta,
  encodeVaultMeta,
  VaultMetaStore,
  type VaultMetaV1,
} from '../vault-meta';
import {
  cleanupTempRoots,
  keyPackage,
  tempRoot,
  TEST_LOCAL_PROFILE_ID,
  TEST_VAULT_ID,
} from './helpers';

const SESSION = '0123456789abcdef0123456789abcdef';

function meta(): VaultMetaV1 {
  return {
    metaVersion: 1,
    localProfileId: TEST_LOCAL_PROFILE_ID,
    vaultId: TEST_VAULT_ID,
    fileFormatVersion: 1,
    keyPackage: keyPackage(),
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

async function expectAsyncCode(
  operation: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect((error as ApplicationError).code).toBe(code);
  }
}

afterEach(() => {
  cleanupTempRoots();
});

describe('strict vault metadata', () => {
  it('encodes a deterministic canonical UTF-8 fixture and digest', () => {
    const first = encodeVaultMeta(meta());
    const second = encodeVaultMeta(meta());
    const expected =
      `${JSON.stringify({
        metaVersion: 1,
        localProfileId: TEST_LOCAL_PROFILE_ID,
        vaultId: TEST_VAULT_ID,
        fileFormatVersion: 1,
        keyPackage: keyPackage(),
      })}\n`;

    expect(Buffer.from(first.bytes).toString('utf8')).toBe(expected);
    expect(Buffer.from(first.bytes).toString('hex')).toBe(
      Buffer.from(expected).toString('hex'),
    );
    expect(first.bytes).toEqual(second.bytes);
    expect(first.digest).toEqual(second.digest);
    expect(Buffer.from(first.digest).toString('hex')).toHaveLength(64);
  });

  it('round-trips frozen copies without exposing mutable nested state', () => {
    const input = meta();
    const encoded = encodeVaultMeta(input);
    const originalBytes = Uint8Array.from(encoded.bytes);
    encoded.bytes.fill(0);
    encoded.digest.fill(0);
    (input.keyPackage.wrappedDatabaseKey as { nonce: string }).nonce = 'changed';

    const decoded = decodeVaultMeta(originalBytes);
    expect(decoded.value).toEqual(meta());
    expect(Object.isFrozen(decoded.value)).toBe(true);
    expect(Object.isFrozen(decoded.value.keyPackage)).toBe(true);
    expect(Object.isFrozen(decoded.value.keyPackage.wrappedDatabaseKey)).toBe(
      true,
    );
    decoded.bytes.fill(0);
    decoded.digest.fill(0);
    expect(decodeVaultMeta(originalBytes).value).toEqual(meta());
  });

  it.each([
    'null',
    '[]',
    '{}',
    `${JSON.stringify({ ...meta(), unknown: true })}\n`,
    `${JSON.stringify({ ...meta(), metaVersion: 2 })}\n`,
    `${JSON.stringify({ ...meta(), fileFormatVersion: 2 })}\n`,
    `${JSON.stringify({ ...meta(), localProfileId: 'not-an-id' })}\n`,
    `${JSON.stringify({
      ...meta(),
      localProfileId: TEST_LOCAL_PROFILE_ID.toUpperCase(),
    })}\n`,
    `${JSON.stringify({
      ...meta(),
      keyPackage: { ...keyPackage(), salt: 'not-base64' },
    })}\n`,
    `${JSON.stringify({
      ...meta(),
      keyPackage: { ...keyPackage(), salt: Buffer.alloc(15).toString('base64') },
    })}\n`,
    `${JSON.stringify({
      ...meta(),
      keyPackage: {
        ...keyPackage(),
        wrappedDatabaseKey: {
          ...keyPackage().wrappedDatabaseKey,
          nonce: Buffer.alloc(23).toString('base64'),
        },
      },
    })}\n`,
    `${JSON.stringify({
      ...meta(),
      keyPackage: {
        ...keyPackage(),
        wrappedVaultKey: {
          ...keyPackage().wrappedVaultKey,
          ciphertext: Buffer.alloc(47).toString('base64'),
        },
      },
    })}\n`,
    `${JSON.stringify(meta())}\ntrailing`,
  ])('rejects invalid metadata without echoing it', (text) => {
    let caught: ApplicationError | undefined;
    try {
      decodeVaultMeta(Buffer.from(text));
    } catch (error) {
      caught = error as ApplicationError;
    }
    expect(caught?.code).toBe('VAULT_META_INVALID');
    expect(caught?.message).not.toContain(text);
  });
});

describe('trusted profile paths', () => {
  it('canonicalizes roots and derives paths only from a canonical ID', async () => {
    const root = tempRoot();
    const realRoot = join(root, 'real');
    const linkedRoot = join(root, 'linked');
    mkdirSync(realRoot);
    symlinkSync(realRoot, linkedRoot, 'junction');

    const paths = await createApplicationPaths(linkedRoot);
    const profile = paths.profile(TEST_LOCAL_PROFILE_ID);
    expect(paths.appDataRoot).toBe(realRoot);
    expect(profile.root).toBe(join(realRoot, 'profiles', TEST_LOCAL_PROFILE_ID));
    expect(profile.vaultMeta).toBe(join(profile.root, 'vault.meta'));
    expect(Object.isFrozen(paths)).toBe(true);
    expect(Object.isFrozen(profile)).toBe(true);

    expectCode(
      () => paths.profile('../escape' as LocalProfileId),
      'OPERATION_FAILED',
    );
    expectCode(() => paths.temporarySibling(profile.vaultMeta, 'BAD'), 'OPERATION_FAILED');
    expect(paths.temporarySibling(profile.vaultMeta, SESSION)).toBe(
      `${profile.vaultMeta}.${SESSION}.tmp`,
    );
  });
});

describe('atomic files and VaultMetaStore', () => {
  it('writes official and next metadata exclusively and reads only official', async () => {
    const paths = await createApplicationPaths(tempRoot());
    const profile = paths.profile(TEST_LOCAL_PROFILE_ID);
    mkdirSync(profile.root);
    const store = new VaultMetaStore(profile, () => SESSION);

    await store.writeInitial(meta());
    const official = await store.read();
    expect(official.value).toEqual(meta());
    await expectAsyncCode(() => store.writeInitial(meta()), 'SAVE_FAILED');

    const next = { ...meta(), keyPackage: keyPackage() };
    await store.writeNext(next);
    await expectAsyncCode(() => store.writeNext(next), 'SAVE_FAILED');
    expect((await store.read()).bytes).toEqual(official.bytes);

    await store.promoteNext();
    expect((await store.read()).value).toEqual(next);
    await store.discardNext();
  });

  it('continues short writes, syncs, closes, and uses exclusive mode 0600', async () => {
    const writes: number[] = [];
    let closed = 0;
    let synced = 0;
    const handle: AtomicFileHandle = {
      async write(_bytes, offset, length) {
        writes.push(offset);
        return { bytesWritten: Math.min(2, length) };
      },
      async sync() {
        synced += 1;
      },
      async close() {
        closed += 1;
      },
    };
    const operations: AtomicFileOperations = {
      async open(_path, flags, mode) {
        expect(flags).toBe('wx');
        expect(mode).toBe(0o600);
        return handle;
      },
      async link() {},
      async rename() {},
      async unlink() {},
    };

    await writeFileExclusively(
      join(tempRoot(), 'vault.meta'),
      Uint8Array.of(1, 2, 3, 4, 5),
      SESSION,
      operations,
    );
    expect(writes).toEqual([0, 2, 4]);
    expect(synced).toBe(1);
    expect(closed).toBe(1);
  });

  it.each([
    ['zero write', undefined, 0, 'SAVE_FAILED'],
    ['disk full', 'ENOSPC', undefined, 'DISK_FULL'],
  ])('cleans only its exact temporary file after %s', async (_name, nativeCode, bytesWritten, code) => {
    const root = tempRoot();
    const target = join(root, 'vault.meta');
    const unrelated = `${target}.unrelated.tmp`;
    writeFileSync(unrelated, 'keep');
    const unlinked: string[] = [];
    let closed = 0;
    const operations: AtomicFileOperations = {
      async open() {
        if (nativeCode !== undefined) {
          throw Object.assign(new Error('sensitive native failure'), {
            code: nativeCode,
          });
        }
        return {
          async write() {
            return { bytesWritten: bytesWritten ?? 1 };
          },
          async sync() {},
          async close() {
            closed += 1;
          },
        };
      },
      async link() {},
      async rename() {},
      async unlink(path) {
        unlinked.push(path);
      },
    };

    await expectAsyncCode(
      () => writeFileExclusively(target, Uint8Array.of(1), SESSION, operations),
      code,
    );
    expect(unlinked).toEqual([`${target}.${SESSION}.tmp`]);
    expect(readFileSync(unrelated, 'utf8')).toBe('keep');
    expect(closed).toBe(nativeCode === undefined ? 1 : 0);
  });

  it('keeps old content before rename and new content after the commit point', async () => {
    const root = tempRoot();
    const target = join(root, 'profile-index.json');
    writeFileSync(target, 'old');
    await expectAsyncCode(
      () =>
        replaceFileAtomically(target, Buffer.from('new'), SESSION, {
          async open(path, flags, mode) {
            const file = await import('node:fs/promises');
            return file.open(path, flags, mode);
          },
          async link(source, destination) {
            const file = await import('node:fs/promises');
            await file.link(source, destination);
          },
          async rename() {
            throw new Error('private rename failure');
          },
          async unlink(path) {
            const file = await import('node:fs/promises');
            await file.unlink(path);
          },
        }),
      'SAVE_FAILED',
    );
    expect(readFileSync(target, 'utf8')).toBe('old');

    await replaceFileAtomically(target, Buffer.from('new'), SESSION);
    expect(readFileSync(target, 'utf8')).toBe('new');
  });

  it('persists validated backup bytes before replacing catalog bytes', async () => {
    const root = tempRoot();
    const target = join(root, 'profile-index.json');
    const backup = `${target}.bak`;
    writeFileSync(target, 'old');

    await replaceFileWithBackup(
      target,
      backup,
      Buffer.from('old'),
      Buffer.from('new'),
      SESSION,
    );

    expect(readFileSync(backup, 'utf8')).toBe('old');
    expect(readFileSync(target, 'utf8')).toBe('new');
  });
});
