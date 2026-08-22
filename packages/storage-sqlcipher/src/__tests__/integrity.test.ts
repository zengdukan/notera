import type {
  Attachment,
  AttachmentBlob,
  AttachmentReference,
  Favorite,
  Folder,
  Note,
  NoteTag,
  NoteVersion,
  Tag,
  VaultIdentity,
} from '@notera/domain';
import {
  asAdfDocument,
  asAttachmentByteLength,
  asAttachmentId,
  asBlobId,
  asFolderId,
  asFolderName,
  asNoteId,
  asNoteVersionId,
  asSortOrder,
  asTagId,
  asTagName,
  asTimestamp,
  createAttachment,
  createAttachmentBlob,
  createCurrentNoteAttachmentReference,
  createFavorite,
  createNote,
  createNoteTag,
  createRegularFolder,
  createTag,
  createUserVersion,
} from '@notera/domain';

import type { StorageError } from '../errors';
import type { SqlcipherConnection } from '../connection';
import {
  cleanupTempDatabases,
  databaseKey,
  openTestConnection,
  OTHER_VAULT_ID,
  tempDatabasePath,
  TEST_IDENTITY,
  TEST_ROOT_FOLDER_ID,
  TEST_VAULT_ID,
  vaultMetaDigest,
} from './helpers';

interface StoredAttachmentBlob {
  readonly blob: AttachmentBlob;
  readonly fileKey: Uint8Array;
  readonly manifestVersion: number;
  readonly manifest: Uint8Array;
}

interface StoredAttachment {
  readonly attachment: Attachment;
  readonly storedBlob: StoredAttachmentBlob;
}

interface IntegrityIssue {
  readonly code: string;
  readonly table: string;
  readonly entityId?: string;
}

interface IntegrityReport {
  readonly ok: boolean;
  readonly issues: readonly IntegrityIssue[];
}

interface VaultDatabaseApi {
  transaction<Result>(
    callback: (transaction: {
      readonly folders: { insert(folder: Folder): void };
      readonly notes: { insert(note: Note): void };
      readonly tags: {
        insert(tag: Tag): void;
        addToNote(value: NoteTag): void;
      };
      readonly favorites: { insert(value: Favorite): void };
      readonly history: { insert(value: NoteVersion): void };
      readonly attachments: {
        insertBlob(value: StoredAttachmentBlob): void;
        insertAttachment(value: Attachment): void;
        addReferences(value: readonly AttachmentReference[]): void;
      };
    }) => Result,
  ): Result;
  checkIntegrity(): IntegrityReport;
  close(): void;
}

interface DatabaseModule {
  createVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    identity: VaultIdentity;
    profileName: string;
    vaultMetaDigest: Uint8Array;
  }): VaultDatabaseApi;
}

function databaseModule(): DatabaseModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../database') as DatabaseModule;
}

const openDatabases: VaultDatabaseApi[] = [];

function createVault(): { database: VaultDatabaseApi; filePath: string } {
  const filePath = tempDatabasePath();
  const database = databaseModule().createVaultDatabase({
    filePath,
    databaseKey: databaseKey(),
    identity: TEST_IDENTITY,
    profileName: 'Integrity profile',
    vaultMetaDigest: vaultMetaDigest(),
  });
  openDatabases.push(database);
  return { database, filePath };
}

function regularFolder(index: number, parentId = TEST_ROOT_FOLDER_ID): Folder {
  return createRegularFolder({
    id: asFolderId(
      `21000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    ),
    vaultId: TEST_VAULT_ID,
    parentId,
    name: asFolderName(`Folder ${index}`),
    sortOrder: asSortOrder(index),
    createdAt: asTimestamp(index),
    updatedAt: asTimestamp(index),
  });
}

function storedNote(index = 1): Note {
  return createNote({
    id: asNoteId(
      `31000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    ),
    vaultId: TEST_VAULT_ID,
    folderId: TEST_ROOT_FOLDER_ID,
    title: `Private title ${index}`,
    document: asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: `Secret body ${index}` }],
        },
      ],
    }),
    sortOrder: asSortOrder(index),
    createdAt: asTimestamp(index),
    updatedAt: asTimestamp(index),
  });
}

function storedTag(): Tag {
  return createTag({
    id: asTagId('41000000-0000-4000-8000-000000000001'),
    vaultId: TEST_VAULT_ID,
    name: asTagName('Private tag'),
    createdAt: asTimestamp(1),
    updatedAt: asTimestamp(1),
  });
}

function storedAttachment(): StoredAttachment {
  return {
    attachment: createAttachment({
      id: asAttachmentId('81000000-0000-4000-8000-000000000001'),
      blobId: asBlobId('82000000-0000-4000-8000-000000000001'),
      vaultId: TEST_VAULT_ID,
      fileName: 'private-name.txt',
      mimeType: 'text/plain',
      createdAt: asTimestamp(1),
    }),
    storedBlob: {
      blob: createAttachmentBlob({
        id: asBlobId('82000000-0000-4000-8000-000000000001'),
        vaultId: TEST_VAULT_ID,
        contentSha256: new Uint8Array(32).fill(6),
        byteLength: asAttachmentByteLength(5),
        localState: 'READY',
        createdAt: asTimestamp(1),
        updatedAt: asTimestamp(1),
      }),
      fileKey: new Uint8Array(32).fill(7),
      manifestVersion: 1,
      manifest: new Uint8Array([1, 2, 3]),
    },
  };
}

function databaseSnapshot(connection: SqlcipherConnection): string {
  const tables = [
    'schema_metadata',
    'vault_metadata',
    'search_metadata',
    'folders',
    'notes',
    'note_versions',
    'tags',
    'note_tags',
    'favorites',
    'trash_entries',
    'attachment_blobs',
    'attachments',
    'attachment_references',
    'notes_fts',
  ];
  return JSON.stringify(
    tables.map((name) => ({
      name,
      rows: connection.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    })),
    (_key, value) =>
      typeof value === 'bigint'
        ? value.toString()
        : value instanceof Uint8Array
          ? Buffer.from(value).toString('hex')
          : value,
  );
}

function expectStorageCode(operation: () => unknown, code: string): void {
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

describe('vault integrity scan', () => {
  it('accepts a healthy vault containing every persisted entity and never mutates it', () => {
    const { database, filePath } = createVault();
    const folder = regularFolder(1);
    const note = storedNote();
    const tag = storedTag();
    const noteTag = createNoteTag({
      vaultId: TEST_VAULT_ID,
      noteId: note.id,
      tagId: tag.id,
    });
    const favorite = createFavorite({
      vaultId: TEST_VAULT_ID,
      noteId: note.id,
      sortOrder: asSortOrder(1),
      createdAt: asTimestamp(2),
    });
    const version = createUserVersion(
      note,
      asNoteVersionId('51000000-0000-4000-8000-000000000001'),
      asTimestamp(2),
    );
    const attachment = storedAttachment();
    const reference = createCurrentNoteAttachmentReference({
      vaultId: TEST_VAULT_ID,
      attachmentId: attachment.attachment.id,
      noteId: note.id,
    });
    database.transaction((transaction) => {
      transaction.folders.insert(folder);
      transaction.notes.insert(note);
      transaction.tags.insert(tag);
      transaction.tags.addToNote(noteTag);
      transaction.favorites.insert(favorite);
      transaction.history.insert(version);
      transaction.attachments.insertBlob(attachment.storedBlob);
      transaction.attachments.insertAttachment(attachment.attachment);
      transaction.attachments.addReferences([reference]);
    });

    let raw = openTestConnection(filePath);
    const before = databaseSnapshot(raw);
    raw.close();
    expect(database.checkIntegrity()).toEqual({ ok: true, issues: [] });
    raw = openTestConnection(filePath);
    expect(databaseSnapshot(raw)).toBe(before);
    raw.close();

    database.close();
    expectStorageCode(() => database.checkIntegrity(), 'DATABASE_CLOSED');
  });

  it('reports missing parents, cycles, cross-vault rows, and relation orphans stably', () => {
    const { database, filePath } = createVault();
    const first = regularFolder(1);
    const second = regularFolder(2, first.id);
    const missingParent = regularFolder(3);
    database.transaction((transaction) => {
      transaction.folders.insert(first);
      transaction.folders.insert(second);
      transaction.folders.insert(missingParent);
    });

    const missingId = '99000000-0000-4000-8000-000000000001';
    const raw = openTestConnection(filePath);
    raw.pragma('ignore_check_constraints = ON');
    raw
      .prepare('UPDATE folders SET parent_id = ? WHERE id = ?')
      .run(second.id, first.id);
    raw
      .prepare('UPDATE folders SET parent_id = ? WHERE id = ?')
      .run(missingId, missingParent.id);
    raw
      .prepare(
        `INSERT INTO tags(id, vault_id, name, created_at, updated_at)
         VALUES (?, ?, 'Cross vault', 1, 1)`,
      )
      .run('42000000-0000-4000-8000-000000000001', OTHER_VAULT_ID);
    raw
      .prepare(
        'INSERT INTO note_tags(vault_id, note_id, tag_id) VALUES (?, ?, ?)',
      )
      .run(
        TEST_VAULT_ID,
        '32000000-0000-4000-8000-000000000001',
        '42000000-0000-4000-8000-000000000002',
      );
    raw
      .prepare(
        `INSERT INTO favorites(vault_id, note_id, sort_order, created_at)
         VALUES (?, ?, 1, 1)`,
      )
      .run(TEST_VAULT_ID, '32000000-0000-4000-8000-000000000002');
    raw
      .prepare(
        `INSERT INTO attachment_references(
           vault_id, attachment_id, source_type, note_id
         ) VALUES (?, ?, 'NOTE', ?)`,
      )
      .run(
        TEST_VAULT_ID,
        '81000000-0000-4000-8000-000000000099',
        '32000000-0000-4000-8000-000000000003',
      );
    raw.close();

    const report = database.checkIntegrity();
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      [...report.issues].sort((left, right) =>
        `${left.code}:${left.table}:${left.entityId ?? ''}`.localeCompare(
          `${right.code}:${right.table}:${right.entityId ?? ''}`,
        ),
      ),
    );
    expect(report.issues).toEqual(database.checkIntegrity().issues);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        {
          code: 'FOLDER_PARENT_MISSING',
          table: 'folders',
          entityId: missingParent.id,
        },
        { code: 'FOLDER_CYCLE', table: 'folders', entityId: first.id },
        { code: 'FOLDER_CYCLE', table: 'folders', entityId: second.id },
        {
          code: 'VAULT_MISMATCH',
          table: 'tags',
          entityId: '42000000-0000-4000-8000-000000000001',
        },
        {
          code: 'RELATION_ORPHANED',
          table: 'note_tags',
          entityId: '32000000-0000-4000-8000-000000000001',
        },
        {
          code: 'RELATION_ORPHANED',
          table: 'favorites',
          entityId: '32000000-0000-4000-8000-000000000002',
        },
        {
          code: 'RELATION_ORPHANED',
          table: 'attachment_references',
          entityId: '81000000-0000-4000-8000-000000000099',
        },
      ]),
    );
    expect(JSON.stringify(report)).not.toMatch(
      /Private title|Secret body|Private tag|private-name|SELECT|vault\.db/i,
    );
  });

  it('classifies malformed entities, history, attachments, and search drift', () => {
    const { database, filePath } = createVault();
    const note = storedNote();
    const version = createUserVersion(
      note,
      asNoteVersionId('51000000-0000-4000-8000-000000000001'),
      asTimestamp(2),
    );
    const attachment = storedAttachment();
    database.transaction((transaction) => {
      transaction.notes.insert(note);
      transaction.history.insert(version);
      transaction.attachments.insertBlob(attachment.storedBlob);
      transaction.attachments.insertAttachment(attachment.attachment);
    });

    const raw = openTestConnection(filePath);
    raw.pragma('ignore_check_constraints = ON');
    raw.prepare('UPDATE notes SET adf_json = ? WHERE id = ?').run('{', note.id);
    raw
      .prepare(
        'UPDATE note_versions SET adf_sha256 = zeroblob(32) WHERE id = ?',
      )
      .run(version.id);
    raw
      .prepare(
        'UPDATE attachment_blobs SET file_key = zeroblob(31) WHERE blob_id = ?',
      )
      .run(attachment.storedBlob.blob.id);
    raw.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(note.id);
    raw.close();

    const report = database.checkIntegrity();
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        { code: 'ADF_INVALID', table: 'notes', entityId: note.id },
        {
          code: 'HISTORY_HASH_MISMATCH',
          table: 'note_versions',
          entityId: version.id,
        },
        {
          code: 'ATTACHMENT_METADATA_INVALID',
          table: 'attachment_blobs',
          entityId: attachment.storedBlob.blob.id,
        },
        { code: 'SEARCH_INDEX_INVALID', table: 'notes_fts' },
      ]),
    );
    expect(JSON.stringify(report)).not.toContain(note.title);
    expect(JSON.stringify(report)).not.toContain('Secret body');
    expect(JSON.stringify(report)).not.toContain(
      attachment.attachment.fileName,
    );
  });
});
