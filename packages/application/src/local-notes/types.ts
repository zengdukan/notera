import type {
  ContentVersion,
  FolderId,
  NoteId,
  Timestamp,
} from '@notera/domain';

import type { Page } from '../types';

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
}
