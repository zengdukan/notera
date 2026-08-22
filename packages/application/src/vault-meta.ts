import { createHash } from 'node:crypto';
import { readFile, rename, unlink } from 'node:fs/promises';

import type { PasswordKeyPackage, WrappedKeyEnvelope } from '@notera/crypto';
import {
  asLocalProfileId,
  asVaultId,
  type LocalProfileId,
  type VaultId,
} from '@notera/domain';

import { writeFileExclusively } from './atomic-file';
import { ApplicationError, mapFileError } from './errors';
import type { ProfilePaths } from './paths';

const META_VERSION = 1;
const FILE_FORMAT_VERSION = 1;
const SALT_BYTES = 16;
const NONCE_BYTES = 24;
const WRAPPED_KEY_BYTES = 48;

export interface VaultMetaV1 {
  readonly metaVersion: 1;
  readonly localProfileId: LocalProfileId;
  readonly vaultId: VaultId;
  readonly fileFormatVersion: 1;
  readonly keyPackage: PasswordKeyPackage;
}

export interface ReadVaultMeta {
  readonly value: VaultMetaV1;
  readonly bytes: Uint8Array;
  readonly digest: Uint8Array;
}

function invalid(): never {
  throw new ApplicationError('VAULT_META_INVALID');
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    invalid();
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid();
  }
  return value as Record<string, unknown>;
}

function canonicalBase64(value: unknown, expectedLength: number): string {
  if (typeof value !== 'string') {
    return invalid();
  }
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.byteLength !== expectedLength ||
    decoded.toString('base64') !== value
  ) {
    invalid();
  }
  return value;
}

function envelope(value: unknown): WrappedKeyEnvelope {
  const record = object(value);
  exactKeys(record, ['version', 'nonce', 'ciphertext']);
  if (record.version !== 1) {
    invalid();
  }
  return Object.freeze({
    version: 1,
    nonce: canonicalBase64(record.nonce, NONCE_BYTES),
    ciphertext: canonicalBase64(record.ciphertext, WRAPPED_KEY_BYTES),
  });
}

function packageValue(value: unknown): PasswordKeyPackage {
  const record = object(value);
  exactKeys(record, [
    'version',
    'kdfVersion',
    'salt',
    'wrappedDatabaseKey',
    'wrappedVaultKey',
  ]);
  if (record.version !== 1 || record.kdfVersion !== 1) {
    invalid();
  }
  return Object.freeze({
    version: 1,
    kdfVersion: 1,
    salt: canonicalBase64(record.salt, SALT_BYTES),
    wrappedDatabaseKey: envelope(record.wrappedDatabaseKey),
    wrappedVaultKey: envelope(record.wrappedVaultKey),
  });
}

function normalize(value: unknown): VaultMetaV1 {
  try {
    const record = object(value);
    exactKeys(record, [
      'metaVersion',
      'localProfileId',
      'vaultId',
      'fileFormatVersion',
      'keyPackage',
    ]);
    if (
      record.metaVersion !== META_VERSION ||
      record.fileFormatVersion !== FILE_FORMAT_VERSION
    ) {
      invalid();
    }
    return Object.freeze({
      metaVersion: 1,
      localProfileId: asLocalProfileId(record.localProfileId),
      vaultId: asVaultId(record.vaultId),
      fileFormatVersion: 1,
      keyPackage: packageValue(record.keyPackage),
    });
  } catch {
    return invalid();
  }
}

function canonicalBytes(value: VaultMetaV1): Uint8Array {
  return Buffer.from(
    `${JSON.stringify({
      metaVersion: value.metaVersion,
      localProfileId: value.localProfileId,
      vaultId: value.vaultId,
      fileFormatVersion: value.fileFormatVersion,
      keyPackage: {
        version: value.keyPackage.version,
        kdfVersion: value.keyPackage.kdfVersion,
        salt: value.keyPackage.salt,
        wrappedDatabaseKey: {
          version: value.keyPackage.wrappedDatabaseKey.version,
          nonce: value.keyPackage.wrappedDatabaseKey.nonce,
          ciphertext: value.keyPackage.wrappedDatabaseKey.ciphertext,
        },
        wrappedVaultKey: {
          version: value.keyPackage.wrappedVaultKey.version,
          nonce: value.keyPackage.wrappedVaultKey.nonce,
          ciphertext: value.keyPackage.wrappedVaultKey.ciphertext,
        },
      },
    })}\n`,
    'utf8',
  );
}

function result(value: VaultMetaV1, bytes: Uint8Array): ReadVaultMeta {
  return Object.freeze({
    value,
    bytes: Uint8Array.from(bytes),
    digest: Uint8Array.from(createHash('sha256').update(bytes).digest()),
  });
}

export function encodeVaultMeta(value: VaultMetaV1): ReadVaultMeta {
  const normalized = normalize(value);
  const bytes = canonicalBytes(normalized);
  return result(normalized, bytes);
}

export function decodeVaultMeta(bytes: Uint8Array): ReadVaultMeta {
  try {
    if (!(bytes instanceof Uint8Array)) {
      invalid();
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = normalize(JSON.parse(text) as unknown);
    const canonical = canonicalBytes(value);
    if (!Buffer.from(canonical).equals(Buffer.from(bytes))) {
      invalid();
    }
    return result(value, bytes);
  } catch {
    return invalid();
  }
}

export class VaultMetaStore {
  constructor(
    private readonly paths: ProfilePaths,
    private readonly createSessionName: () => string,
  ) {}

  async writeInitial(value: VaultMetaV1): Promise<ReadVaultMeta> {
    const encoded = encodeVaultMeta(value);
    await writeFileExclusively(
      this.paths.vaultMeta,
      encoded.bytes,
      this.createSessionName(),
    );
    return decodeVaultMeta(encoded.bytes);
  }

  async read(): Promise<ReadVaultMeta> {
    try {
      return decodeVaultMeta(await readFile(this.paths.vaultMeta));
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }
      throw new ApplicationError('VAULT_META_INVALID');
    }
  }

  async writeNext(value: VaultMetaV1): Promise<ReadVaultMeta> {
    const encoded = encodeVaultMeta(value);
    await writeFileExclusively(
      this.paths.vaultMetaNext,
      encoded.bytes,
      this.createSessionName(),
    );
    return decodeVaultMeta(encoded.bytes);
  }

  async promoteNext(): Promise<void> {
    try {
      await rename(this.paths.vaultMetaNext, this.paths.vaultMeta);
    } catch (error) {
      throw mapFileError(error, 'SAVE_FAILED');
    }
  }

  async discardNext(): Promise<void> {
    try {
      await unlink(this.paths.vaultMetaNext);
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw mapFileError(error, 'SAVE_FAILED');
      }
    }
  }
}
