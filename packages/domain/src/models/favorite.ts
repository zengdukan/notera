import type { NoteId, VaultId } from '../ids';
import type { SortOrder, Timestamp } from '../values';
import { immutable } from './common';

export interface Favorite {
  readonly vaultId: VaultId;
  readonly noteId: NoteId;
  readonly sortOrder: SortOrder;
  readonly createdAt: Timestamp;
}

export function createFavorite(input: Favorite): Favorite {
  return immutable(input);
}
