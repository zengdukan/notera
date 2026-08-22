import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { asBlobId, type BlobId } from '@notera/domain';
import { AttachmentStorageError, mapAttachmentError } from './errors';
import type { StartupRecoveryReport } from './types';

const STAGING_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9a-f]{32}\.part$/;
const BLOB_PREFIX = /^[0-9a-f]{2}$/;
const BLOB_FILE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.blob$/;

function nativeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const { code } = error as Record<string, unknown>;
  return typeof code === 'string' ? code : undefined;
}

export async function recoverStaging(
  stagingRoot: string,
): Promise<StartupRecoveryReport> {
  try {
    const entries = await readdir(stagingRoot, { withFileTypes: true });
    let removedStagingFileCount = 0;
    let unexpectedEntryCount = 0;
    for (const entry of entries) {
      if (entry.isFile() && STAGING_FILE.test(entry.name)) {
        try {
          await unlink(join(stagingRoot, entry.name));
          removedStagingFileCount += 1;
        } catch (error) {
          if (nativeCode(error) !== 'ENOENT') throw error;
        }
      } else {
        unexpectedEntryCount += 1;
      }
    }
    return Object.freeze({
      removedStagingFileCount,
      unexpectedEntryCount,
    });
  } catch (error) {
    if (error instanceof AttachmentStorageError) throw error;
    throw mapAttachmentError(error);
  }
}

export interface BlobInventory {
  readonly blobIds: ReadonlySet<BlobId>;
  readonly unexpectedEntryCount: number;
}

export async function inventoryFinalBlobs(
  blobsRoot: string,
): Promise<BlobInventory> {
  try {
    const blobIds = new Set<BlobId>();
    let unexpectedEntryCount = 0;
    const prefixes = await readdir(blobsRoot, { withFileTypes: true });
    for (const prefix of prefixes) {
      if (
        !BLOB_PREFIX.test(prefix.name) ||
        !prefix.isDirectory() ||
        prefix.isSymbolicLink()
      ) {
        unexpectedEntryCount += 1;
        continue;
      }
      const entries = await readdir(join(blobsRoot, prefix.name), {
        withFileTypes: true,
      });
      for (const entry of entries) {
        const match = BLOB_FILE.exec(entry.name);
        if (!match || !entry.isFile() || entry.isSymbolicLink()) {
          unexpectedEntryCount += 1;
          continue;
        }
        const compact = match[1].replace(/-/g, '');
        if (compact.slice(0, 2) !== prefix.name) {
          unexpectedEntryCount += 1;
          continue;
        }
        try {
          blobIds.add(asBlobId(match[1]));
        } catch {
          unexpectedEntryCount += 1;
        }
      }
    }
    return Object.freeze({
      blobIds,
      unexpectedEntryCount,
    });
  } catch (error) {
    throw mapAttachmentError(error);
  }
}
