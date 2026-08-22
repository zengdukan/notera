import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { AttachmentStorageError, mapAttachmentError } from './errors';
import type { StartupRecoveryReport } from './types';

const STAGING_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9a-f]{32}\.part$/;

function nativeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code = (error as Record<string, unknown>).code;
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
