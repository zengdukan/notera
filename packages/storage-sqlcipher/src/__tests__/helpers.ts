import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  asFolderId,
  asVaultId,
  createVaultIdentity,
  type VaultIdentity,
} from '@notera/domain';

import { openNativeConnection, type SqlcipherConnection } from '../connection';

export const TEST_VAULT_ID = asVaultId('11111111-1111-4111-8111-111111111111');
export const TEST_ROOT_FOLDER_ID = asFolderId(
  '22222222-2222-4222-8222-222222222222',
);
export const OTHER_VAULT_ID = asVaultId('33333333-3333-4333-8333-333333333333');

export const TEST_IDENTITY: VaultIdentity = createVaultIdentity({
  id: TEST_VAULT_ID,
  rootFolderId: TEST_ROOT_FOLDER_ID,
});

export function databaseKey(seed = 1): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

export function vaultMetaDigest(seed = 101): Uint8Array {
  return databaseKey(seed);
}

const tempRoots: string[] = [];

export function tempDatabasePath(name = 'vault.db'): string {
  const root = mkdtempSync(join(tmpdir(), 'notera-storage-schema-'));
  tempRoots.push(root);
  return join(root, name);
}

export function cleanupTempDatabases(): void {
  tempRoots.splice(0).forEach((root) => {
    rmSync(root, { force: true, recursive: true });
  });
}

export function openTestConnection(
  filePath: string,
  key = databaseKey(),
): SqlcipherConnection {
  return openNativeConnection({
    filePath,
    databaseKey: key,
    mode: 'OPEN_EXISTING',
  });
}

export function fileHash(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function normalizeSchema(connection: SqlcipherConnection): unknown[] {
  return connection
    .prepare<{
      type: string;
      name: string;
      tableName: string;
      sql: string | null;
    }>(
      `SELECT type, name, tbl_name AS tableName, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all()
    .map((row) => ({
      ...row,
      sql: row.sql?.replace(/\s+/g, ' ').trim() ?? null,
    }));
}
