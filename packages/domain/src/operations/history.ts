import { assertDomain, failDomain } from '../errors';
import type { NoteVersionId } from '../ids';
import {
  createNoteVersion,
  type NoteVersion,
  type ProtectionNoteVersion,
  type SystemProtectionReason,
  type UserNoteVersion,
} from '../models/history';
import { rehydrateNote, type Note } from '../models/note';
import {
  nextContentVersion,
  type Timestamp,
  type VersionName,
} from '../values';

export function createUserVersion(
  note: Note,
  id: NoteVersionId,
  createdAt: Timestamp,
  versionName: VersionName | null = null,
): UserNoteVersion {
  return createNoteVersion({
    id,
    vaultId: note.vaultId,
    noteId: note.id,
    sourceContentVersion: note.contentVersion,
    title: note.title,
    document: note.document,
    kind: 'USER',
    protectionReason: null,
    versionName,
    createdAt,
  }) as UserNoteVersion;
}

export function createProtectionVersion(
  note: Note,
  id: NoteVersionId,
  reason: SystemProtectionReason,
  createdAt: Timestamp,
): ProtectionNoteVersion {
  return createNoteVersion({
    id,
    vaultId: note.vaultId,
    noteId: note.id,
    sourceContentVersion: note.contentVersion,
    title: note.title,
    document: note.document,
    kind: 'SYSTEM_PROTECTION',
    protectionReason: reason,
    versionName: null,
    createdAt,
  }) as ProtectionNoteVersion;
}

export function renameUserVersion(
  version: NoteVersion,
  versionName: VersionName | null,
): UserNoteVersion {
  if (version.kind !== 'USER') failDomain('INVALID_ENTITY_STATE');
  return createNoteVersion({ ...version, versionName }) as UserNoteVersion;
}

export interface RestoreNoteVersionInput {
  readonly note: Note;
  readonly version: NoteVersion;
  readonly protectionVersionId: NoteVersionId;
  readonly restoredAt: Timestamp;
}

export interface RestoreNoteVersionPlan {
  readonly note: Note;
  readonly protectionVersion: ProtectionNoteVersion;
}

export function restoreNoteVersion(
  input: RestoreNoteVersionInput,
): RestoreNoteVersionPlan {
  assertDomain(input.version.noteId === input.note.id, 'VERSION_NOTE_MISMATCH');
  assertDomain(input.version.vaultId === input.note.vaultId, 'VAULT_MISMATCH');

  const protectionVersion = createProtectionVersion(
    input.note,
    input.protectionVersionId,
    'BEFORE_HISTORY_RESTORE',
    input.restoredAt,
  );
  const restoredNote = rehydrateNote({
    ...input.note,
    title: input.version.title,
    document: input.version.document,
    contentVersion: nextContentVersion(input.note.contentVersion),
    updatedAt: input.restoredAt,
  });

  return Object.freeze({ note: restoredNote, protectionVersion });
}
