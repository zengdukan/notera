import { assertByteLength } from './bytes';
import { CryptoError, isCryptoError } from './errors';
import { AUTH_TAG_BYTES, KEY_BYTES, NONCE_BYTES } from './parameters';
import { getSodium } from './sodium';

function assertBytes(value: Uint8Array): void {
  if (!(value instanceof Uint8Array)) {
    throw new CryptoError('INVALID_CRYPTO_INPUT');
  }
}

export async function encryptAead(
  plaintext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  assertBytes(plaintext);
  assertByteLength('key', key, KEY_BYTES);
  assertByteLength('nonce', nonce, NONCE_BYTES);
  assertBytes(additionalData);

  try {
    const crypto = await getSodium();
    return new Uint8Array(
      crypto.crypto_aead_xchacha20poly1305_ietf_encrypt(
        plaintext,
        additionalData,
        null,
        nonce,
        key,
      ),
    );
  } catch (error) {
    if (isCryptoError(error)) {
      throw error;
    }
    throw new CryptoError('CRYPTO_OPERATION_FAILED');
  }
}

export async function decryptAead(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  assertBytes(ciphertext);
  if (ciphertext.length < AUTH_TAG_BYTES) {
    throw new CryptoError('INVALID_CRYPTO_INPUT');
  }
  assertByteLength('key', key, KEY_BYTES);
  assertByteLength('nonce', nonce, NONCE_BYTES);
  assertBytes(additionalData);

  let crypto;
  try {
    crypto = await getSodium();
  } catch (error) {
    if (isCryptoError(error)) {
      throw error;
    }
    throw new CryptoError('CRYPTO_INITIALIZATION_FAILED');
  }

  try {
    return new Uint8Array(
      crypto.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertext,
        additionalData,
        nonce,
        key,
      ),
    );
  } catch {
    throw new CryptoError('AUTHENTICATION_FAILED');
  }
}
