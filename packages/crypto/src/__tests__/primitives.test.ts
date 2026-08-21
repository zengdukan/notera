import * as publicApi from '../index';
import {
  assertByteLength,
  copyBytes,
  decodeBase64,
  encodeBase64,
  encodeUtf8,
  wipeBytes,
} from '../bytes';
import { CryptoError } from '../errors';
import {
  ARGON2_MEMLIMIT,
  ARGON2_OPSLIMIT,
  ARGON2_OUTPUT_BYTES,
  AUTH_TAG_BYTES,
  CRYPTO_FORMAT_VERSION,
  KDF_VERSION,
  KEY_BYTES,
  KeyDerivationContext,
  KeyWrapPurpose,
  NONCE_BYTES,
  SALT_BYTES,
} from '../parameters';
import { initializeSodium } from '../sodium';

describe('crypto primitives', () => {
  test('exposes stable crypto errors', () => {
    const error = new CryptoError('INVALID_CRYPTO_INPUT');

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INVALID_CRYPTO_INPUT');
    expect(error.message).toBe('Invalid crypto input');
  });

  test('maps sodium initialization failures without leaking the cause', async () => {
    const initialization = initializeSodium(
      Promise.reject(new Error('sensitive native failure')),
    );

    await expect(initialization).rejects.toMatchObject({
      code: 'CRYPTO_INITIALIZATION_FAILED',
      message: 'Crypto initialization failed',
    });
    await expect(initialization).rejects.not.toThrow('sensitive native failure');
  });

  test('copies bytes and validates exact lengths', () => {
    const source = new Uint8Array([1, 2, 3]);
    const copied = copyBytes(source);

    source[0] = 9;
    expect(copied).toEqual(new Uint8Array([1, 2, 3]));
    expect(() => assertByteLength('key', copied, 3)).not.toThrow();
    expect(() => assertByteLength('key', copied, 2)).toThrow(
      expect.objectContaining({ code: 'INVALID_CRYPTO_INPUT' }),
    );
  });

  test('encodes UTF-8 without normalizing input', () => {
    expect(encodeUtf8('é')).not.toEqual(encodeUtf8('e\u0301'));
    expect(encodeUtf8(' 密码 ')).toEqual(
      new TextEncoder().encode(' 密码 '),
    );
  });

  test('round-trips canonical RFC 4648 Base64', async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 42]);
    const encoded = await encodeBase64(bytes);

    expect(encoded).toBe('AAEC/f7/Kg==');
    await expect(decodeBase64(encoded)).resolves.toEqual(bytes);
  });

  test.each(['AAEC_f7_Kg==', 'AAEC/f7/Kg', 'AAEC/f7/Kg===', 'AAE!']) (
    'rejects non-canonical Base64 %s',
    async (value) => {
      await expect(decodeBase64(value)).rejects.toMatchObject({
        code: 'INVALID_CRYPTO_INPUT',
      });
    },
  );

  test('wipes caller-owned byte arrays', () => {
    const secret = new Uint8Array([1, 2, 3, 4]);

    wipeBytes(secret);

    expect(secret).toEqual(new Uint8Array(4));
  });

  test('fixes algorithm versions, sizes, purposes, and domains', () => {
    expect({
      CRYPTO_FORMAT_VERSION,
      KDF_VERSION,
      SALT_BYTES,
      KEY_BYTES,
      NONCE_BYTES,
      AUTH_TAG_BYTES,
      ARGON2_OUTPUT_BYTES,
      ARGON2_OPSLIMIT,
      ARGON2_MEMLIMIT,
    }).toEqual({
      CRYPTO_FORMAT_VERSION: 1,
      KDF_VERSION: 1,
      SALT_BYTES: 16,
      KEY_BYTES: 32,
      NONCE_BYTES: 24,
      AUTH_TAG_BYTES: 16,
      ARGON2_OUTPUT_BYTES: 64,
      ARGON2_OPSLIMIT: 3,
      ARGON2_MEMLIMIT: 64 * 1024 * 1024,
    });
    expect(KeyWrapPurpose).toMatchObject({
      DATABASE_KEY: 1,
      VAULT_KEY: 2,
      ATTACHMENT_FILE_KEY: 3,
    });
    expect(KeyDerivationContext).toEqual({
      PASSWORD_WRAPPING_KEY: 'notera/password-wrapping-key/v1',
      ATTACHMENT_THUMBNAIL_KEY: 'notera/attachment-thumbnail-key/v1',
    });
  });

  test('does not expose sodium or parameter override APIs', () => {
    expect('getSodium' in publicApi).toBe(false);
    expect('initializeSodium' in publicApi).toBe(false);
    expect('deriveArgon2id' in publicApi).toBe(false);
  });
});
