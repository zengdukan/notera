import type {
  CurrentNoteAttachmentReference,
  Note,
  TrashEntry,
  VaultIdentity,
} from '@notera/domain';
import {
  asAdfDocument,
  asNoteId,
  asSortOrder,
  asTimestamp,
  asTrashEntryId,
  createNote,
  createCurrentNoteAttachmentReference,
  trashNote,
} from '@notera/domain';

import type { StorageError } from '../errors';
import {
  cleanupTempDatabases,
  databaseKey,
  openTestConnection,
  tempDatabasePath,
  TEST_IDENTITY,
  TEST_ROOT_FOLDER_ID,
  TEST_VAULT_ID,
  vaultMetaDigest,
} from './helpers';

interface TrashApi {
  list(page: { cursor?: string; limit: number }): { items: readonly TrashEntry[] };
  apply(plan: { entries: readonly TrashEntry[] }): void;
  restore(input: {
    entries: readonly TrashEntry[];
    targetFolderIds: ReadonlyMap<string, typeof TEST_ROOT_FOLDER_ID>;
    now: ReturnType<typeof asTimestamp>;
  }): void;
  deletePermanent(entries: readonly TrashEntry[]): void;
}

interface VaultApi {
  readonly trash: Pick<TrashApi, 'list'>;
  readonly notes: { get(id: ReturnType<typeof asNoteId>): Note | undefined };
  transaction<Result>(callback: (transaction: {
    notes: { insert(note: Note): void };
    trash: TrashApi;
    contentPlans: {
      insertNoteCopy(plan: {
        note: Note;
        noteTags: readonly never[];
        attachmentReferences: readonly CurrentNoteAttachmentReference[];
      }): void;
    };
  }) => Result): Result;
  close(): void;
}

interface DatabaseModule {
  createVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    identity: VaultIdentity;
    profileName: string;
    vaultMetaDigest: Uint8Array;
  }): VaultApi;
}

function databaseModule(): DatabaseModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../database') as DatabaseModule;
}

const openDatabases: VaultApi[] = [];
function createVault(): { database: VaultApi; filePath: string } {
  const filePath = tempDatabasePath();
  const database = databaseModule().createVaultDatabase({
    filePath,
    databaseKey: databaseKey(),
    identity: TEST_IDENTITY,
    profileName: 'Profile',
    vaultMetaDigest: vaultMetaDigest(),
  });
  openDatabases.push(database);
  return { database, filePath };
}

function note(index: number): Note {
  return createNote({
    id: asNoteId(`70000000-0000-4000-8000-${index.toString().padStart(12, '0')}`),
    vaultId: TEST_VAULT_ID,
    folderId: TEST_ROOT_FOLDER_ID,
    title: `Note ${index}`,
    document: asAdfDocument({ type: 'doc', version: 1, content: [
      { type: 'paragraph', content: [{ type: 'text', text: `Body ${index}` }] },
    ] }),
    sortOrder: asSortOrder(index),
    createdAt: asTimestamp(index),
    updatedAt: asTimestamp(index),
  });
}

function expectCode(operation: () => unknown, code: string): void {
  try { operation(); throw new Error(`Expected ${code}`); } catch (error) {
    expect((error as StorageError).code).toBe(code);
  }
}

afterEach(() => {
  openDatabases.splice(0).forEach((database) => database.close());
  cleanupTempDatabases();
});

describe('trash and content plans', () => {
  it('trashes and restores a Note with its FTS row atomically', () => {
    const { database, filePath } = createVault();
    const stored = note(1);
    const plan = trashNote({
      note: stored,
      trashEntryId: asTrashEntryId('71000000-0000-4000-8000-000000000001'),
      deletedAt: asTimestamp(10),
    });
    database.transaction((transaction) => {
      transaction.notes.insert(stored);
      transaction.trash.apply(plan);
    });
    expect(database.trash.list({ limit: 10 }).items).toEqual(plan.entries);
    const raw = openTestConnection(filePath);
    expect(raw.prepare('SELECT count(*) AS count FROM notes_fts').get()).toEqual({ count: 0 });
    raw.close();

    database.transaction((transaction) => transaction.trash.restore({
      entries: plan.entries,
      targetFolderIds: new Map([[plan.entries[0].id, TEST_ROOT_FOLDER_ID]]),
      now: asTimestamp(11),
    }));
    expect(database.trash.list({ limit: 10 }).items).toEqual([]);
    const restored = openTestConnection(filePath);
    expect(restored.prepare('SELECT count(*) AS count FROM notes_fts').get()).toEqual({ count: 1 });
    restored.close();
  });

  it('rejects expired or incomplete restores without partial changes', () => {
    const { database } = createVault();
    const stored = note(1);
    const plan = trashNote({
      note: stored,
      trashEntryId: asTrashEntryId('71000000-0000-4000-8000-000000000001'),
      deletedAt: asTimestamp(10),
    });
    database.transaction((transaction) => {
      transaction.notes.insert(stored);
      transaction.trash.apply(plan);
    });
    expectCode(() => database.transaction((transaction) => transaction.trash.restore({
      entries: plan.entries,
      targetFolderIds: new Map(),
      now: plan.entries[0].expiresAt,
    })), 'RELATION_INTEGRITY_VIOLATION');
    expect(database.trash.list({ limit: 10 }).items).toEqual(plan.entries);
  });

  it('persists a Note copy plan with FTS and permanently deletes trashed Notes', () => {
    const { database, filePath } = createVault();
    const source = note(1);
    const copied = note(2);
    const attachmentId = '72000000-0000-4000-8000-000000000001';
    const rawBefore = openTestConnection(filePath);
    rawBefore.prepare(
      `INSERT INTO attachments(
         id, blob_id, vault_id, file_name, mime_type, byte_length,
         local_state, file_key, manifest_version, manifest, created_at, updated_at
       ) VALUES (?, ?, ?, 'a.txt', 'text/plain', 1, 'READY', ?, 1, ?, 1, 1)`,
    ).run(
      attachmentId,
      '73000000-0000-4000-8000-000000000001',
      TEST_VAULT_ID,
      Buffer.alloc(32, 1),
      Buffer.from('{}'),
    );
    rawBefore.close();
    const copiedReference = createCurrentNoteAttachmentReference({
      vaultId: TEST_VAULT_ID,
      attachmentId: attachmentId as never,
      noteId: copied.id,
    });
    database.transaction((transaction) => {
      transaction.notes.insert(source);
      transaction.contentPlans.insertNoteCopy({
        note: copied,
        noteTags: [],
        attachmentReferences: [copiedReference],
      });
    });
    expect(database.notes.get(copied.id)).toEqual(copied);

    const trashPlan = trashNote({
      note: source,
      trashEntryId: asTrashEntryId('71000000-0000-4000-8000-000000000002'),
      deletedAt: asTimestamp(10),
    });
    database.transaction((transaction) => {
      transaction.trash.apply(trashPlan);
      transaction.trash.deletePermanent(trashPlan.entries);
    });
    expect(database.notes.get(source.id)).toBeUndefined();
    const raw = openTestConnection(filePath);
    expect(raw.prepare('SELECT count(*) AS count FROM notes_fts').get()).toEqual({ count: 1 });
    expect(raw.prepare('SELECT count(*) AS count FROM attachment_references').get())
      .toEqual({ count: 1 });
    raw.close();
  });
});
