export type InternalSessionName = string & {
  readonly __internalSessionName: unique symbol;
};

import type { LocalProfileId, Timestamp, VaultId } from '@notera/domain';

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
  readonly sortOrder: number;
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
}
