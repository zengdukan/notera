import type {
  Folder,
  FolderId,
  ContentVersion,
  Note,
  NoteId,
  Favorite,
  NoteTag,
  NoteVersion,
  NoteVersionId,
  Tag,
  TagId,
  FolderTreeCopyPlan,
  NoteCopyPlan,
  Timestamp,
  TrashEntry,
  TrashEntryId,
  TrashPlan,
  VaultId,
  VaultIdentity,
} from '@notera/domain';

export interface PageRequest {
  readonly cursor?: string;
  readonly limit: number;
}

export interface Page<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: string;
}

export interface ProfileMetadata {
  readonly profileName: string;
  readonly vaultMetaDigest: Uint8Array;
}

export interface ProfileMetadataReader {
  get(): ProfileMetadata;
}

export interface ProfileMetadataWriter extends ProfileMetadataReader {
  rename(profileName: string): void;
  replaceVaultMetaDigest(digest: Uint8Array): void;
}

export interface FolderReader {
  get(id: FolderId): Folder | undefined;
  listAll(): readonly Folder[];
  listChildren(parentId: FolderId, page: PageRequest): Page<Folder>;
  listSubtree(rootId: FolderId): readonly Folder[];
  listContent(folderId: FolderId, page: PageRequest): Page<Folder | Note>;
}

export interface FolderWriter extends FolderReader {
  insert(folder: Folder): void;
  replace(folder: Folder): void;
  replaceSortOrders(folders: readonly Folder[]): void;
}

export interface VaultTransaction {
  readonly profileMetadata: ProfileMetadataWriter;
  readonly folders: FolderWriter;
  readonly notes: NoteWriter;
  readonly tags: TagWriter;
  readonly favorites: FavoriteWriter;
  readonly history: HistoryWriter;
  readonly trash: TrashWriter;
  readonly contentPlans: ContentPlanWriter;
}

export interface NoteReader {
  get(id: NoteId): Note | undefined;
  listByFolder(folderId: FolderId, page: PageRequest): Page<Note>;
  listRecent(page: PageRequest): Page<Note>;
}

export interface NoteWriter extends NoteReader {
  insert(note: Note): void;
  replaceContent(note: Note, expectedContentVersion: ContentVersion): void;
  replaceLocation(note: Note): void;
  replaceSortOrders(notes: readonly Note[]): void;
}

export interface NormalizedSearchText {
  readonly text: string;
  readonly sourceRanges: readonly Readonly<{
    start: number;
    end: number;
  }>[];
}

export interface TagReader {
  get(id: TagId): Tag | undefined;
  list(page: PageRequest): Page<Tag>;
  listForNote(noteId: NoteId): readonly Tag[];
}

export interface TagWriter extends TagReader {
  insert(tag: Tag): void;
  replace(tag: Tag): void;
  delete(id: TagId): void;
  addToNote(value: NoteTag): void;
  removeFromNote(noteId: NoteId, tagId: TagId): void;
}

export interface FavoriteReader {
  list(page: PageRequest): Page<Favorite>;
}

export interface FavoriteWriter extends FavoriteReader {
  insert(value: Favorite): void;
  delete(noteId: NoteId): void;
  replaceSortOrders(values: readonly Favorite[]): void;
}

export interface HistoryReader {
  get(id: NoteVersionId): NoteVersion | undefined;
  listForNote(noteId: NoteId, page: PageRequest): Page<NoteVersion>;
}

export interface HistoryWriter extends HistoryReader {
  insert(version: NoteVersion): void;
  restore(
    version: NoteVersion,
    protectionVersion: NoteVersion,
    restoredNote: Note,
    expectedContentVersion: ContentVersion,
  ): void;
}

export interface TrashReader {
  get(id: TrashEntryId): TrashEntry | undefined;
  list(page: PageRequest): Page<TrashEntry>;
}

export interface TrashRestoreStoragePlan {
  readonly entries: readonly TrashEntry[];
  readonly targetFolderIds: ReadonlyMap<TrashEntryId | string, FolderId>;
  readonly now: Timestamp;
}

export interface TrashWriter extends TrashReader {
  apply(plan: TrashPlan): void;
  restore(input: TrashRestoreStoragePlan): void;
  deletePermanent(entries: readonly TrashEntry[]): void;
  purgeExpired(entries: readonly TrashEntry[]): void;
}

export interface BatchMoveStoragePlan {
  readonly folders: readonly Folder[];
  readonly notes: readonly Note[];
}

export interface BatchRelationStoragePlan {
  readonly add: readonly NoteTag[];
  readonly remove: readonly NoteTag[];
}

export interface ContentPlanWriter {
  insertNoteCopy(plan: NoteCopyPlan): void;
  insertFolderTreeCopy(plan: FolderTreeCopyPlan): void;
  applyBatchMove(input: BatchMoveStoragePlan): void;
  applyBatchRelations(input: BatchRelationStoragePlan): void;
}

export interface CreateVaultDatabaseOptions {
  readonly filePath: string;
  readonly databaseKey: Uint8Array;
  readonly identity: VaultIdentity;
  readonly profileName: string;
  readonly vaultMetaDigest: Uint8Array;
}

export interface OpenVaultDatabaseOptions {
  readonly filePath: string;
  readonly databaseKey: Uint8Array;
  readonly expectedVaultId: VaultId;
  readonly expectedVaultMetaDigest: Uint8Array;
}
