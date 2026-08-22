import { asAdfDocument, type AdfDocument } from '../adf';
import { assertDomain } from '../errors';
import type { NoteId, NoteVersionId, VaultId } from '../ids';
import {
  asVersionName,
  type ContentVersion,
  type Timestamp,
  type VersionName,
} from '../values';
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
  readonly versionName: VersionName | null;
}

export interface ProtectionNoteVersion extends NoteVersionBase {
  readonly kind: 'SYSTEM_PROTECTION';
  readonly protectionReason: SystemProtectionReason;
  readonly versionName: null;
}

export type NoteVersion = UserNoteVersion | ProtectionNoteVersion;

export function createNoteVersion(input: NoteVersion): NoteVersion {
  if (input.kind === 'USER') {
    assertDomain(input.protectionReason === null, 'INVALID_ENTITY_STATE');
    return immutable({
      ...input,
      versionName:
        input.versionName === null ? null : asVersionName(input.versionName),
      document: asAdfDocument(input.document),
    });
  }
  assertDomain(
    input.versionName === null &&
      (input.protectionReason === 'BEFORE_HISTORY_RESTORE' ||
        input.protectionReason === 'BEFORE_MIGRATION'),
    'INVALID_ENTITY_STATE',
  );
  return immutable({ ...input, document: asAdfDocument(input.document) });
}
