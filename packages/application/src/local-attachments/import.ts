import { randomUUID } from 'node:crypto';

import { wipeBytes } from '@notera/crypto';
import {
  asAttachmentByteLength,
  asAttachmentId,
  createAttachment,
  createAttachmentBlob,
  createCurrentNoteAttachmentReference,
  type Attachment,
  type Timestamp,
  type VaultId,
} from '@notera/domain';
import { StorageError, type VaultDatabase } from '@notera/storage-sqlcipher';
import type { AttachmentStore, ImportedBlob } from '@notera/attachments';

import type { SessionResources } from '../session';
import attachmentSummary from './mapping';
import { mapImportError } from './errors';
import type { ImportAttachmentInput } from './types';
import {
  combineSignals,
  requireActiveNote,
  validateImportInput,
} from './validation';

function commitImport(
  database: VaultDatabase,
  vaultId: VaultId,
  imported: ImportedBlob,
  input: ReturnType<typeof validateImportInput>,
  attachmentId: ReturnType<typeof asAttachmentId>,
  now: Timestamp,
): {
  readonly attachment: Attachment;
  readonly blob: ReturnType<typeof createAttachmentBlob>;
  readonly reused: boolean;
} {
  return database.transaction((transaction) => {
    const existing = transaction.attachments.findReadyBlobBySha256(
      imported.contentSha256,
    );
    const blobId = existing?.blob.id ?? imported.blobId;
    const attachment = createAttachment({
      id: attachmentId,
      blobId,
      vaultId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      createdAt: now,
    });
    const blob =
      existing?.blob ??
      createAttachmentBlob({
        id: imported.blobId,
        vaultId,
        contentSha256: imported.contentSha256,
        byteLength: asAttachmentByteLength(imported.plaintextLength),
        localState: 'READY',
        createdAt: now,
        updatedAt: now,
      });
    if (existing === undefined) {
      transaction.attachments.insertBlob({
        blob,
        fileKey: imported.fileKey,
        manifestVersion: imported.manifestVersion,
        manifest: imported.manifest,
      });
    } else {
      wipeBytes(existing.fileKey);
      wipeBytes(existing.manifest);
      existing.blob.contentSha256?.fill(0);
    }
    transaction.attachments.insertAttachment(attachment);
    transaction.attachments.addReferences([
      createCurrentNoteAttachmentReference({
        vaultId,
        attachmentId,
        noteId: input.noteId,
      }),
    ]);
    return Object.freeze({
      attachment,
      blob,
      reused: existing !== undefined,
    });
  });
}

async function compensate(
  store: AttachmentStore,
  imported?: ImportedBlob,
): Promise<void> {
  if (imported === undefined) return;
  await store.collectBlob(imported.blobId).catch(() => undefined);
}

export default async function importAttachment(
  resources: SessionResources,
  vaultId: VaultId,
  value: ImportAttachmentInput,
  now: Timestamp,
  randomId: () => string = randomUUID,
) {
  const input = validateImportInput(value);
  requireActiveNote(resources.database, input.noteId);
  const attachmentId = asAttachmentId(randomId());
  const combined = combineSignals([resources.signal, input.signal]);
  let imported: ImportedBlob | undefined;
  let databasePhase = false;
  let transactionCommitted = false;
  try {
    imported = await resources.attachments.importBlob({
      vaultId,
      source: input.source,
      signal: combined.signal,
    });
    databasePhase = true;
    let committed;
    try {
      committed = commitImport(
        resources.database,
        vaultId,
        imported,
        input,
        attachmentId,
        now,
      );
    } catch (error) {
      if (error instanceof StorageError) {
        const winner = resources.database.attachments.findReadyBlobBySha256(
          imported.contentSha256,
        );
        if (winner !== undefined) {
          wipeBytes(winner.fileKey);
          wipeBytes(winner.manifest);
          winner.blob.contentSha256?.fill(0);
          committed = commitImport(
            resources.database,
            vaultId,
            imported,
            input,
            attachmentId,
            now,
          );
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
    transactionCommitted = true;
    if (committed.reused) await compensate(resources.attachments, imported);
    return attachmentSummary(committed.attachment, committed.blob);
  } catch (error) {
    if (!transactionCommitted) {
      await compensate(resources.attachments, imported);
    }
    throw mapImportError(
      error,
      databasePhase ? 'DATABASE' : 'IMPORT',
      resources.signal,
      input.signal,
    );
  } finally {
    combined.cleanup();
    if (imported !== undefined) {
      wipeBytes(imported.fileKey);
      wipeBytes(imported.manifest);
      wipeBytes(imported.contentSha256);
    }
  }
}
