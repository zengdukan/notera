export {
  createVaultDatabase,
  openVaultDatabase,
  VaultDatabase,
} from './database';
export { StorageError, type StorageErrorCode } from './errors';
export { CURRENT_SCHEMA_VERSION } from './schema/current';
export type {
  CreateVaultDatabaseOptions,
  OpenVaultDatabaseOptions,
} from './types';
