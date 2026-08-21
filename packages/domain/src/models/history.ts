import { asAdfDocument, type AdfDocument } from '../adf';
import { assertDomain } from '../errors';
import type { NoteId, NoteVersionId, VaultId } from '../ids';
import type { ContentVersion, Timestamp } from '../values';
import { immutable } from './common';

export type SystemProtectionReason =
  | 'BEFORE_HISTORY_RESTORE'
  | 'BEFORE_MIGRATION';

interface NoteVersionBase {
  readonly id: NoteVersionId;
  readonly vaultId: VaultId;
  readonly noteId: NoteId;
  readonly sourceContentVersion: ContentVersion;
  readonly title: string;
  readonly document: AdfDocument;
  readonly createdAt: Timestamp;
}

export interface UserNoteVersion extends NoteVersionBase {
  readonly kind: 'USER';
  readonly protectionReason: null;
}

export interface ProtectionNoteVersion extends NoteVersionBase {
  readonly kind: 'SYSTEM_PROTECTION';
  readonly protectionReason: SystemProtectionReason;
}

export type NoteVersion = UserNoteVersion | ProtectionNoteVersion;

export function createNoteVersion(input: NoteVersion): NoteVersion {
  assertDomain(
    (input.kind === 'USER' && input.protectionReason === null) ||
      (input.kind === 'SYSTEM_PROTECTION' &&
        (input.protectionReason === 'BEFORE_HISTORY_RESTORE' ||
          input.protectionReason === 'BEFORE_MIGRATION')),
    'INVALID_ENTITY_STATE',
  );
  return immutable({ ...input, document: asAdfDocument(input.document) });
}
