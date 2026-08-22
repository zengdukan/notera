import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';

import {
  AttachmentStorageError,
  createAttachmentStore,
  type AttachmentStore,
} from '@notera/attachments';
import {
  createProfileKeyPackage,
  CryptoError,
  unlockProfileKeyPackage,
  wipeBytes,
} from '@notera/crypto';
import {
  asFolderId,
  asLocalProfileId,
  asTimestamp,
  asVaultId,
  type FolderId,
  type LocalProfileId,
} from '@notera/domain';
import {
  createVaultDatabase,
  openVaultDatabase,
  StorageError,
  type VaultDatabase,
} from '@notera/storage-sqlcipher';

import { createProfileCatalog, type ProfileCatalog } from './catalog';
import { ApplicationError } from './errors';
import { createApplicationPaths, type ApplicationPaths } from './paths';
import { createProfileSession, type ProfileSession } from './session';
import type {
  Page,
  PageRequest,
  ProfileManager,
  ProfileSummary,
  SessionState,
} from './types';
import { VaultMetaStore } from './vault-meta';

const lockedState = Object.freeze({ state: 'LOCKED' as const });

function name(value: unknown): string {
  if (typeof value !== 'string') throw new ApplicationError('INVALID_NAME');
  const trimmed = value.trim();
  if ([...trimmed].length < 1 || [...trimmed].length > 100) {
    throw new ApplicationError('INVALID_NAME');
  }
  return trimmed;
}

function password(value: unknown): string {
  if (typeof value !== 'string' || [...value].length < 1 || [...value].length > 1024) {
    throw new ApplicationError('OPERATION_FAILED');
  }
  return value;
}

function mapError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  if (error instanceof CryptoError) {
    return new ApplicationError(
      error.code === 'AUTHENTICATION_FAILED' ? 'WRONG_PASSWORD' : 'CRYPTO_UNAVAILABLE',
    );
  }
  if (error instanceof StorageError) {
    const mapped = {
      DB_CORRUPT: 'DB_CORRUPT',
      DB_SCHEMA_TOO_NEW: 'DB_SCHEMA_TOO_NEW',
      MIGRATION_FAILED: 'MIGRATION_FAILED',
      DISK_FULL: 'DISK_FULL',
    } as const;
    return new ApplicationError(mapped[error.code as keyof typeof mapped] ?? 'OPERATION_FAILED');
  }
  if (error instanceof AttachmentStorageError) {
    return new ApplicationError(error.code === 'DISK_FULL' ? 'DISK_FULL' : 'OPERATION_FAILED');
  }
  return new ApplicationError('OPERATION_FAILED');
}

function sessionState(session: ProfileSession | undefined): SessionState {
  if (session === undefined) return lockedState;
  const { localProfileId, displayName, rootFolderId } = session.summary;
  return Object.freeze({ state: 'UNLOCKED', localProfileId, displayName, rootFolderId });
}

class LocalProfileManager implements ProfileManager {
  private session: ProfileSession | undefined;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private closePromise: Promise<void> | undefined;

  constructor(
    private readonly paths: ApplicationPaths,
    private readonly catalog: ProfileCatalog,
  ) {}

  private ensureOpen(): void {
    if (this.closed) throw new ApplicationError('APPLICATION_CLOSED');
  }

  private enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.queue.then(async () => {
      this.ensureOpen();
      return operation();
    });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  listProfiles(input: PageRequest): Page<ProfileSummary> {
    this.ensureOpen();
    return this.catalog.list(input, this.session?.summary.localProfileId);
  }

  getSessionState(): SessionState {
    this.ensureOpen();
    return sessionState(this.session);
  }

  createProfile(input: { readonly displayName: string; readonly password: string }) {
    return this.enqueue(async () => {
      const displayName = name(input?.displayName);
      const masterPassword = password(input?.password);
      await this.lockCurrent();
      const localProfileId = asLocalProfileId(randomUUID());
      const vaultId = asVaultId(randomUUID());
      const rootFolderId = asFolderId(randomUUID());
      const profile = this.paths.profile(localProfileId);
      let directoryCreated = false;
      let markerCreated = false;
      let database: VaultDatabase | undefined;
      let attachments: AttachmentStore | undefined;
      let createdSession: ProfileSession | undefined;
      let databaseKey: Uint8Array | undefined;
      let vaultKey: Uint8Array | undefined;
      let committed = false;
      try {
        await mkdir(profile.root);
        directoryCreated = true;
        await writeFile(profile.creatingMarker, new Uint8Array(), { flag: 'wx', mode: 0o600 });
        markerCreated = true;
        const keys = await createProfileKeyPackage(masterPassword, localProfileId);
        databaseKey = keys.databaseKey;
        vaultKey = keys.vaultKey;
        const meta = await new VaultMetaStore(profile, () => randomBytes(16).toString('hex')).writeInitial({
          metaVersion: 1,
          localProfileId,
          vaultId,
          fileFormatVersion: 1,
          keyPackage: keys.keyPackage,
        });
        database = createVaultDatabase({
          filePath: profile.database,
          databaseKey,
          identity: { id: vaultId, rootFolderId },
          profileName: displayName,
          vaultMetaDigest: meta.digest,
        });
        attachments = await createAttachmentStore({ profileRoot: profile.root });
        createdSession = createProfileSession({
          localProfileId,
          vaultId,
          rootFolderId,
          displayName,
          databaseKey,
          vaultKey,
          database,
          attachments,
        });
        database = undefined;
        attachments = undefined;
        wipeBytes(databaseKey);
        wipeBytes(vaultKey);
        databaseKey = undefined;
        vaultKey = undefined;
        await this.catalog.add({
          localProfileId,
          displayName,
          sortOrder: Date.now(),
          lastUsedAt: asTimestamp(Date.now()),
        });
        committed = true;
        this.ensureOpen();
        this.session = createdSession;
        createdSession = undefined;
        try { await unlink(profile.creatingMarker); } catch { /* startup recovery clears it */ }
        return sessionState(this.session) as Extract<SessionState, { state: 'UNLOCKED' }>;
      } catch (error) {
        await createdSession?.close().catch(() => undefined);
        await attachments?.close().catch(() => undefined);
        try { database?.close(); } catch { /* preserve original */ }
        if (databaseKey !== undefined) wipeBytes(databaseKey);
        if (vaultKey !== undefined) wipeBytes(vaultKey);
        if (!committed && directoryCreated && markerCreated) {
          await rm(profile.root, { force: true, recursive: true }).catch(() => undefined);
        }
        throw mapError(error);
      }
    });
  }

  unlockProfile(input: { readonly localProfileId: LocalProfileId; readonly password: string }) {
    return this.enqueue(() => {
      const masterPassword = password(input?.password);
      let id: LocalProfileId;
      try { id = asLocalProfileId(input?.localProfileId); } catch { throw new ApplicationError('ENTITY_NOT_FOUND'); }
      return this.unlock(id, masterPassword);
    });
  }

  private async unlock(id: LocalProfileId, masterPassword: string): Promise<Extract<SessionState, { state: 'UNLOCKED' }>> {
    if (!this.catalog.has(id)) throw new ApplicationError('ENTITY_NOT_FOUND');
    if (this.session !== undefined) throw new ApplicationError('OPERATION_FAILED');
    const profile = this.paths.profile(id);
    let database: VaultDatabase | undefined;
    let attachments: AttachmentStore | undefined;
    let databaseKey: Uint8Array | undefined;
    let vaultKey: Uint8Array | undefined;
    let createdSession: ProfileSession | undefined;
    try {
      const meta = await new VaultMetaStore(profile, () => randomBytes(16).toString('hex')).read();
      const keys = await unlockProfileKeyPackage(masterPassword, id, meta.value.keyPackage);
      databaseKey = keys.databaseKey;
      vaultKey = keys.vaultKey;
      database = openVaultDatabase({ filePath: profile.database, databaseKey, expectedVaultId: meta.value.vaultId, expectedVaultMetaDigest: meta.digest });
      const roots = database.folders.listAll().filter((folder) => folder.kind === 'ROOT');
      if (roots.length !== 1) throw new ApplicationError('DB_CORRUPT');
      const stored = database.profileMetadata.get();
      attachments = await createAttachmentStore({ profileRoot: profile.root });
      createdSession = createProfileSession({
        localProfileId: id,
        vaultId: meta.value.vaultId,
        rootFolderId: roots[0].id as FolderId,
        displayName: stored.profileName,
        databaseKey,
        vaultKey,
        database,
        attachments,
      });
      database = undefined;
      attachments = undefined;
      wipeBytes(databaseKey); wipeBytes(vaultKey);
      databaseKey = undefined; vaultKey = undefined;
      this.ensureOpen();
      this.session = createdSession;
      createdSession = undefined;
      const cached = this.catalog.get(id);
      if (cached !== undefined) {
        await this.catalog.updateCache({ ...cached, displayName: stored.profileName, lastUsedAt: asTimestamp(Date.now()) }).catch(() => undefined);
      }
      return sessionState(this.session) as Extract<SessionState, { state: 'UNLOCKED' }>;
    } catch (error) {
      await createdSession?.close().catch(() => undefined);
      await attachments?.close().catch(() => undefined);
      try { database?.close(); } catch { /* preserve original */ }
      if (databaseKey !== undefined) wipeBytes(databaseKey);
      if (vaultKey !== undefined) wipeBytes(vaultKey);
      throw mapError(error);
    }
  }

  lockProfile(): Promise<void> { return this.enqueue(() => this.lockCurrent()); }
  private async lockCurrent(): Promise<void> {
    const current = this.session;
    this.session = undefined;
    if (current !== undefined) await current.close();
  }

  switchProfile(input: { readonly localProfileId: LocalProfileId; readonly password: string }) {
    return this.enqueue(async () => {
      const masterPassword = password(input?.password);
      let id: LocalProfileId;
      try { id = asLocalProfileId(input?.localProfileId); } catch { throw new ApplicationError('ENTITY_NOT_FOUND'); }
      await this.lockCurrent();
      return this.unlock(id, masterPassword);
    });
  }

  renameProfile(value: string): Promise<ProfileSummary> {
    return this.enqueue(async () => {
      const displayName = name(value);
      const current = this.session;
      if (current === undefined) throw new ApplicationError('PROFILE_LOCKED');
      await current.run(({ database }) => database.transaction((transaction) => transaction.profileMetadata.rename(displayName)));
      current.updateDisplayName(displayName);
      const cached = this.catalog.get(current.summary.localProfileId);
      if (cached !== undefined) await this.catalog.updateCache({ ...cached, displayName }).catch(() => undefined);
      return Object.freeze({
        localProfileId: current.summary.localProfileId,
        displayName,
        lastUsedAt: cached?.lastUsedAt ?? asTimestamp(0),
        isCurrent: true,
      });
    });
  }

  changeProfilePassword(): Promise<void> { return Promise.reject(new ApplicationError('OPERATION_FAILED')); }
  removeProfileFromDevice(): Promise<void> { return Promise.reject(new ApplicationError('OPERATION_FAILED')); }

  close(): Promise<void> {
    if (this.closePromise !== undefined) return this.closePromise;
    this.closed = true;
    this.closePromise = this.queue.then(() => this.lockCurrent());
    return this.closePromise;
  }
}

export async function createProfileManager(input: { readonly appDataRoot: string }): Promise<ProfileManager> {
  const paths = await createApplicationPaths(input?.appDataRoot);
  const { catalog } = await createProfileCatalog(paths);
  return new LocalProfileManager(paths, catalog);
}
