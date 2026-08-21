import { assertByteLength, encodeUtf8, wipeBytes } from './bytes';
import { CryptoError, isCryptoError } from './errors';
import {
  ARGON2_MEMLIMIT,
  ARGON2_OPSLIMIT,
  ARGON2_OUTPUT_BYTES,
  KEY_BYTES,
  KeyDerivationContext,
  SALT_BYTES,
} from './parameters';
import { getSodium } from './sodium';

export type Argon2idParameters = Readonly<{
  memoryLimit: number;
  operationsLimit: number;
  outputLength: number;
}>;

function invalidInput(): never {
  throw new CryptoError('INVALID_CRYPTO_INPUT');
}

function isApprovedContext(
  context: KeyDerivationContext,
): context is KeyDerivationContext {
  return Object.values(KeyDerivationContext).includes(context);
}

export async function deriveArgon2id(
  passwordBytes: Uint8Array,
  salt: Uint8Array,
  parameters: Argon2idParameters,
): Promise<Uint8Array> {
  if (!(passwordBytes instanceof Uint8Array) || passwordBytes.length === 0) {
    invalidInput();
  }
  assertByteLength('salt', salt, SALT_BYTES);
  if (
    !Number.isSafeInteger(parameters.memoryLimit) ||
    !Number.isSafeInteger(parameters.operationsLimit) ||
    !Number.isSafeInteger(parameters.outputLength) ||
    parameters.memoryLimit <= 0 ||
    parameters.operationsLimit <= 0 ||
    parameters.outputLength <= 0
  ) {
    invalidInput();
  }

  try {
    const crypto = await getSodium();
    const result = crypto.crypto_pwhash(
      parameters.outputLength,
      passwordBytes,
      salt,
      parameters.operationsLimit,
      parameters.memoryLimit,
      crypto.crypto_pwhash_ALG_ARGON2ID13,
    );
    return new Uint8Array(result);
  } catch (error) {
    if (isCryptoError(error)) {
      throw error;
    }
    throw new CryptoError('CRYPTO_OPERATION_FAILED');
  }
}

export async function hkdfSha256(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  outputLength: number,
): Promise<Uint8Array> {
  if (
    !(inputKeyMaterial instanceof Uint8Array) ||
    inputKeyMaterial.length === 0 ||
    !(salt instanceof Uint8Array) ||
    !(info instanceof Uint8Array) ||
    !Number.isSafeInteger(outputLength) ||
    outputLength <= 0 ||
    outputLength > 255 * 32
  ) {
    invalidInput();
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new CryptoError('CRYPTO_INITIALIZATION_FAILED');
  }

  try {
    const key = await subtle.importKey(
      'raw',
      inputKeyMaterial,
      'HKDF',
      false,
      ['deriveBits'],
    );
    const bits = await subtle.deriveBits(
      { hash: 'SHA-256', info, name: 'HKDF', salt },
      key,
      outputLength * 8,
    );
    return new Uint8Array(bits);
  } catch (error) {
    if (isCryptoError(error)) {
      throw error;
    }
    throw new CryptoError('CRYPTO_OPERATION_FAILED');
  }
}

export async function derivePasswordWrappingKey(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  if (typeof password !== 'string' || password.length === 0) {
    invalidInput();
  }
  assertByteLength('salt', salt, SALT_BYTES);

  const passwordBytes = encodeUtf8(password);
  let passwordMaterial: Uint8Array | undefined;

  try {
    passwordMaterial = await deriveArgon2id(passwordBytes, salt, {
      memoryLimit: ARGON2_MEMLIMIT,
      operationsLimit: ARGON2_OPSLIMIT,
      outputLength: ARGON2_OUTPUT_BYTES,
    });
    return await hkdfSha256(
      passwordMaterial,
      new Uint8Array(),
      encodeUtf8(KeyDerivationContext.PASSWORD_WRAPPING_KEY),
      KEY_BYTES,
    );
  } finally {
    wipeBytes(passwordBytes);
    if (passwordMaterial) {
      wipeBytes(passwordMaterial);
    }
  }
}

export async function deriveSubkey(
  sourceKey: Uint8Array,
  context: KeyDerivationContext,
): Promise<Uint8Array> {
  assertByteLength('source key', sourceKey, KEY_BYTES);
  if (!isApprovedContext(context)) {
    invalidInput();
  }

  return hkdfSha256(
    sourceKey,
    new Uint8Array(),
    encodeUtf8(context),
    KEY_BYTES,
  );
}
