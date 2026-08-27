import { mkdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { asLocalProfileId, type LocalProfileId } from '@notera/domain';

import { ApplicationError } from './errors';
import type { InternalSessionName } from './types';

const INTERNAL_SESSION = /^[0-9a-f]{32}$/u;

export interface ProfilePaths {
  readonly root: string;
  readonly creatingMarker: string;
  readonly vaultMeta: string;
  readonly vaultMetaNext: string;
  readonly database: string;
  readonly blobs: string;
  readonly staging: string;
}

export interface ApplicationPaths {
  readonly appDataRoot: string;
  readonly profilesRoot: string;
  readonly deletingRoot: string;
  readonly catalog: string;
  readonly catalogBackup: string;
  readonly preferences: string;
  readonly profile: (localProfileId: LocalProfileId) => ProfilePaths;
  readonly temporarySibling: (target: string, sessionName: string) => string;
}

export function asInternalSessionName(value: unknown): InternalSessionName {
  if (typeof value !== 'string' || !INTERNAL_SESSION.test(value)) {
    throw new ApplicationError('OPERATION_FAILED');
  }
  return value as InternalSessionName;
}

function profilePaths(
  profilesRoot: string,
  localProfileId: LocalProfileId,
): ProfilePaths {
  let canonicalId: LocalProfileId;
  try {
    canonicalId = asLocalProfileId(localProfileId);
  } catch {
    throw new ApplicationError('OPERATION_FAILED');
  }
  const root = join(profilesRoot, canonicalId);
  return Object.freeze({
    root,
    creatingMarker: join(root, '.creating'),
    vaultMeta: join(root, 'vault.meta'),
    vaultMetaNext: join(root, 'vault.meta.next'),
    database: join(root, 'vault.db'),
    blobs: join(root, 'blobs'),
    staging: join(root, 'staging'),
  });
}

export async function createApplicationPaths(
  appDataRoot: string,
): Promise<ApplicationPaths> {
  if (typeof appDataRoot !== 'string' || appDataRoot.length === 0) {
    throw new ApplicationError('OPERATION_FAILED');
  }
  const requestedRoot = resolve(appDataRoot);
  try {
    await mkdir(requestedRoot, { recursive: true });
    const canonicalRoot = await realpath(requestedRoot);
    const requestedProfiles = join(canonicalRoot, 'profiles');
    await mkdir(requestedProfiles, { recursive: true });
    const profilesRoot = await realpath(requestedProfiles);
    const deletingRoot = join(profilesRoot, '.deleting');
    return Object.freeze({
      appDataRoot: canonicalRoot,
      profilesRoot,
      deletingRoot,
      catalog: join(canonicalRoot, 'profile-index.json'),
      catalogBackup: join(canonicalRoot, 'profile-index.json.bak'),
      preferences: join(canonicalRoot, 'preferences.json'),
      profile: (localProfileId: LocalProfileId) =>
        profilePaths(profilesRoot, localProfileId),
      temporarySibling: (target: string, sessionName: string) =>
        `${target}.${asInternalSessionName(sessionName)}.tmp`,
    });
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw error;
    }
    throw new ApplicationError('OPERATION_FAILED');
  }
}
