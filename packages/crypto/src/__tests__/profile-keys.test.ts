import { decodeBase64 } from '../bytes';
import * as keyWrapping from '../key-wrapping';
import {
  changeProfilePassword,
  createProfileKeyPackage,
  unlockProfileKeyPackage,
} from '../profile-keys';
import { KEY_BYTES, NONCE_BYTES, SALT_BYTES } from '../parameters';
import * as random from '../random';

const profileId = '018f5f46-43ca-7c86-9912-ec42bde8c553';
const password = 'correct horse battery staple ✅';

describe('profile key packages', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creates a versioned package with independent keys and nonces', async () => {
    const result = await createProfileKeyPackage(password, profileId);

    expect(result.keyPackage).toMatchObject({ version: 1, kdfVersion: 1 });
    await expect(decodeBase64(result.keyPackage.salt)).resolves.toHaveLength(
      SALT_BYTES,
    );
    await expect(
      decodeBase64(result.keyPackage.wrappedDatabaseKey.nonce),
    ).resolves.toHaveLength(NONCE_BYTES);
    await expect(
      decodeBase64(result.keyPackage.wrappedVaultKey.nonce),
    ).resolves.toHaveLength(NONCE_BYTES);
    expect(result.databaseKey).toHaveLength(KEY_BYTES);
    expect(result.vaultKey).toHaveLength(KEY_BYTES);
    expect(result.databaseKey).not.toEqual(result.vaultKey);
    expect(result.keyPackage.wrappedDatabaseKey.nonce).not.toBe(
      result.keyPackage.wrappedVaultKey.nonce,
    );
    expect(result.keyPackage).not.toHaveProperty('password');
    expect(result.keyPackage).not.toHaveProperty('passwordWrappingKey');
    expect(Object.isFrozen(result.keyPackage)).toBe(true);
  });

  test('unlocks both original profile keys', async () => {
    const created = await createProfileKeyPackage(password, profileId);

    const unlocked = await unlockProfileKeyPackage(
      password,
      profileId,
      created.keyPackage,
    );

    expect(unlocked.databaseKey).toEqual(created.databaseKey);
    expect(unlocked.vaultKey).toEqual(created.vaultKey);
  });

  test.each([
    ['wrong password', 'wrong password', profileId],
    ['wrong profile', password, '018f5f46-43ca-7c86-9912-ec42bde8c554'],
  ])(
    'rejects %s without returning partial keys',
    async (_name, input, context) => {
      const created = await createProfileKeyPackage(password, profileId);

      await expect(
        unlockProfileKeyPackage(input, context, created.keyPackage),
      ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    },
  );

  test('rejects swapped database and vault envelopes', async () => {
    const created = await createProfileKeyPackage(password, profileId);
    const swapped = {
      ...created.keyPackage,
      wrappedDatabaseKey: created.keyPackage.wrappedVaultKey,
      wrappedVaultKey: created.keyPackage.wrappedDatabaseKey,
    };

    await expect(
      unlockProfileKeyPackage(password, profileId, swapped),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  test('rejects a complete package copied to another profile', async () => {
    const created = await createProfileKeyPackage(password, profileId);

    await expect(
      unlockProfileKeyPackage(
        password,
        '018f5f46-43ca-7c86-9912-ec42bde8c555',
        structuredClone(created.keyPackage),
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  test('changes only password protection and preserves both profile keys', async () => {
    const created = await createProfileKeyPackage(password, profileId);
    const newPassword = 'a new and different master password 🔐';

    const changedPackage = await changeProfilePassword(
      password,
      newPassword,
      profileId,
      created.keyPackage,
    );
    const unlocked = await unlockProfileKeyPackage(
      newPassword,
      profileId,
      changedPackage,
    );

    expect(unlocked.databaseKey).toEqual(created.databaseKey);
    expect(unlocked.vaultKey).toEqual(created.vaultKey);
    expect(changedPackage.salt).not.toBe(created.keyPackage.salt);
    expect(changedPackage.wrappedDatabaseKey.nonce).not.toBe(
      created.keyPackage.wrappedDatabaseKey.nonce,
    );
    expect(changedPackage.wrappedVaultKey.nonce).not.toBe(
      created.keyPackage.wrappedVaultKey.nonce,
    );
    await expect(
      unlockProfileKeyPackage(password, profileId, changedPackage),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  test('does not mutate the original package when password change fails', async () => {
    const created = await createProfileKeyPackage(password, profileId);
    const original = structuredClone(created.keyPackage);

    await expect(
      changeProfilePassword(
        'wrong password',
        'new password',
        profileId,
        created.keyPackage,
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    expect(created.keyPackage).toEqual(original);
  });

  test('wipes unlocked keys when new salt generation fails', async () => {
    const created = await createProfileKeyPackage(password, profileId);
    const unwrappedKeys: Uint8Array[] = [];
    const { unwrapKey } = keyWrapping;
    jest.spyOn(keyWrapping, 'unwrapKey').mockImplementation(async (...args) => {
      const key = await unwrapKey(...args);
      unwrappedKeys.push(key);
      return key;
    });
    jest
      .spyOn(random, 'generateSalt')
      .mockRejectedValueOnce(new Error('random source failed'));

    await expect(
      changeProfilePassword(
        password,
        'new password',
        profileId,
        created.keyPackage,
      ),
    ).rejects.toThrow('random source failed');

    expect(unwrappedKeys).toHaveLength(2);
    unwrappedKeys.forEach((key) => {
      expect(key).toEqual(new Uint8Array(KEY_BYTES));
    });
  });

  test('wipes a generated database key when vault key generation fails', async () => {
    const databaseKey = new Uint8Array(KEY_BYTES).fill(7);
    jest
      .spyOn(random, 'generateDatabaseKey')
      .mockResolvedValueOnce(databaseKey);
    jest
      .spyOn(random, 'generateVaultKey')
      .mockRejectedValueOnce(new Error('random source failed'));

    await expect(createProfileKeyPackage(password, profileId)).rejects.toThrow(
      'random source failed',
    );
    expect(databaseKey).toEqual(new Uint8Array(KEY_BYTES));
  });

  test.each([
    ['', profileId, {}],
    [password, '', {}],
    [password, profileId, { version: 2 }],
    [password, profileId, { version: 1, kdfVersion: 2 }],
    [
      password,
      profileId,
      {
        version: 1,
        kdfVersion: 1,
        salt: Buffer.alloc(SALT_BYTES).toString('base64'),
        wrappedDatabaseKey: {},
      },
    ],
    [
      password,
      profileId,
      {
        version: 1,
        kdfVersion: 1,
        salt: Buffer.alloc(SALT_BYTES).toString('base64'),
        wrappedDatabaseKey: {},
        wrappedVaultKey: {},
        unexpected: true,
      },
    ],
  ])(
    'rejects invalid profile package input',
    async (input, context, keyPackage) => {
      await expect(
        unlockProfileKeyPackage(input, context, keyPackage),
      ).rejects.toMatchObject({
        code:
          (keyPackage as { version?: number; kdfVersion?: number }).version ===
            2 ||
          (keyPackage as { version?: number; kdfVersion?: number })
            .kdfVersion === 2
            ? 'UNSUPPORTED_CRYPTO_VERSION'
            : 'INVALID_CRYPTO_INPUT',
      });
    },
  );
});
