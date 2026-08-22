import type {
  Folder,
  FolderId,
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
}

export interface FolderWriter extends FolderReader {
  insert(folder: Folder): void;
  replace(folder: Folder): void;
  replaceSortOrders(folders: readonly Folder[]): void;
}

export interface VaultTransaction {
  readonly profileMetadata: ProfileMetadataWriter;
  readonly folders: FolderWriter;
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
