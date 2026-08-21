import type { NoteId, TagId, VaultId } from '../ids';
import type { TagName, Timestamp } from '../values';
import { assertTimestampOrder, immutable } from './common';

export interface Tag {
  readonly id: TagId;
  readonly vaultId: VaultId;
  readonly name: TagName;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface NoteTag {
  readonly vaultId: VaultId;
  readonly noteId: NoteId;
  readonly tagId: TagId;
}

export function createTag(input: Tag): Tag {
  assertTimestampOrder(input.createdAt, input.updatedAt);
  return immutable(input);
}

export function createNoteTag(input: NoteTag): NoteTag {
  return immutable(input);
}
