/* eslint-disable no-restricted-syntax, no-await-in-loop */
import type { AttachmentStore } from '@notera/attachments';
import { wipeBytes } from '@notera/crypto';
import { createAttachmentBlob, type Timestamp } from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { collectGarbage } from './gc';
import type { AttachmentRecoveryReport } from './types';

function wipeStored(
  value: ReturnType<VaultDatabase['attachments']['getBlob']>,
): void {
  if (value === undefined) return;
  wipeBytes(value.fileKey);
  wipeBytes(value.manifest);
  value.blob.contentSha256?.fill(0);
}

export default async function recoverAttachments(input: {
  readonly database: VaultDatabase;
  readonly attachments: AttachmentStore;
  readonly now: Timestamp;
}): Promise<AttachmentRecoveryReport> {
  const known = input.database.attachments.listAllBlobs();
  const inventory = await input.attachments.reconcile(
    new Set(known.map(({ id }) => id)),
  );
  let missingCount = 0;
  input.database.transaction((transaction) => {
    inventory.missingBlobIds.forEach((blobId) => {
      const stored = transaction.attachments.getBlob(blobId);
      try {
        if (stored?.blob.localState === 'READY') {
          transaction.attachments.replaceBlob({
            ...stored,
            blob: createAttachmentBlob({
              ...stored.blob,
              localState: 'MISSING',
              updatedAt: input.now,
            }),
          });
          missingCount += 1;
        }
      } finally {
        wipeStored(stored);
      }
    });
  });

  const controller = new AbortController();
  const gc = await collectGarbage({
    database: input.database,
    attachments: input.attachments,
    signal: controller.signal,
  });
  let collectedOrphanCount = 0;
  let { retryCount } = gc;
  for (const blobId of inventory.orphanBlobIds) {
    try {
      await input.attachments.collectBlob(blobId);
      collectedOrphanCount += 1;
    } catch {
      retryCount += 1;
    }
  }
  return Object.freeze({
    missingCount,
    collectedGcCount: gc.collectedCount,
    collectedOrphanCount,
    retryCount,
    unexpectedEntryCount: inventory.unexpectedEntryCount,
  });
}
