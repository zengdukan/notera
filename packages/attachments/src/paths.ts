import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { asBlobId, type BlobId } from '@notera/domain';
import { AttachmentStorageError, mapAttachmentError } from './errors';

const STAGING_TOKEN = /^[0-9a-f]{32}$/;

export interface AttachmentPaths {
  readonly profileRoot: string;
  readonly blobsRoot: string;
  readonly stagingRoot: string;
  blobDirectory(blobId: BlobId | string): string;
  blobFile(blobId: BlobId | string): string;
  stagingFile(blobId: BlobId | string, token: string): string;
}

function validBlobId(value: BlobId | string): BlobId {
  try {
    return asBlobId(value);
  } catch {
    throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
  }
}

async function ensurePlainDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new AttachmentStorageError('ATTACHMENT_IO_FAILED');
  }
}

export async function createAttachmentPaths(
  profileRoot: string,
): Promise<AttachmentPaths> {
  if (typeof profileRoot !== 'string' || profileRoot.trim().length === 0) {
    throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
  }
  try {
    await mkdir(profileRoot, { recursive: true });
    const canonicalRoot = await realpath(profileRoot);
    const blobsRoot = join(canonicalRoot, 'blobs');
    const stagingRoot = join(canonicalRoot, 'staging');
    await ensurePlainDirectory(blobsRoot);
    await ensurePlainDirectory(stagingRoot);
    const blobDirectory = (value: BlobId | string): string => {
      const blobId = validBlobId(value);
      const compact = blobId.replace(/-/g, '');
      return join(blobsRoot, compact.slice(0, 2));
    };
    return Object.freeze({
      profileRoot: canonicalRoot,
      blobsRoot,
      stagingRoot,
      blobDirectory,
      blobFile(value: BlobId | string): string {
        const blobId = validBlobId(value);
        return join(blobDirectory(blobId), `${blobId}.blob`);
      },
      stagingFile(value: BlobId | string, token: string): string {
        const blobId = validBlobId(value);
        if (typeof token !== 'string' || !STAGING_TOKEN.test(token)) {
          throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
        }
        return join(stagingRoot, `${blobId}.${token}.part`);
      },
    });
  } catch (error) {
    throw mapAttachmentError(error);
  }
}
