import { lstat, mkdir, readdir, realpath, rm, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  asLocalProfileId,
  asTimestamp,
  type LocalProfileId,
} from '@notera/domain';

import type { ApplicationPaths } from './paths';
import type { CatalogEntry, RecoveryReport } from './types';
import { VaultMetaStore } from './vault-meta';

const DELETING_ENTRY = /^([0-9a-f-]{36})\.([0-9a-f]{32})$/u;

export interface RecoveryDependencies {
  readonly createSessionName: () => string;
  readonly removeDirectory: (absolutePath: string) => Promise<void>;
}

export interface RecoveryResult {
  readonly entries: readonly CatalogEntry[];
  readonly report: RecoveryReport;
  readonly changed: boolean;
}

type MutableRecoveryReport = {
  -readonly [Key in keyof RecoveryReport]: RecoveryReport[Key];
};

function defaultReport(): MutableRecoveryReport {
  return {
    recoveredProfileCount: 0,
    removedCatalogEntryCount: 0,
    removedCreatingDirectoryCount: 0,
    clearedCreatingMarkerCount: 0,
    resumedDeletionCount: 0,
    unexpectedEntryCount: 0,
  };
}

async function ordinaryDirectDirectory(path: string, parent: string): Promise<boolean> {
  try {
    const status = await lstat(path);
    if (!status.isDirectory() || status.isSymbolicLink()) return false;
    const actual = await realpath(path);
    return dirname(actual) === parent && actual === path;
  } catch {
    return false;
  }
}

export async function recoverCatalog(
  paths: ApplicationPaths,
  initialEntries: readonly CatalogEntry[],
  dependencies: RecoveryDependencies,
): Promise<RecoveryResult> {
  const entries = new Map(initialEntries.map((entry) => [entry.localProfileId, entry]));
  const report = defaultReport();
  let changed = false;
  await mkdir(paths.deletingRoot, { recursive: true });

  for (const item of await readdir(paths.deletingRoot, { withFileTypes: true })) {
    const match = DELETING_ENTRY.exec(item.name);
    let id: LocalProfileId | undefined;
    try {
      id = match === null ? undefined : asLocalProfileId(match[1]);
    } catch {
      id = undefined;
    }
    const target = join(paths.deletingRoot, item.name);
    if (
      id === undefined ||
      !item.isDirectory() ||
      item.isSymbolicLink() ||
      !(await ordinaryDirectDirectory(target, paths.deletingRoot))
    ) {
      report.unexpectedEntryCount += 1;
      continue;
    }
    if (entries.delete(id)) {
      report.removedCatalogEntryCount += 1;
      changed = true;
    }
    try {
      await dependencies.removeDirectory(target);
      report.resumedDeletionCount += 1;
    } catch {
      // A verified isolation directory remains for the next startup retry.
    }
  }

  const seen = new Set<LocalProfileId>();
  for (const item of await readdir(paths.profilesRoot, { withFileTypes: true })) {
    if (item.name === '.deleting') continue;
    let id: LocalProfileId;
    try {
      id = asLocalProfileId(item.name);
    } catch {
      report.unexpectedEntryCount += 1;
      continue;
    }
    const profile = paths.profile(id);
    if (
      !item.isDirectory() ||
      item.isSymbolicLink() ||
      !(await ordinaryDirectDirectory(profile.root, paths.profilesRoot))
    ) {
      report.unexpectedEntryCount += 1;
      continue;
    }
    seen.add(id);
    let creating = false;
    try {
      const marker = await lstat(profile.creatingMarker);
      if (!marker.isFile() || marker.isSymbolicLink()) {
        report.unexpectedEntryCount += 1;
        continue;
      }
      creating = true;
    } catch {
      creating = false;
    }
    if (creating) {
      if (entries.has(id)) {
        try {
          await unlink(profile.creatingMarker);
          report.clearedCreatingMarkerCount += 1;
        } catch {
          // The published directory stays visible; cleanup can be retried.
        }
      } else {
        await dependencies.removeDirectory(profile.root);
        report.removedCreatingDirectoryCount += 1;
      }
      continue;
    }
    if (!entries.has(id)) {
      try {
        const metadata = await new VaultMetaStore(
          profile,
          dependencies.createSessionName,
        ).read();
        if (metadata.value.localProfileId !== id) throw new Error('mismatch');
        const nextSort = Math.max(-1, ...[...entries.values()].map(({ sortOrder }) => sortOrder)) + 1;
        entries.set(id, {
          localProfileId: id,
          displayName: `Profile ${id.slice(0, 8)}`,
          sortOrder: nextSort,
          lastUsedAt: asTimestamp(0),
        });
        report.recoveredProfileCount += 1;
        changed = true;
      } catch {
        report.unexpectedEntryCount += 1;
      }
    }
  }

  for (const id of [...entries.keys()]) {
    if (!seen.has(id)) {
      entries.delete(id);
      report.removedCatalogEntryCount += 1;
      changed = true;
    }
  }
  return {
    entries: [...entries.values()],
    report: Object.freeze(report),
    changed,
  };
}

export const removeVerifiedDirectory = (absolutePath: string): Promise<void> =>
  rm(absolutePath, { force: true, recursive: true });
