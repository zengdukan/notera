import type {
  CurrentNoteAttachmentReference,
  Folder,
  Note,
  TrashEntry,
  VaultIdentity,
} from '@notera/domain';
import {
  asAdfDocument,
  asFolderId,
  asFolderName,
  asNoteId,
  asSortOrder,
  asTimestamp,
  asTrashEntryId,
  createNote,
  createCurrentNoteAttachmentReference,
  createRegularFolder,
  trashFolderTree,
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
  list(page: { cursor?: string; limit: number }): {
    items: readonly TrashEntry[];
  };
  listGroup(
    rootEntryId: ReturnType<typeof asTrashEntryId>,
  ): readonly TrashEntry[];
  listExpiredGroups(now: ReturnType<typeof asTimestamp>): readonly TrashEntry[];
  apply(plan: { entries: readonly TrashEntry[] }): void;
  restore(input: {
    entries: readonly TrashEntry[];
    targetFolderIds: ReadonlyMap<string, ReturnType<typeof asFolderId>>;
    mergeFolderIds?: ReadonlyMap<string, ReturnType<typeof asFolderId>>;
    now: ReturnType<typeof asTimestamp>;
  }): void;
  deletePermanent(entries: readonly TrashEntry[]): void;
}

interface VaultApi {
  readonly trash: Pick<TrashApi, 'list' | 'listGroup' | 'listExpiredGroups'>;
  readonly notes: { get(id: ReturnType<typeof asNoteId>): Note | undefined };
  transaction<Result>(
    callback: (transaction: {
      folders: {
        insert(folder: Folder): void;
        replace(folder: Folder): void;
      };
      notes: { insert(note: Note): void };
      trash: TrashApi;
      contentPlans: {
        insertNoteCopy(plan: {
          note: Note;
          noteTags: readonly never[];
          attachmentReferences: readonly CurrentNoteAttachmentReference[];
        }): void;
      };
    }) => Result,
  ): Result;
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
    id: asNoteId(
      `70000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    ),
    vaultId: TEST_VAULT_ID,
    folderId: TEST_ROOT_FOLDER_ID,
    title: `Note ${index}`,
    document: asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: `Body ${index}` }],
        },
      ],
    }),
    sortOrder: asSortOrder(index),
    createdAt: asTimestamp(index),
    updatedAt: asTimestamp(index),
  });
}

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect((error as StorageError).code).toBe(code);
  }
}

afterEach(() => {
  openDatabases.splice(0).forEach((database) => database.close());
  cleanupTempDatabases();
});

describe('trash and content plans', () => {
  it('lists only top-level entries and expands complete expired groups', () => {
    const { database } = createVault();
    const parent = createRegularFolder({
      id: asFolderId('74000000-0000-4000-8000-000000000001'),
      vaultId: TEST_VAULT_ID,
      parentId: TEST_ROOT_FOLDER_ID,
      name: asFolderName('Parent'),
      sortOrder: asSortOrder(0),
      createdAt: asTimestamp(1),
      updatedAt: asTimestamp(1),
    });
    const child = createRegularFolder({
      id: asFolderId('74000000-0000-4000-8000-000000000002'),
      vaultId: TEST_VAULT_ID,
      parentId: parent.id,
      name: asFolderName('Child'),
      sortOrder: asSortOrder(0),
      createdAt: asTimestamp(2),
      updatedAt: asTimestamp(2),
    });
    const nested = { ...note(1), folderId: child.id };
    const plan = trashFolderTree({
      sourceFolderId: parent.id,
      folders: [parent, child],
      notes: [nested],
      folderTrashEntryIds: new Map([
        [parent.id, asTrashEntryId('75000000-0000-4000-8000-000000000001')],
        [child.id, asTrashEntryId('75000000-0000-4000-8000-000000000002')],
      ]),
      noteTrashEntryIds: new Map([
        [nested.id, asTrashEntryId('75000000-0000-4000-8000-000000000003')],
      ]),
      deletedAt: asTimestamp(10),
    });
    database.transaction((transaction) => {
      transaction.folders.insert(parent);
      transaction.folders.insert(child);
      transaction.notes.insert(nested);
      transaction.trash.apply(plan);
    });

    const root = plan.entries.find(({ objectId }) => objectId === parent.id);
    const internal = plan.entries.find(({ objectId }) => objectId === child.id);
    if (root === undefined || internal === undefined)
      throw new Error('entries');
    expect(database.trash.list({ limit: 10 }).items).toEqual([root]);
    expect(database.trash.listGroup(root.id)).toHaveLength(3);
    expect(database.trash.listGroup(internal.id)).toEqual([]);
    expect(
      database.trash.listExpiredGroups(asTimestamp(root.expiresAt - 1)),
    ).toEqual([]);
    expect(database.trash.listExpiredGroups(root.expiresAt)).toHaveLength(3);
  });

  it('keeps separate delete operations independent at the same timestamp', () => {
    const { database } = createVault();
    const parent = createRegularFolder({
      id: asFolderId('74000000-0000-4000-8000-000000000011'),
      vaultId: TEST_VAULT_ID,
      parentId: TEST_ROOT_FOLDER_ID,
      name: asFolderName('Parent'),
      sortOrder: asSortOrder(0),
      createdAt: asTimestamp(1),
      updatedAt: asTimestamp(1),
    });
    const separateNote = { ...note(11), folderId: parent.id };
    const notePlan = trashNote({
      note: separateNote,
      trashEntryId: asTrashEntryId(
        '75000000-0000-4000-8000-000000000011',
      ),
      deletedAt: asTimestamp(10),
    });
    const folderPlan = trashFolderTree({
      sourceFolderId: parent.id,
      folders: [parent],
      notes: [],
      folderTrashEntryIds: new Map([
        [
          parent.id,
          asTrashEntryId('75000000-0000-4000-8000-000000000012'),
        ],
      ]),
      noteTrashEntryIds: new Map(),
      deletedAt: asTimestamp(10),
    });
    database.transaction((transaction) => {
      transaction.folders.insert(parent);
      transaction.notes.insert(separateNote);
      transaction.trash.apply(notePlan);
      transaction.trash.apply(folderPlan);
    });

    expect(database.trash.list({ limit: 10 }).items).toEqual([
      notePlan.entries[0],
      folderPlan.entries[0],
    ]);
    expect(database.trash.listGroup(notePlan.entries[0].id)).toEqual(
      notePlan.entries,
    );
    expect(database.trash.listGroup(folderPlan.entries[0].id)).toEqual(
      folderPlan.entries,
    );

    database.transaction((transaction) =>
      transaction.trash.restore({
        entries: folderPlan.entries,
        targetFolderIds: new Map([
          [folderPlan.entries[0].id, TEST_ROOT_FOLDER_ID],
        ]),
        now: asTimestamp(11),
      }),
    );
    expect(database.trash.list({ limit: 10 }).items).toEqual(notePlan.entries);
  });

  it('merges a folder group into an existing path and rebases independent entries', () => {
    const { database, filePath } = createVault();
    const original = createRegularFolder({
      id: asFolderId('74000000-0000-4000-8000-000000000021'),
      vaultId: TEST_VAULT_ID,
      parentId: TEST_ROOT_FOLDER_ID,
      name: asFolderName('top'),
      sortOrder: asSortOrder(0),
      createdAt: asTimestamp(1),
      updatedAt: asTimestamp(1),
    });
    const replacement = createRegularFolder({
      ...original,
      id: asFolderId('74000000-0000-4000-8000-000000000022'),
      createdAt: asTimestamp(11),
      updatedAt: asTimestamp(11),
    });
    const independent = { ...note(21), folderId: original.id };
    const grouped = { ...note(22), folderId: original.id };
    const independentPlan = trashNote({
      note: independent,
      trashEntryId: asTrashEntryId(
        '75000000-0000-4000-8000-000000000021',
      ),
      deletedAt: asTimestamp(5),
    });
    const folderPlan = trashFolderTree({
      sourceFolderId: original.id,
      folders: [original],
      notes: [grouped],
      folderTrashEntryIds: new Map([
        [
          original.id,
          asTrashEntryId('75000000-0000-4000-8000-000000000022'),
        ],
      ]),
      noteTrashEntryIds: new Map([
        [
          grouped.id,
          asTrashEntryId('75000000-0000-4000-8000-000000000023'),
        ],
      ]),
      deletedAt: asTimestamp(10),
    });
    const folderRoot = folderPlan.entries.find(
      (entry) => entry.objectType === 'FOLDER',
    );
    const groupedEntry = folderPlan.entries.find(
      (entry) => entry.objectType === 'NOTE',
    );
    if (folderRoot === undefined || groupedEntry === undefined) {
      throw new Error('Expected complete folder group');
    }
    database.transaction((transaction) => {
      transaction.folders.insert(original);
      transaction.notes.insert(independent);
      transaction.notes.insert(grouped);
      transaction.trash.apply(independentPlan);
      transaction.trash.apply(folderPlan);
      transaction.folders.replace(
        createRegularFolder({
          ...original,
          name: asFolderName('.notera-trash-original'),
        }),
      );
      transaction.folders.insert(replacement);
      transaction.trash.restore({
        entries: folderPlan.entries,
        targetFolderIds: new Map([
          [folderRoot.id, TEST_ROOT_FOLDER_ID],
          [groupedEntry.id, replacement.id],
        ]),
        mergeFolderIds: new Map([[folderRoot.id, replacement.id]]),
        now: asTimestamp(12),
      });
    });

    expect(database.trash.list({ limit: 10 }).items).toEqual([
      expect.objectContaining({
        id: independentPlan.entries[0].id,
        originalParentId: replacement.id,
      }),
    ]);
    expect(database.notes.get(grouped.id)).toMatchObject({
      folderId: replacement.id,
    });
    const raw = openTestConnection(filePath);
    expect(
      raw
        .prepare('SELECT folder_id FROM notes WHERE id = ?')
        .get(independent.id),
    ).toEqual({ folder_id: replacement.id });
    expect(
      raw
        .prepare('SELECT original_parent_id FROM trash_entries WHERE id = ?')
        .get(independentPlan.entries[0].id),
    ).toEqual({ original_parent_id: replacement.id });
    expect(
      raw.prepare('SELECT id FROM folders WHERE id = ?').get(original.id),
    ).toBeUndefined();
    raw.close();
  });

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
    expect(
      raw.prepare('SELECT count(*) AS count FROM notes_fts').get(),
    ).toEqual({ count: 0 });
    raw.close();

    database.transaction((transaction) =>
      transaction.trash.restore({
        entries: plan.entries,
        targetFolderIds: new Map([[plan.entries[0].id, TEST_ROOT_FOLDER_ID]]),
        now: asTimestamp(11),
      }),
    );
    expect(database.trash.list({ limit: 10 }).items).toEqual([]);
    const restored = openTestConnection(filePath);
    expect(
      restored.prepare('SELECT count(*) AS count FROM notes_fts').get(),
    ).toEqual({ count: 1 });
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
    expectCode(
      () =>
        database.transaction((transaction) =>
          transaction.trash.restore({
            entries: plan.entries,
            targetFolderIds: new Map(),
            now: plan.entries[0].expiresAt,
          }),
        ),
      'RELATION_INTEGRITY_VIOLATION',
    );
    expect(database.trash.list({ limit: 10 }).items).toEqual(plan.entries);
  });

  it('persists a Note copy plan with FTS and permanently deletes trashed Notes', () => {
    const { database, filePath } = createVault();
    const source = note(1);
    const copied = note(2);
    const attachmentId = '72000000-0000-4000-8000-000000000001';
    const blobId = '73000000-0000-4000-8000-000000000001';
    const rawBefore = openTestConnection(filePath);
    rawBefore
      .prepare(
        `INSERT INTO attachment_blobs(
         blob_id, vault_id, content_sha256, byte_length, local_state,
         file_key, manifest_version, manifest, created_at, updated_at
       ) VALUES (?, ?, ?, 1, 'READY', ?, 1, ?, 1, 1)`,
      )
      .run(
        blobId,
        TEST_VAULT_ID,
        Buffer.alloc(32, 2),
        Buffer.alloc(32, 1),
        Buffer.from('{}'),
      );
    rawBefore
      .prepare(
        `INSERT INTO attachments(
         id, blob_id, vault_id, file_name, mime_type, created_at
       ) VALUES (?, ?, ?, 'a.txt', 'text/plain', 1)`,
      )
      .run(attachmentId, blobId, TEST_VAULT_ID);
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
    expect(
      raw.prepare('SELECT count(*) AS count FROM notes_fts').get(),
    ).toEqual({ count: 1 });
    expect(
      raw.prepare('SELECT count(*) AS count FROM attachment_references').get(),
    ).toEqual({ count: 1 });
    raw.close();
  });
});
