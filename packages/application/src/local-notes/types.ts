import type {
  AdfDocument,
  ContentVersion,
  FolderId,
  NoteId,
  NoteVersionId,
  SortOrder,
  TagId,
  Timestamp,
  TrashEntryId,
} from '@notera/domain';

import type { Page, PageRequest } from '../types';

export type ContentSortField = 'CREATED_AT' | 'UPDATED_AT' | 'TITLE';
export type SortDirection = 'ASC' | 'DESC';

export interface ContentSort {
  readonly field: ContentSortField;
  readonly direction: SortDirection;
}

export interface FolderSummary {
  readonly kind: 'folder';
  readonly id: FolderId;
  readonly name: string;
  readonly parentId: FolderId;
  readonly updatedAt: Timestamp;
  readonly hasChildren: boolean;
}

export interface NoteSummary {
  readonly kind: 'note';
  readonly id: NoteId;
  readonly title: string;
  readonly folderId: FolderId;
  readonly contentVersion: ContentVersion;
  readonly updatedAt: Timestamp;
}

export interface TagSummary {
  readonly id: TagId;
  readonly name: string;
  readonly updatedAt: Timestamp;
}

export interface NoteDetail extends NoteSummary {
  readonly document: AdfDocument;
  readonly createdAt: Timestamp;
  readonly tags: readonly TagSummary[];
}

export interface FavoriteNoteSummary extends NoteSummary {
  readonly favoriteSortOrder: SortOrder;
}

export type SystemProtectionReason =
  | 'BEFORE_HISTORY_RESTORE'
  | 'BEFORE_MIGRATION';

export interface HistorySummary {
  readonly versionId: NoteVersionId;
  readonly noteId: NoteId;
  readonly kind: 'USER' | 'SYSTEM_PROTECTION';
  readonly protectionReason: SystemProtectionReason | null;
  readonly versionName: string | null;
  readonly displayTitle: string;
  readonly createdAt: Timestamp;
}

export type VersionRef =
  | Readonly<{ source: 'CURRENT' }>
  | Readonly<{ source: 'VERSION'; versionId: NoteVersionId }>;

export interface HistorySnapshot {
  readonly ref: VersionRef;
  readonly noteId: NoteId;
  readonly title: string;
  readonly document: AdfDocument;
  readonly createdAt: Timestamp;
}

export interface HistoryComparison {
  readonly left: HistorySnapshot;
  readonly right: HistorySnapshot;
}

export interface HistoryRestoreResult {
  readonly noteId: NoteId;
  readonly contentVersion: ContentVersion;
  readonly protectionVersionId: NoteVersionId;
}

export type TreeEntrySummary = FolderSummary | NoteSummary;

export interface ListChildrenInput {
  readonly parentFolderId: FolderId;
  readonly cursor?: string;
  readonly limit: number;
  readonly sort?: ContentSort;
}

export interface LocalNotesService {
  listChildren(input: ListChildrenInput): Promise<Page<TreeEntrySummary>>;
  createFolder(input: {
    readonly parentFolderId: FolderId;
    readonly name: string;
  }): Promise<FolderSummary>;
  renameFolder(input: {
    readonly folderId: FolderId;
    readonly name: string;
  }): Promise<FolderSummary>;
  moveFolder(input: {
    readonly folderId: FolderId;
    readonly targetParentId: FolderId;
  }): Promise<FolderSummary>;
  createNote(input: {
    readonly folderId: FolderId;
    readonly title?: string;
  }): Promise<NoteDetail>;
  getNote(noteId: NoteId): Promise<NoteDetail>;
  saveDraft(input: {
    readonly noteId: NoteId;
    readonly expectedContentVersion: number;
    readonly title: string;
    readonly document: AdfDocument;
  }): Promise<{
    readonly noteId: NoteId;
    readonly contentVersion: ContentVersion;
    readonly savedAt: Timestamp;
  }>;
  moveNote(input: {
    readonly noteId: NoteId;
    readonly targetFolderId: FolderId;
  }): Promise<NoteSummary>;
  copyNote(input: {
    readonly noteId: NoteId;
    readonly targetFolderId: FolderId;
  }): Promise<NoteSummary>;
  trashNote(noteId: NoteId): Promise<{ readonly trashEntryId: TrashEntryId }>;
  listRecent(input: PageRequest): Promise<Page<NoteSummary>>;
  listTags(input: PageRequest): Promise<Page<TagSummary>>;
  createTag(name: string): Promise<TagSummary>;
  renameTag(input: {
    readonly tagId: TagId;
    readonly name: string;
  }): Promise<TagSummary>;
  deleteTag(tagId: TagId): Promise<void>;
  addTagToNote(input: {
    readonly noteId: NoteId;
    readonly tagId: TagId;
  }): Promise<void>;
  removeTagFromNote(input: {
    readonly noteId: NoteId;
    readonly tagId: TagId;
  }): Promise<void>;
  listFavorites(input: PageRequest): Promise<Page<FavoriteNoteSummary>>;
  addFavorite(noteId: NoteId): Promise<void>;
  removeFavorite(noteId: NoteId): Promise<void>;
  reorderFavorite(input: {
    readonly noteId: NoteId;
    readonly beforeNoteId?: NoteId;
  }): Promise<void>;
  listHistory(
    input: PageRequest & { readonly noteId: NoteId },
  ): Promise<Page<HistorySummary>>;
  getHistory(input: {
    readonly noteId: NoteId;
    readonly versionId: NoteVersionId;
  }): Promise<HistorySnapshot>;
  createPermanentVersion(input: {
    readonly noteId: NoteId;
    readonly versionName?: string;
  }): Promise<HistorySummary>;
  renameHistoryVersion(input: {
    readonly noteId: NoteId;
    readonly versionId: NoteVersionId;
    readonly versionName: string | null;
  }): Promise<HistorySummary>;
  compareHistory(input: {
    readonly noteId: NoteId;
    readonly left: VersionRef;
    readonly right: VersionRef;
  }): Promise<HistoryComparison>;
  restoreHistory(input: {
    readonly noteId: NoteId;
    readonly versionId: NoteVersionId;
    readonly expectedContentVersion: ContentVersion;
  }): Promise<HistoryRestoreResult>;
  copyHistory(input: {
    readonly noteId: NoteId;
    readonly versionId: NoteVersionId;
    readonly targetFolderId: FolderId;
  }): Promise<NoteSummary>;
}
