import { wipeBytes } from '@notera/crypto';
import type { BlobId } from '@notera/domain';

import type { SessionResources } from '../session';
import type { AttachmentGcReport } from './types';

function wipeStored(
  value: ReturnType<SessionResources['database']['attachments']['getBlob']>,
): void {
  if (value === undefined) return;
  wipeBytes(value.fileKey);
  wipeBytes(value.manifest);
  value.blob.contentSha256?.fill(0);
}

export async function collectBlobIds(
  resources: SessionResources,
  values: readonly BlobId[],
): Promise<AttachmentGcReport> {
  const blobIds = [...new Set(values)].sort();
  let collectedCount = 0;
  let retryCount = 0;
  for (const blobId of blobIds) {
    let stored;
    try {
      stored = resources.database.attachments.getBlob(blobId);
      if (stored === undefined || stored.blob.localState !== 'GC_PENDING') {
        retryCount += 1;
        continue;
      }
      await resources.attachments.collectBlob(blobId);
      resources.database.transaction((transaction) =>
        transaction.attachments.finalizeGc(blobId),
      );
      collectedCount += 1;
    } catch {
      retryCount += 1;
    } finally {
      wipeStored(stored);
    }
  }
  return Object.freeze({
    scannedCount: blobIds.length,
    collectedCount,
    retryCount,
  });
}

export function collectGarbage(
  resources: SessionResources,
): Promise<AttachmentGcReport> {
  return collectBlobIds(
    resources,
    resources.database.attachments.listGcPendingBlobs().map(({ id }) => id),
  );
}
