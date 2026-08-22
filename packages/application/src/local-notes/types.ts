import type {
  AdfDocument,
  ContentVersion,
  FolderId,
  NoteId,
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
}
