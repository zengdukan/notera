import type { FolderId, VaultId } from '../ids';
import { immutable } from './common';

export interface VaultIdentity {
  readonly id: VaultId;
  readonly rootFolderId: FolderId;
}

export function createVaultIdentity(input: VaultIdentity): VaultIdentity {
  return immutable(input);
}
