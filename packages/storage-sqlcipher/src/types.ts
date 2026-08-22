import type {
  Folder,
  FolderId,
  ContentVersion,
  Note,
  NoteId,
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
