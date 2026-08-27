import type {
  Attachment,
  AttachmentBlob,
  AttachmentReference,
  Note,
  VaultIdentity,
} from '@notera/domain';
import {
  asAdfDocument,
  asAttachmentByteLength,
  asAttachmentId,
  asBlobId,
  asNoteId,
  asSortOrder,
  asTimestamp,
  createAttachment,
  createAttachmentBlob,
  createCurrentNoteAttachmentReference,
  createNote,
  createUploadAttachmentReference,
} from '@notera/domain';

import type { StorageError } from '../errors';
import type {
  AttachmentListItem,
  StoredAttachmentBlob,
  StoredAttachmentContent,
} from '../types';
import {
  cleanupTempDatabases,
  databaseKey,
  tempDatabasePath,
  TEST_IDENTITY,
  TEST_ROOT_FOLDER_ID,
  TEST_VAULT_ID,
  vaultMetaDigest,
} from './helpers';

interface AttachmentApi {
  getAttachment(id: Attachment['id']): Attachment | undefined;
  getBlob(id: AttachmentBlob['id']): StoredAttachmentBlob | undefined;
  getContent(id: Attachment['id']): StoredAttachmentContent | undefined;
  findReadyBlobBySha256(value: Uint8Array): StoredAttachmentBlob | undefined;
  listForNote(
    noteId: Note['id'],
    page: { cursor?: string; limit: number },
  ): { items: readonly AttachmentListItem[]; nextCursor?: string };
  listReferencesForAttachments(
    ids: readonly Attachment['id'][],
  ): readonly AttachmentReference[];
  listUploadReferencesForNote(
    noteId: Note['id'],
  ): readonly AttachmentReference[];
  listExpiredUploadReferences(
    now: ReturnType<typeof asTimestamp>,
  ): readonly AttachmentReference[];
  listAllBlobs(): readonly AttachmentBlob[];
}

interface VaultApi {
  readonly attachments: AttachmentApi;
  transaction<T>(
    callback: (tx: {
      notes: { insert(note: Note): void };
      attachments: AttachmentApi & {
        insertBlob(value: StoredAttachmentBlob): void;
        insertAttachment(value: Attachment): void;
        addReferences(values: readonly AttachmentReference[]): void;
        removeReferences(values: readonly AttachmentReference[]): void;
        replaceNoteReferences(
          noteId: Note['id'],
          values: readonly ReturnType<
            typeof createCurrentNoteAttachmentReference
          >[],
        ): void;
        deleteUnreferencedAttachments(
          ids: readonly Attachment['id'][],
          now: ReturnType<typeof asTimestamp>,
        ): readonly AttachmentBlob['id'][];
        finalizeGc(id: AttachmentBlob['id']): void;
      };
    }) => T,
  ): T;
  close(): void;
}

function moduleApi(): {
  createVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    identity: VaultIdentity;
    profileName: string;
    vaultMetaDigest: Uint8Array;
  }): VaultApi;
} {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../database');
}

const opened: VaultApi[] = [];

function setup(): VaultApi {
  const database = moduleApi().createVaultDatabase({
    filePath: tempDatabasePath(),
    databaseKey: databaseKey(),
    identity: TEST_IDENTITY,
    profileName: 'P',
    vaultMetaDigest: vaultMetaDigest(),
  });
  opened.push(database);
  return database;
}

const digest = () => new Uint8Array(32).fill(7);

function blob(state: AttachmentBlob['localState'] = 'READY'): AttachmentBlob {
  return createAttachmentBlob({
    id: asBlobId('82000000-0000-4000-8000-000000000001'),
    vaultId: TEST_VAULT_ID,
    contentSha256: digest(),
    byteLength: asAttachmentByteLength(1),
    localState: state,
    createdAt: asTimestamp(1),
    updatedAt: asTimestamp(1),
  });
}

function storedBlob(): StoredAttachmentBlob {
  return {
    blob: blob(),
    fileKey: new Uint8Array(32).fill(8),
    manifestVersion: 1,
    manifest: new Uint8Array([1, 2]),
  };
}

function attachment(index: number): Attachment {
  return createAttachment({
    id: asAttachmentId(
      `81000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    ),
    blobId: blob().id,
    vaultId: TEST_VAULT_ID,
    fileName: 'a.txt',
    mimeType: 'text/plain',
    createdAt: asTimestamp(index),
  });
}

function note(): Note {
  return createNote({
    id: asNoteId('83000000-0000-4000-8000-000000000001'),
    vaultId: TEST_VAULT_ID,
    folderId: TEST_ROOT_FOLDER_ID,
    title: 'N',
    document: asAdfDocument({ type: 'doc', version: 1 }),
    sortOrder: asSortOrder(1),
    createdAt: asTimestamp(1),
    updatedAt: asTimestamp(1),
  });
}

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error('expected');
  } catch (error) {
    expect((error as StorageError).code).toBe(code);
  }
}

afterEach(() => {
  opened.splice(0).forEach((database) => database.close());
  cleanupTempDatabases();
});

describe('normalized attachment repository', () => {
  it('finds READY blobs only by SHA-256 and copies sensitive bytes', () => {
    const database = setup();
    const value = storedBlob();
    database.transaction((tx) => tx.attachments.insertBlob(value));

    value.fileKey.fill(0);
    value.manifest.fill(0);
    value.blob.contentSha256?.fill(0);

    const found = database.attachments.findReadyBlobBySha256(digest());
    expect(found?.fileKey).toEqual(new Uint8Array(32).fill(8));
    expect(found?.manifest).toEqual(new Uint8Array([1, 2]));
    expect(found?.blob.contentSha256).toEqual(digest());

    found?.fileKey.fill(0);
    found?.manifest.fill(0);
    found?.blob.contentSha256?.fill(0);
    expect(database.attachments.getBlob(blob().id)?.fileKey).toEqual(
      new Uint8Array(32).fill(8),
    );
    expectCode(
      () => database.attachments.findReadyBlobBySha256(new Uint8Array(31)),
      'STORAGE_OPERATION_FAILED',
    );
  });

  it('lists separate attachments that share one blob with stable pagination', () => {
    const database = setup();
    const storedNote = note();
    const first = attachment(1);
    const second = attachment(2);
    const refs = [first, second].map((value) =>
      createCurrentNoteAttachmentReference({
        vaultId: TEST_VAULT_ID,
        attachmentId: value.id,
        noteId: storedNote.id,
      }),
    );
    database.transaction((tx) => {
      tx.notes.insert(storedNote);
      tx.attachments.insertBlob(storedBlob());
      tx.attachments.insertAttachment(first);
      tx.attachments.insertAttachment(second);
      tx.attachments.addReferences(refs);
    });

    const page1 = database.attachments.listForNote(storedNote.id, { limit: 1 });
    const page2 = database.attachments.listForNote(storedNote.id, {
      limit: 1,
      cursor: page1.nextCursor,
    });

    expect(page1.items.map(({ attachment: value }) => value.id)).toEqual([
      second.id,
    ]);
    expect(page2.items.map(({ attachment: value }) => value.id)).toEqual([
      first.id,
    ]);
    expect(page1.items[0].blob.id).toBe(page2.items[0].blob.id);
    expect(
      database.attachments.listReferencesForAttachments([first.id]),
    ).toEqual([refs[0]]);
  });

  it('deletes unreferenced attachments and marks only an unused blob for GC', () => {
    const database = setup();
    const storedNote = note();
    const first = attachment(1);
    const second = attachment(2);
    const refs = [first, second].map((value) =>
      createCurrentNoteAttachmentReference({
        vaultId: TEST_VAULT_ID,
        attachmentId: value.id,
        noteId: storedNote.id,
      }),
    );
    database.transaction((tx) => {
      tx.notes.insert(storedNote);
      tx.attachments.insertBlob(storedBlob());
      tx.attachments.insertAttachment(first);
      tx.attachments.insertAttachment(second);
      tx.attachments.addReferences(refs);
    });

    const firstGc = database.transaction((tx) => {
      tx.attachments.removeReferences([refs[0]]);
      return tx.attachments.deleteUnreferencedAttachments(
        [first.id],
        asTimestamp(2),
      );
    });
    expect(firstGc).toEqual([]);
    expect(database.attachments.getAttachment(first.id)).toBeUndefined();
    expect(database.attachments.getBlob(blob().id)?.blob.localState).toBe(
      'READY',
    );

    const secondGc = database.transaction((tx) => {
      tx.attachments.removeReferences([refs[1]]);
      return tx.attachments.deleteUnreferencedAttachments(
        [second.id],
        asTimestamp(3),
      );
    });
    expect(secondGc).toEqual([blob().id]);
    expect(database.attachments.getBlob(blob().id)?.blob.localState).toBe(
      'GC_PENDING',
    );

    database.transaction((tx) => tx.attachments.finalizeGc(blob().id));
    expect(database.attachments.listAllBlobs()).toEqual([]);
  });

  it('queries expiring uploads and promotes only saved ADF media atomically', () => {
    const database = setup();
    const storedNote = note();
    const first = attachment(1);
    const second = attachment(2);
    const uploads = [first, second].map((value, index) =>
      createUploadAttachmentReference({
        vaultId: TEST_VAULT_ID,
        attachmentId: value.id,
        noteId: storedNote.id,
        expiresAt: asTimestamp(100 + index),
      }),
    );
    database.transaction((tx) => {
      tx.notes.insert(storedNote);
      tx.attachments.insertBlob(storedBlob());
      tx.attachments.insertAttachment(first);
      tx.attachments.insertAttachment(second);
      tx.attachments.addReferences(uploads);
    });

    expect(
      database.attachments.listExpiredUploadReferences(asTimestamp(100)),
    ).toEqual([uploads[0]]);
    expect(
      database.attachments.listUploadReferencesForNote(storedNote.id),
    ).toEqual(uploads);

    const saved = createCurrentNoteAttachmentReference({
      vaultId: TEST_VAULT_ID,
      attachmentId: first.id,
      noteId: storedNote.id,
    });
    database.transaction((tx) =>
      tx.attachments.replaceNoteReferences(storedNote.id, [saved]),
    );

    expect(
      database.attachments.listReferencesForAttachments([first.id]),
    ).toEqual([saved]);
    expect(
      database.attachments.listReferencesForAttachments([second.id]),
    ).toEqual([uploads[1]]);
  });
});
