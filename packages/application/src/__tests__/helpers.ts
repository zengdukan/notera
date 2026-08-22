import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { asLocalProfileId, asVaultId } from '@notera/domain';
import type { PasswordKeyPackage } from '@notera/crypto';

export const TEST_LOCAL_PROFILE_ID = asLocalProfileId(
  '018f5f46-43ca-7c86-9912-ec42bde8c553',
);
export const TEST_VAULT_ID = asVaultId(
  '10000000-0000-4000-8000-000000000001',
);

const roots: string[] = [];

export function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'notera-application-'));
  roots.push(root);
  return root;
}

export function cleanupTempRoots(): void {
  roots.splice(0).forEach((root) => {
    rmSync(root, { force: true, recursive: true });
  });
}

function base64(length: number, start: number): string {
  return Buffer.from(
    Uint8Array.from({ length }, (_, index) => (start + index) & 0xff),
  ).toString('base64');
}

export function keyPackage(): PasswordKeyPackage {
  return {
    version: 1,
    kdfVersion: 1,
    salt: base64(16, 1),
    wrappedDatabaseKey: {
      version: 1,
      nonce: base64(24, 21),
      ciphertext: base64(48, 51),
    },
    wrappedVaultKey: {
      version: 1,
      nonce: base64(24, 101),
      ciphertext: base64(48, 131),
    },
  };
}
