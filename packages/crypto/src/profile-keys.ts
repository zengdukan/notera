import {
  assertByteLength,
  decodeBase64,
  encodeBase64,
  wipeBytes,
} from './bytes';
import { CryptoError } from './errors';
import {
  encodeKeyWrapAad,
  type WrappedKeyEnvelope,
  unwrapKey,
  wrapKey,
} from './key-wrapping';
import { derivePasswordWrappingKey } from './kdf';
import {
  CRYPTO_FORMAT_VERSION,
  KDF_VERSION,
  KeyWrapPurpose,
  SALT_BYTES,
} from './parameters';
import { generateDatabaseKey, generateSalt, generateVaultKey } from './random';

export type PasswordKeyPackage = Readonly<{
  version: 1;
  kdfVersion: 1;
  salt: string;
  wrappedDatabaseKey: WrappedKeyEnvelope;
  wrappedVaultKey: WrappedKeyEnvelope;
}>;

export type UnlockedProfileKeys = Readonly<{
  databaseKey: Uint8Array;
  vaultKey: Uint8Array;
}>;

function invalidInput(): never {
  throw new CryptoError('INVALID_CRYPTO_INPUT');
}

function databaseContext(profileId: string) {
  return {
    contextId: profileId,
    purpose: KeyWrapPurpose.DATABASE_KEY,
  } as const;
}

function vaultContext(profileId: string) {
  return {
    contextId: profileId,
    purpose: KeyWrapPurpose.VAULT_KEY,
  } as const;
}

function validatePassword(password: string): void {
  if (typeof password !== 'string' || password.length === 0) {
    invalidInput();
  }
}

function validateProfileId(profileId: string): void {
  encodeKeyWrapAad(databaseContext(profileId));
}

function parseKeyPackage(value: unknown): PasswordKeyPackage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalidInput();
  }

  const keyPackage = value as Record<string, unknown>;
  if (keyPackage.version !== CRYPTO_FORMAT_VERSION) {
    if (typeof keyPackage.version === 'number') {
      throw new CryptoError('UNSUPPORTED_CRYPTO_VERSION');
    }
    invalidInput();
  }
  if (keyPackage.kdfVersion !== KDF_VERSION) {
    if (typeof keyPackage.kdfVersion === 'number') {
      throw new CryptoError('UNSUPPORTED_CRYPTO_VERSION');
    }
    invalidInput();
  }

  const keys = Object.keys(keyPackage).sort();
  if (
    keys.length !== 5 ||
    keys[0] !== 'kdfVersion' ||
    keys[1] !== 'salt' ||
    keys[2] !== 'version' ||
    keys[3] !== 'wrappedDatabaseKey' ||
    keys[4] !== 'wrappedVaultKey' ||
    typeof keyPackage.salt !== 'string' ||
    typeof keyPackage.wrappedDatabaseKey !== 'object' ||
    keyPackage.wrappedDatabaseKey === null ||
    typeof keyPackage.wrappedVaultKey !== 'object' ||
    keyPackage.wrappedVaultKey === null
  ) {
    invalidInput();
  }

  return {
    version: CRYPTO_FORMAT_VERSION,
    kdfVersion: KDF_VERSION,
    salt: keyPackage.salt,
    wrappedDatabaseKey: keyPackage.wrappedDatabaseKey as WrappedKeyEnvelope,
    wrappedVaultKey: keyPackage.wrappedVaultKey as WrappedKeyEnvelope,
  };
}

function createKeyPackage(
  salt: string,
  wrappedDatabaseKey: WrappedKeyEnvelope,
  wrappedVaultKey: WrappedKeyEnvelope,
): PasswordKeyPackage {
  return Object.freeze({
    version: CRYPTO_FORMAT_VERSION,
    kdfVersion: KDF_VERSION,
    salt,
    wrappedDatabaseKey,
    wrappedVaultKey,
  });
}

export async function createProfileKeyPackage(
  password: string,
  profileId: string,
): Promise<{
  keyPackage: PasswordKeyPackage;
  databaseKey: Uint8Array;
  vaultKey: Uint8Array;
}> {
  validatePassword(password);
  validateProfileId(profileId);

  let databaseKey: Uint8Array | undefined;
  let vaultKey: Uint8Array | undefined;
  let passwordWrappingKey: Uint8Array | undefined;
  let completed = false;

  try {
    const salt = await generateSalt();
    databaseKey = await generateDatabaseKey();
    vaultKey = await generateVaultKey();
    passwordWrappingKey = await derivePasswordWrappingKey(password, salt);
    const wrappedDatabaseKey = await wrapKey(
      passwordWrappingKey,
      databaseKey,
      databaseContext(profileId),
    );
    const wrappedVaultKey = await wrapKey(
      passwordWrappingKey,
      vaultKey,
      vaultContext(profileId),
    );
    const keyPackage = createKeyPackage(
      await encodeBase64(salt),
      wrappedDatabaseKey,
      wrappedVaultKey,
    );
    completed = true;
    return { keyPackage, databaseKey, vaultKey };
  } finally {
    if (passwordWrappingKey) {
      wipeBytes(passwordWrappingKey);
    }
    if (!completed) {
      if (databaseKey) {
        wipeBytes(databaseKey);
      }
      if (vaultKey) {
        wipeBytes(vaultKey);
      }
    }
  }
}

export async function unlockProfileKeyPackage(
  password: string,
  profileId: string,
  keyPackageValue: unknown,
): Promise<UnlockedProfileKeys> {
  validatePassword(password);
  validateProfileId(profileId);
  const keyPackage = parseKeyPackage(keyPackageValue);
  const salt = await decodeBase64(keyPackage.salt);
  assertByteLength('salt', salt, SALT_BYTES);

  let passwordWrappingKey: Uint8Array | undefined;
  let databaseKey: Uint8Array | undefined;

  try {
    passwordWrappingKey = await derivePasswordWrappingKey(password, salt);
    databaseKey = await unwrapKey(
      passwordWrappingKey,
      keyPackage.wrappedDatabaseKey,
      databaseContext(profileId),
    );
    const vaultKey = await unwrapKey(
      passwordWrappingKey,
      keyPackage.wrappedVaultKey,
      vaultContext(profileId),
    );
    return { databaseKey, vaultKey };
  } catch (error) {
    if (databaseKey) {
      wipeBytes(databaseKey);
    }
    throw error;
  } finally {
    if (passwordWrappingKey) {
      wipeBytes(passwordWrappingKey);
    }
  }
}

export async function changeProfilePassword(
  oldPassword: string,
  newPassword: string,
  profileId: string,
  keyPackageValue: unknown,
): Promise<PasswordKeyPackage> {
  validatePassword(oldPassword);
  validatePassword(newPassword);
  validateProfileId(profileId);

  const { databaseKey, vaultKey } = await unlockProfileKeyPackage(
    oldPassword,
    profileId,
    keyPackageValue,
  );
  let passwordWrappingKey: Uint8Array | undefined;

  try {
    const salt = await generateSalt();
    passwordWrappingKey = await derivePasswordWrappingKey(newPassword, salt);
    const wrappedDatabaseKey = await wrapKey(
      passwordWrappingKey,
      databaseKey,
      databaseContext(profileId),
    );
    const wrappedVaultKey = await wrapKey(
      passwordWrappingKey,
      vaultKey,
      vaultContext(profileId),
    );
    return createKeyPackage(
      await encodeBase64(salt),
      wrappedDatabaseKey,
      wrappedVaultKey,
    );
  } finally {
    wipeBytes(databaseKey);
    wipeBytes(vaultKey);
    if (passwordWrappingKey) {
      wipeBytes(passwordWrappingKey);
    }
  }
}
