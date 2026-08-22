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
  Attachment,
  AttachmentBlob,
  AttachmentId,
  AttachmentReference,
  BlobId,
  CurrentNoteAttachmentReference,
  NoteVersionAttachmentReference,
  TrashAttachmentReference,
  VaultId,
  VaultIdentity,
  VersionName,
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
  readonly pendingVaultMetaDigest?: Uint8Array;
}

export interface VaultMetaDigestTransition {
  readonly currentDigest: Uint8Array;
  readonly pendingDigest: Uint8Array;
}

export interface ProfileMetadataReader {
  get(): ProfileMetadata;
}

export interface ProfileMetadataWriter extends ProfileMetadataReader {
  rename(profileName: string): void;
  prepareVaultMetaDigest(input: VaultMetaDigestTransition): void;
  finalizeVaultMetaDigest(input: VaultMetaDigestTransition): void;
  cancelVaultMetaDigest(input: VaultMetaDigestTransition): void;
}

export interface FolderReader {
  get(id: FolderId): Folder | undefined;
  listAll(): readonly Folder[];
  listChildren(parentId: FolderId, page: PageRequest): Page<Folder>;
  listSubtree(rootId: FolderId): readonly Folder[];
  listContent(
    folderId: FolderId,
    page: PageRequest,
    sort?: ContentSort,
  ): Page<Folder | Note>;
}

export type ContentSortField = 'CREATED_AT' | 'UPDATED_AT' | 'TITLE';
export type SortDirection = 'ASC' | 'DESC';
export interface ContentSort {
  readonly field: ContentSortField;
  readonly direction: SortDirection;
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
  readonly attachments: AttachmentWriter;
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

export type SearchScope =
  | Readonly<{ kind: 'VAULT' }>
  | Readonly<{ kind: 'FOLDER_SUBTREE'; folderId: FolderId }>;

export interface SearchHighlight {
  readonly field: 'title' | 'excerpt';
  readonly start: number;
  readonly end: number;
}

export interface SearchHit {
  readonly noteId: NoteId;
  readonly title: string;
  readonly excerpt: string;
  readonly updatedAt: Timestamp;
  readonly highlights: readonly SearchHighlight[];
}

export interface SearchReader {
  query(query: string, scope: SearchScope, page: PageRequest): Page<SearchHit>;
}

export type SearchIndexIssueCode =
  | 'METADATA_INVALID'
  | 'NOTE_COUNT_MISMATCH'
  | 'ROWID_MISMATCH'
  | 'SOURCE_VERSION_MISMATCH'
  | 'TRASHED_NOTE_INDEXED'
  | 'FTS_INTEGRITY_FAILED';

export interface SearchIndexReport {
  readonly ok: boolean;
  readonly issues: readonly SearchIndexIssueCode[];
}

export type IntegrityIssueCode =
  | 'SQLITE_INTEGRITY_FAILED'
  | 'METADATA_INVALID'
  | 'VAULT_MISMATCH'
  | 'ROOT_FOLDER_INVALID'
  | 'FOLDER_PARENT_MISSING'
  | 'FOLDER_CYCLE'
  | 'RELATION_ORPHANED'
  | 'ENTITY_INVALID'
  | 'ADF_INVALID'
  | 'HISTORY_HASH_MISMATCH'
  | 'ATTACHMENT_METADATA_INVALID'
  | 'SEARCH_INDEX_INVALID';

export interface IntegrityIssue {
  readonly code: IntegrityIssueCode;
  readonly table: string;
  readonly entityId?: string;
}

export interface IntegrityReport {
  readonly ok: boolean;
  readonly issues: readonly IntegrityIssue[];
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
  listAll(): readonly Favorite[];
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
  rename(
    noteId: NoteId,
    versionId: NoteVersionId,
    versionName: VersionName | null,
  ): NoteVersion;
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
  listGroup(rootEntryId: TrashEntryId): readonly TrashEntry[];
  listExpiredGroups(now: Timestamp): readonly TrashEntry[];
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

export interface StoredAttachmentBlob {
  readonly blob: AttachmentBlob;
  readonly fileKey: Uint8Array;
  readonly manifestVersion: number;
  readonly manifest: Uint8Array;
}
export interface StoredAttachmentContent {
  readonly attachment: Attachment;
  readonly storedBlob: StoredAttachmentBlob;
}
export interface AttachmentListItem {
  readonly attachment: Attachment;
  readonly blob: AttachmentBlob;
}
export interface AttachmentReader {
  getAttachment(id: AttachmentId): Attachment | undefined;
  getBlob(id: BlobId): StoredAttachmentBlob | undefined;
  getContent(id: AttachmentId): StoredAttachmentContent | undefined;
  findReadyBlobBySha256(value: Uint8Array): StoredAttachmentBlob | undefined;
  listForNote(noteId: NoteId, page: PageRequest): Page<AttachmentListItem>;
  listReferencesForNotes(
    ids: readonly NoteId[],
  ): readonly CurrentNoteAttachmentReference[];
  listReferencesForVersions(
    ids: readonly NoteVersionId[],
  ): readonly NoteVersionAttachmentReference[];
  listReferencesForTrashEntries(
    ids: readonly TrashEntryId[],
  ): readonly TrashAttachmentReference[];
  listReferencesForAttachments(
    ids: readonly AttachmentId[],
  ): readonly AttachmentReference[];
  listAllBlobs(): readonly AttachmentBlob[];
  listGcPendingBlobs(): readonly AttachmentBlob[];
}
export interface AttachmentWriter extends AttachmentReader {
  insertBlob(value: StoredAttachmentBlob): void;
  insertAttachment(value: Attachment): void;
  replaceBlob(value: StoredAttachmentBlob): void;
  addReferences(values: readonly AttachmentReference[]): void;
  removeReferences(values: readonly AttachmentReference[]): void;
  replaceNoteReferences(
    noteId: NoteId,
    values: readonly CurrentNoteAttachmentReference[],
  ): void;
  deleteUnreferencedAttachments(
    ids: readonly AttachmentId[],
    now: Timestamp,
  ): readonly BlobId[];
  finalizeGc(blobId: BlobId): void;
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
