import { CryptoError, isCryptoError } from './errors';
import { KEY_BYTES, NONCE_BYTES, SALT_BYTES } from './parameters';
import { getSodium } from './sodium';

async function generateRandomBytes(length: number): Promise<Uint8Array> {
  try {
    const crypto = await getSodium();
    return new Uint8Array(crypto.randombytes_buf(length));
  } catch (error) {
    if (isCryptoError(error)) {
      throw error;
    }
    throw new CryptoError('CRYPTO_OPERATION_FAILED');
  }
}

export async function generateSalt(): Promise<Uint8Array> {
  return generateRandomBytes(SALT_BYTES);
}

export async function generateNonce(): Promise<Uint8Array> {
  return generateRandomBytes(NONCE_BYTES);
}

export async function generateDatabaseKey(): Promise<Uint8Array> {
  return generateRandomBytes(KEY_BYTES);
}

export async function generateVaultKey(): Promise<Uint8Array> {
  return generateRandomBytes(KEY_BYTES);
}
