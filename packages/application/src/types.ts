import type { LocalProfileId, Timestamp, VaultId } from '@notera/domain';

export type InternalSessionName = string & {
  readonly __internalSessionName: unique symbol;
};

export interface PageRequest {
  readonly cursor?: string;
  readonly limit: number;
}

export interface Page<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: string;
}

export interface ProfileSummary {
  readonly localProfileId: LocalProfileId;
  readonly displayName: string;
  readonly lastUsedAt: Timestamp;
  readonly isCurrent: boolean;
}

export interface CatalogEntry {
  readonly localProfileId: LocalProfileId;
  readonly displayName: string;
  readonly sortOrder: number;
  readonly lastUsedAt: Timestamp;
}

export interface RecoveryReport {
  readonly recoveredProfileCount: number;
  readonly removedCatalogEntryCount: number;
  readonly removedCreatingDirectoryCount: number;
  readonly clearedCreatingMarkerCount: number;
  readonly resumedDeletionCount: number;
  readonly unexpectedEntryCount: number;
}

export interface UnlockedSession {
  readonly localProfileId: LocalProfileId;
  readonly vaultId: VaultId;
  readonly displayName: string;
  readonly rootFolderId: import('@notera/domain').FolderId;
}

export type SessionState =
  | Readonly<{ state: 'LOCKED' }>
  | Readonly<{
      state: 'UNLOCKED';
      localProfileId: LocalProfileId;
      displayName: string;
      rootFolderId: import('@notera/domain').FolderId;
    }>;

export interface ProfileManager {
  listProfiles(input: PageRequest): Page<ProfileSummary>;
  getSessionState(): SessionState;
  createProfile(input: {
    readonly displayName: string;
    readonly password: string;
  }): Promise<Extract<SessionState, { state: 'UNLOCKED' }>>;
  unlockProfile(input: {
    readonly localProfileId: LocalProfileId;
    readonly password: string;
  }): Promise<Extract<SessionState, { state: 'UNLOCKED' }>>;
  lockProfile(): Promise<void>;
  switchProfile(input: {
    readonly localProfileId: LocalProfileId;
    readonly password: string;
  }): Promise<Extract<SessionState, { state: 'UNLOCKED' }>>;
  renameProfile(displayName: string): Promise<ProfileSummary>;
  changeProfilePassword(input: {
    readonly oldPassword: string;
    readonly newPassword: string;
  }): Promise<void>;
  removeProfileFromDevice(localProfileId: LocalProfileId): Promise<void>;
  close(): Promise<void>;
}
