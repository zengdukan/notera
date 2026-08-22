import type { FolderTreeCopyPlan, NoteCopyPlan, VaultId } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { StorageError } from '../errors';
import type {
  BatchMoveStoragePlan,
  BatchRelationStoragePlan,
  ContentPlanWriter,
} from '../types';
import type { FolderRepository } from './folders';
import type { NoteRepository } from './notes';
import type { TagRepository } from './tags';

type UseGuard = () => void;

export class ContentPlanRepository implements ContentPlanWriter {
  constructor(
    private readonly connection: () => SqlcipherConnection,
    private readonly vaultId: VaultId,
    private readonly folders: FolderRepository,
    private readonly notes: NoteRepository,
    private readonly tags: TagRepository,
    private readonly guard: UseGuard,
  ) {}

  insertNoteCopy(plan: NoteCopyPlan): void {
    this.guard();
    this.validateAttachmentReferences(plan.attachmentReferences, new Set([plan.note.id]));
    plan.noteTags.forEach((value) => {
      if (!this.tags.get(value.tagId) || value.vaultId !== this.vaultId) {
        throw new StorageError('RELATION_INTEGRITY_VIOLATION');
      }
    });
    this.notes.insert(plan.note);
    plan.noteTags.forEach((value) => this.tags.addToNote(value));
    this.insertAttachmentReferences(plan.attachmentReferences);
  }

  insertFolderTreeCopy(plan: FolderTreeCopyPlan): void {
    this.guard();
    this.validateAttachmentReferences(
      plan.attachmentReferences,
      new Set(plan.notes.map(({ id }) => id)),
    );
    plan.folders.forEach((folder) => this.folders.insert(folder));
    plan.notes.forEach((note) => this.notes.insert(note));
    plan.noteTags.forEach((value) => this.tags.addToNote(value));
    this.insertAttachmentReferences(plan.attachmentReferences);
  }

  applyBatchMove(input: BatchMoveStoragePlan): void {
    this.guard();
    input.folders.forEach((folder) => this.folders.replace(folder));
    input.notes.forEach((note) => this.notes.replaceLocation(note));
  }

  applyBatchRelations(input: BatchRelationStoragePlan): void {
    this.guard();
    input.add.forEach((value) => this.tags.addToNote(value));
    input.remove.forEach((value) =>
      this.tags.removeFromNote(value.noteId, value.tagId),
    );
  }

  private validateAttachmentReferences(
    references: NoteCopyPlan['attachmentReferences'],
    noteIds: ReadonlySet<string>,
  ): void {
    references.forEach((reference) => {
      const attachment = this.connection().prepare(
        'SELECT 1 FROM attachments WHERE id = ? AND vault_id = ?',
      ).get(reference.attachmentId, this.vaultId);
      if (
        reference.vaultId !== this.vaultId ||
        !noteIds.has(reference.noteId) ||
        !attachment
      ) {
        throw new StorageError('RELATION_INTEGRITY_VIOLATION');
      }
    });
  }

  private insertAttachmentReferences(
    references: NoteCopyPlan['attachmentReferences'],
  ): void {
    references.forEach((reference) => {
      this.connection().prepare(
        `INSERT OR IGNORE INTO attachment_references(
           vault_id, attachment_id, source_type,
           note_id, note_version_id, trash_entry_id
         ) VALUES (?, ?, 'NOTE', ?, NULL, NULL)`,
      ).run(this.vaultId, reference.attachmentId, reference.noteId);
    });
  }
}
