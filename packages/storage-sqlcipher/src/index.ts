export {
  createVaultDatabase,
  openVaultDatabase,
  VaultDatabase,
} from './database';
export { StorageError, type StorageErrorCode } from './errors';
export { CURRENT_SCHEMA_VERSION } from './schema/current';
export type {
  CreateVaultDatabaseOptions,
  FolderReader,
  FolderWriter,
  NormalizedSearchText,
  NoteReader,
  NoteWriter,
  OpenVaultDatabaseOptions,
  Page,
  PageRequest,
  ProfileMetadata,
  ProfileMetadataReader,
  ProfileMetadataWriter,
  VaultTransaction,
} from './types';
