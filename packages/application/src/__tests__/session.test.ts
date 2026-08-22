import type { AttachmentStore } from '@notera/attachments';
import {
  asLocalProfileId,
  asFolderId,
  asVaultId,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import { createProfileSession } from '../session';

const LOCAL_ID = asLocalProfileId('30000000-0000-4000-8000-000000000001');
const VAULT_ID = asVaultId('30000000-0000-4000-8000-000000000002');
const ROOT_ID = asFolderId('30000000-0000-4000-8000-000000000003');

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function resources(options: {
  attachmentClose?: () => Promise<void>;
  databaseClose?: () => void;
} = {}) {
  let attachmentCloses = 0;
  let databaseCloses = 0;
  const attachments = {
    close: async () => {
      attachmentCloses += 1;
      await options.attachmentClose?.();
    },
  } as AttachmentStore;
  const database = {
    close: () => {
      databaseCloses += 1;
      options.databaseClose?.();
    },
  } as VaultDatabase;
  return {
    attachments,
    database,
    counts: () => ({ attachmentCloses, databaseCloses }),
  };
}

function create(options: Parameters<typeof resources>[0] = {}) {
  const owned = resources(options);
  const databaseKey = Uint8Array.from({ length: 32 }, () => 11);
  const vaultKey = Uint8Array.from({ length: 32 }, () => 22);
  const observations: Array<{ phase: string; database: number[]; vault: number[] }> = [];
  const session = createProfileSession(
    {
      localProfileId: LOCAL_ID,
      vaultId: VAULT_ID,
      rootFolderId: ROOT_ID,
      displayName: 'Profile',
      databaseKey,
      vaultKey,
      database: owned.database,
      attachments: owned.attachments,
    },
    {
      observeKeys(phase, database, vault) {
        observations.push({
          phase,
          database: [...database],
          vault: [...vault],
        });
      },
    },
  );
  return { ...owned, databaseKey, vaultKey, observations, session };
}

describe('ProfileSession', () => {
  it('copies keys, waits for registered work, aborts, and closes in order', async () => {
    const events: string[] = [];
    const gate = deferred();
    const setup = create({
      attachmentClose: async () => {
        events.push('attachments');
      },
      databaseClose: () => events.push('database'),
    });
    setup.databaseKey.fill(0);
    setup.vaultKey.fill(0);

    const active = setup.session.run(async ({ signal }) => {
      events.push('operation');
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          events.push('abort');
          resolve();
        });
      });
      await gate.promise;
      events.push('settled');
    });
    await Promise.resolve();
    const closing = setup.session.close();
    await expect(
      setup.session.run(() => undefined),
    ).rejects.toMatchObject({ code: 'PROFILE_LOCKED' });
    expect(events).toEqual(['operation', 'abort']);
    gate.resolve();
    await active;
    await closing;

    expect(events).toEqual([
      'operation',
      'abort',
      'settled',
      'attachments',
      'database',
    ]);
    expect(setup.observations[0]).toMatchObject({
      phase: 'before',
      database: Array(32).fill(11),
      vault: Array(32).fill(22),
    });
    expect(setup.observations[1]).toMatchObject({
      phase: 'after',
      database: Array(32).fill(0),
      vault: Array(32).fill(0),
    });
  });

  it('supports synchronous run and immutable display-name updates while open', async () => {
    const { session } = create();
    await expect(session.run(() => 42)).resolves.toBe(42);
    const old = session.summary;
    session.updateDisplayName(' Renamed ');
    expect(session.summary.displayName).toBe('Renamed');
    expect(old.displayName).toBe('Profile');
    expect(Object.isFrozen(session.summary)).toBe(true);
    await session.close();
    expect(() => session.updateDisplayName('Again')).toThrow(
      expect.objectContaining({ code: 'PROFILE_LOCKED' }),
    );
  });

  it('continues cleanup and returns the first stable close error', async () => {
    const setup = create({
      attachmentClose: async () => {
        throw new Error('sensitive attachment failure');
      },
      databaseClose: () => {
        throw new Error('sensitive database failure');
      },
    });
    await expect(setup.session.close()).rejects.toEqual(
      new ApplicationError('OPERATION_FAILED'),
    );
    expect(setup.counts()).toEqual({ attachmentCloses: 1, databaseCloses: 1 });
    expect(setup.observations.at(-1)?.database).toEqual(Array(32).fill(0));
  });

  it('coalesces concurrent and repeated close calls', async () => {
    const gate = deferred();
    const setup = create({ attachmentClose: () => gate.promise });
    const first = setup.session.close();
    const second = setup.session.close();
    expect(first).toBe(second);
    gate.resolve();
    await Promise.all([first, second]);
    await setup.session.close();
    expect(setup.counts()).toEqual({ attachmentCloses: 1, databaseCloses: 1 });
    expect(setup.session.summary).not.toHaveProperty('database');
    expect(setup.session.summary).not.toHaveProperty('attachments');
  });

  it('rejects invalid identities and key lengths without exposing inputs', () => {
    const owned = resources();
    expect(() =>
      createProfileSession({
        localProfileId: LOCAL_ID,
        vaultId: VAULT_ID,
        rootFolderId: ROOT_ID,
        displayName: 'Profile',
        databaseKey: new Uint8Array(31),
        vaultKey: new Uint8Array(32),
        database: owned.database,
        attachments: owned.attachments,
      }),
    ).toThrow(expect.objectContaining({ code: 'OPERATION_FAILED' }));
  });
});
