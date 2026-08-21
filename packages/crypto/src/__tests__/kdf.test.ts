import {
  deriveArgon2id,
  derivePasswordWrappingKey,
  deriveSubkey,
  hkdfSha256,
} from '../kdf';
import {
  KEY_BYTES,
  KeyDerivationContext,
  NONCE_BYTES,
  SALT_BYTES,
} from '../parameters';
import {
  generateDatabaseKey,
  generateNonce,
  generateSalt,
  generateVaultKey,
} from '../random';

function fromHex(value: string): Uint8Array {
  return new Uint8Array(
    value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

describe('key derivation', () => {
  test('matches the libsodium Argon2id known answer', async () => {
    const result = await deriveArgon2id(
      new TextEncoder().encode('correct horse battery staple'),
      fromHex('808182838485868788898a8b8c8d8e8f'),
      { memoryLimit: 64 * 1024 * 1024, operationsLimit: 2, outputLength: 16 },
    );

    expect(toHex(result)).toBe('720f95400220748a811bca9b8cff5d6e');
  });

  test('matches RFC 5869 SHA-256 test case 1', async () => {
    const result = await hkdfSha256(
      fromHex('0b'.repeat(22)),
      fromHex('000102030405060708090a0b0c'),
      fromHex('f0f1f2f3f4f5f6f7f8f9'),
      42,
    );

    expect(toHex(result)).toBe(
      '3cb25f25faacd57a90434f64d0362f2a' +
        '2d2d0a90cf1a5a4c5db02d56ecc4c5bf' +
        '34007208d5b887185865',
    );
  });

  test('derives a production password wrapping key', async () => {
    const key = await derivePasswordWrappingKey(
      'correct horse battery staple ✅',
      fromHex('808182838485868788898a8b8c8d8e8f'),
    );

    expect(key).toHaveLength(KEY_BYTES);
  });

  test.each([
    ['', new Uint8Array(SALT_BYTES)],
    ['password', new Uint8Array(SALT_BYTES - 1)],
  ])('rejects invalid password derivation input', async (password, salt) => {
    await expect(
      derivePasswordWrappingKey(password, salt),
    ).rejects.toMatchObject({ code: 'INVALID_CRYPTO_INPUT' });
  });

  test('isolates approved subkey domains', async () => {
    const sourceKey = fromHex('01'.repeat(KEY_BYTES));

    const passwordKey = await deriveSubkey(
      sourceKey,
      KeyDerivationContext.PASSWORD_WRAPPING_KEY,
    );
    const thumbnailKey = await deriveSubkey(
      sourceKey,
      KeyDerivationContext.ATTACHMENT_THUMBNAIL_KEY,
    );

    expect(passwordKey).toHaveLength(KEY_BYTES);
    expect(thumbnailKey).toHaveLength(KEY_BYTES);
    expect(passwordKey).not.toEqual(thumbnailKey);
  });

  test('rejects invalid subkey sources and unapproved contexts', async () => {
    await expect(
      deriveSubkey(
        new Uint8Array(KEY_BYTES - 1),
        KeyDerivationContext.PASSWORD_WRAPPING_KEY,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CRYPTO_INPUT' });

    await expect(
      deriveSubkey(
        new Uint8Array(KEY_BYTES),
        'notera/unapproved/v1' as KeyDerivationContext,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CRYPTO_INPUT' });
  });

  test('generates independent fixed-length random values', async () => {
    const [saltA, saltB, nonceA, nonceB, databaseKey, vaultKey] =
      await Promise.all([
        generateSalt(),
        generateSalt(),
        generateNonce(),
        generateNonce(),
        generateDatabaseKey(),
        generateVaultKey(),
      ]);

    expect(saltA).toHaveLength(SALT_BYTES);
    expect(saltB).toHaveLength(SALT_BYTES);
    expect(saltA).not.toEqual(saltB);
    expect(nonceA).toHaveLength(NONCE_BYTES);
    expect(nonceB).toHaveLength(NONCE_BYTES);
    expect(nonceA).not.toEqual(nonceB);
    expect(databaseKey).toHaveLength(KEY_BYTES);
    expect(vaultKey).toHaveLength(KEY_BYTES);
    expect(databaseKey).not.toEqual(vaultKey);
  });
});
