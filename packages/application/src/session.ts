import type { AttachmentStore } from '@notera/attachments';
import { wipeBytes } from '@notera/crypto';
import {
  asLocalProfileId,
  asVaultId,
  type LocalProfileId,
  type FolderId,
  type VaultId,
} from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from './errors';
import type { UnlockedSession } from './types';

export interface SessionResources {
  readonly database: VaultDatabase;
  readonly attachments: AttachmentStore;
  readonly signal: AbortSignal;
}

export interface ProfileSession {
  readonly summary: UnlockedSession;
  run<Result>(
    operation: (resources: SessionResources) => Promise<Result> | Result,
  ): Promise<Result>;
  updateDisplayName(displayName: string): void;
  close(): Promise<void>;
}

export interface CreateProfileSessionInput {
  readonly localProfileId: LocalProfileId;
  readonly vaultId: VaultId;
  readonly displayName: string;
  readonly rootFolderId: FolderId;
  readonly databaseKey: Uint8Array;
  readonly vaultKey: Uint8Array;
  readonly database: VaultDatabase;
  readonly attachments: AttachmentStore;
}

export interface ProfileSessionTestingHooks {
  readonly observeKeys?: (
    phase: 'before' | 'after',
    databaseKey: Uint8Array,
    vaultKey: Uint8Array,
  ) => void;
}

function displayName(value: unknown): string {
  if (typeof value !== 'string') throw new ApplicationError('INVALID_NAME');
  const normalized = value.trim();
  if ([...normalized].length < 1 || [...normalized].length > 100) {
    throw new ApplicationError('INVALID_NAME');
  }
  return normalized;
}

function key(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
    throw new ApplicationError('OPERATION_FAILED');
  }
  return Uint8Array.from(value);
}

class OwnedProfileSession implements ProfileSession {
  private currentSummary: UnlockedSession;
  private readonly controller = new AbortController();
  private readonly active = new Set<Promise<unknown>>();
  private readonly databaseKey: Uint8Array;
  private readonly vaultKey: Uint8Array;
  private database: VaultDatabase | undefined;
  private attachments: AttachmentStore | undefined;
  private closing = false;
  private closePromise: Promise<void> | undefined;

  constructor(
    input: CreateProfileSessionInput,
    private readonly hooks: ProfileSessionTestingHooks,
  ) {
    try {
      this.currentSummary = Object.freeze({
        localProfileId: asLocalProfileId(input.localProfileId),
        vaultId: asVaultId(input.vaultId),
        displayName: displayName(input.displayName),
        rootFolderId: input.rootFolderId,
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('OPERATION_FAILED');
    }
    this.databaseKey = key(input.databaseKey);
    this.vaultKey = key(input.vaultKey);
    this.database = input.database;
    this.attachments = input.attachments;
  }

  get summary(): UnlockedSession {
    return this.currentSummary;
  }

  run<Result>(
    operation: (resources: SessionResources) => Promise<Result> | Result,
  ): Promise<Result> {
    if (this.closing || this.database === undefined || this.attachments === undefined) {
      return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
    }
    const resources = Object.freeze({
      database: this.database,
      attachments: this.attachments,
      signal: this.controller.signal,
    });
    let active!: Promise<Result>;
    active = Promise.resolve()
      .then(() => operation(resources))
      .finally(() => {
        this.active.delete(active);
      });
    this.active.add(active);
    return active;
  }

  updateDisplayName(value: string): void {
    if (this.closing) throw new ApplicationError('PROFILE_LOCKED');
    this.currentSummary = Object.freeze({
      ...this.currentSummary,
      displayName: displayName(value),
    });
  }

  close(): Promise<void> {
    if (this.closePromise !== undefined) return this.closePromise;
    this.closing = true;
    this.controller.abort();
    this.closePromise = this.performClose();
    return this.closePromise;
  }

  private async performClose(): Promise<void> {
    let firstError: ApplicationError | undefined;
    await Promise.allSettled([...this.active]);

    const attachments = this.attachments;
    this.attachments = undefined;
    if (attachments !== undefined) {
      try {
        await attachments.close();
      } catch {
        firstError = new ApplicationError('OPERATION_FAILED');
      }
    }

    const database = this.database;
    this.database = undefined;
    if (database !== undefined) {
      try {
        database.close();
      } catch {
        firstError ??= new ApplicationError('OPERATION_FAILED');
      }
    }

    try {
      this.hooks.observeKeys?.('before', this.databaseKey, this.vaultKey);
    } catch {
      // Testing observation cannot interfere with secret cleanup.
    }
    wipeBytes(this.databaseKey);
    wipeBytes(this.vaultKey);
    try {
      this.hooks.observeKeys?.('after', this.databaseKey, this.vaultKey);
    } catch {
      // Testing observation cannot interfere with secret cleanup.
    }
    if (firstError !== undefined) throw firstError;
  }
}

export function createProfileSession(
  input: CreateProfileSessionInput,
  hooks: ProfileSessionTestingHooks = {},
): ProfileSession {
  return new OwnedProfileSession(input, hooks);
}
