import type {
  Attachment,
  AttachmentBlob,
  AttachmentLocalState,
} from '@notera/domain';

import { ApplicationError } from '../errors';
import type { AttachmentAvailability, AttachmentSummary } from './types';

const PREVIEWABLE_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

function availability(state: AttachmentLocalState): AttachmentAvailability {
  if (state === 'READY') return 'AVAILABLE';
  if (state === 'MISSING' || state === 'CORRUPT') return state;
  throw new ApplicationError('DB_CORRUPT');
}

export function attachmentSummary(
  attachment: Attachment,
  blob: AttachmentBlob,
): AttachmentSummary {
  if (attachment.blobId !== blob.id || attachment.vaultId !== blob.vaultId) {
    throw new ApplicationError('DB_CORRUPT');
  }
  return Object.freeze({
    id: attachment.id,
    fileName: attachment.fileName,
    mime: attachment.mimeType,
    byteLength: blob.byteLength,
    localState: availability(blob.localState),
    previewable: PREVIEWABLE_MIME_TYPES.has(
      attachment.mimeType.toLocaleLowerCase('en-US'),
    ),
    createdAt: attachment.createdAt,
  });
}
