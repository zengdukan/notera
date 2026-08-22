import type { Attachment, Note, VaultIdentity } from '@notera/domain';
import {
  asAdfDocument,
  asAttachmentByteLength,
  asAttachmentId,
  asBlobId,
  asNoteId,
  asSortOrder,
  asTimestamp,
  createAttachment,
  createCurrentNoteAttachmentReference,
  createNote,
} from '@notera/domain';
import type { StorageError } from '../errors';
import { cleanupTempDatabases, databaseKey, tempDatabasePath, TEST_IDENTITY,
  TEST_ROOT_FOLDER_ID, TEST_VAULT_ID, vaultMetaDigest } from './helpers';

interface StoredValue { attachment: Attachment; fileKey: Uint8Array; manifestVersion: number; manifest: Uint8Array }
interface VaultApi {
  readonly attachments: { get(id: ReturnType<typeof asAttachmentId>): StoredValue | undefined };
  transaction<T>(callback: (tx: { notes: { insert(note: Note): void }; attachments: {
    insert(value: StoredValue): void; replace(value: StoredValue): void;
    addReference(value: ReturnType<typeof createCurrentNoteAttachmentReference>): void;
    removeReference(value: ReturnType<typeof createCurrentNoteAttachmentReference>): void;
    markGcPending(value: Attachment): void;
  } }) => T): T;
  close(): void;
}
function moduleApi(): { createVaultDatabase(options: { filePath: string; databaseKey: Uint8Array;
  identity: VaultIdentity; profileName: string; vaultMetaDigest: Uint8Array }): VaultApi } {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../database');
}
const opened: VaultApi[] = [];
function setup(): VaultApi {
  const db = moduleApi().createVaultDatabase({ filePath: tempDatabasePath(), databaseKey: databaseKey(),
    identity: TEST_IDENTITY, profileName: 'P', vaultMetaDigest: vaultMetaDigest() });
  opened.push(db); return db;
}
function attachment(state: Attachment['localState'] = 'READY'): Attachment {
  return createAttachment({ id: asAttachmentId('81000000-0000-4000-8000-000000000001'),
    blobId: asBlobId('82000000-0000-4000-8000-000000000001'), vaultId: TEST_VAULT_ID,
    fileName: 'a.txt', mimeType: 'text/plain', byteLength: asAttachmentByteLength(1),
    localState: state, createdAt: asTimestamp(1), updatedAt: asTimestamp(1) });
}
function note(): Note { return createNote({ id: asNoteId('83000000-0000-4000-8000-000000000001'),
  vaultId: TEST_VAULT_ID, folderId: TEST_ROOT_FOLDER_ID, title: 'N',
  document: asAdfDocument({ type: 'doc', version: 1 }), sortOrder: asSortOrder(1),
  createdAt: asTimestamp(1), updatedAt: asTimestamp(1) }); }
function expectCode(fn: () => unknown, code: string): void { try { fn(); throw new Error('expected'); }
  catch (error) { expect((error as StorageError).code).toBe(code); } }
afterEach(() => { opened.splice(0).forEach((db) => db.close()); cleanupTempDatabases(); });

describe('attachment metadata repository', () => {
  it('copies keys and manifests on every write and read and enforces bounds', () => {
    const db = setup(); const key = new Uint8Array(32).fill(7); const manifest = new Uint8Array([1, 2]);
    db.transaction((tx) => tx.attachments.insert({ attachment: attachment(), fileKey: key,
      manifestVersion: 1, manifest }));
    key.fill(0); manifest.fill(0);
    const first = db.attachments.get(attachment().id) as StoredValue;
    expect(first.fileKey).toEqual(new Uint8Array(32).fill(7)); expect(first.manifest).toEqual(new Uint8Array([1, 2]));
    first.fileKey.fill(0); first.manifest.fill(0);
    expect(db.attachments.get(attachment().id)?.manifest).toEqual(new Uint8Array([1, 2]));
    [new Uint8Array(31), new Uint8Array(33)].forEach((fileKey) => expectCode(() =>
      db.transaction((tx) => tx.attachments.replace({ attachment: attachment(), fileKey,
        manifestVersion: 1, manifest: new Uint8Array() })), 'STORAGE_OPERATION_FAILED'));
    expectCode(() => db.transaction((tx) => tx.attachments.replace({ attachment: attachment(),
      fileKey: new Uint8Array(32), manifestVersion: 0, manifest: new Uint8Array() })),
    'STORAGE_OPERATION_FAILED');
    expectCode(() => db.transaction((tx) => tx.attachments.replace({ attachment: attachment(),
      fileKey: new Uint8Array(32), manifestVersion: 1, manifest: new Uint8Array(1024 * 1024 + 1) })),
    'STORAGE_OPERATION_FAILED');
  });

  it('keeps references idempotent and permits GC_PENDING only after the last removal', () => {
    const db = setup(); const storedNote = note(); const storedAttachment = attachment();
    const reference = createCurrentNoteAttachmentReference({ vaultId: TEST_VAULT_ID,
      attachmentId: storedAttachment.id, noteId: storedNote.id });
    db.transaction((tx) => { tx.notes.insert(storedNote); tx.attachments.insert({ attachment: storedAttachment,
      fileKey: new Uint8Array(32), manifestVersion: 1, manifest: new Uint8Array() });
      tx.attachments.addReference(reference); tx.attachments.addReference(reference); });
    expectCode(() => db.transaction((tx) => tx.attachments.markGcPending(
      createAttachment({ ...storedAttachment, localState: 'GC_PENDING', updatedAt: asTimestamp(2) }))),
    'RELATION_INTEGRITY_VIOLATION');
    db.transaction((tx) => { tx.attachments.removeReference(reference); tx.attachments.removeReference(reference);
      tx.attachments.markGcPending(createAttachment({ ...storedAttachment, localState: 'GC_PENDING',
        updatedAt: asTimestamp(2) })); });
    expect(db.attachments.get(storedAttachment.id)?.attachment.localState).toBe('GC_PENDING');
  });
});
