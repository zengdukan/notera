import { decodeBase64 } from '../bytes';
import { decryptAead, encryptAead } from '../aead';
import {
  encodeKeyWrapAad,
  KeyWrapContext,
  unwrapKey,
  wrapKey,
} from '../key-wrapping';
import { KEY_BYTES, KeyWrapPurpose } from '../parameters';

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

const databaseContext: KeyWrapContext = {
  contextId: 'profile-1',
  purpose: KeyWrapPurpose.DATABASE_KEY,
};

describe('authenticated key wrapping', () => {
  test('matches the libsodium XChaCha20-Poly1305 known answer', async () => {
    const plaintext = fromHex(
      '4c616469657320616e642047656e746c656d656e206f662074686520636c6173' +
        '73206f66202739393a204966204920636f756c64206f6666657220796f75206f' +
        '6e6c79206f6e652074697020666f7220746865206675747572652c2073756e73' +
        '637265656e20776f756c642062652069742e',
    );
    const key = fromHex(
      '808182838485868788898a8b8c8d8e8f' +
        '909192939495969798999a9b9c9d9e9f',
    );
    const nonce = fromHex(
      '404142434445464748494a4b4c4d4e4f5051525354555657',
    );
    const aad = fromHex('50515253c0c1c2c3c4c5c6c7');

    const ciphertext = await encryptAead(plaintext, key, nonce, aad);

    expect(toHex(ciphertext)).toBe(
      'bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb' +
        '731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b452' +
        '2f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9' +
        '21f9664c97637da9768812f615c68b13b52e' +
        'c0875924c1c7987947deafd8780acf49',
    );
    await expect(decryptAead(ciphertext, key, nonce, aad)).resolves.toEqual(
      plaintext,
    );
  });

  test('encodes key-wrap AAD canonically', () => {
    expect(toHex(encodeKeyWrapAad(databaseContext))).toBe(
      '6e6f746572612f6b65792d7772617001010009' +
        '70726f66696c652d31',
    );
  });

  test('wraps and unwraps a 32-byte key', async () => {
    const wrappingKey = fromHex('11'.repeat(KEY_BYTES));
    const keyToWrap = fromHex('22'.repeat(KEY_BYTES));

    const envelope = await wrapKey(wrappingKey, keyToWrap, databaseContext);

    expect(envelope.version).toBe(1);
    await expect(unwrapKey(wrappingKey, envelope, databaseContext)).resolves.toEqual(
      keyToWrap,
    );
  });

  test('uses independent nonces for repeated wrapping', async () => {
    const wrappingKey = fromHex('11'.repeat(KEY_BYTES));
    const keyToWrap = fromHex('22'.repeat(KEY_BYTES));

    const [first, second] = await Promise.all([
      wrapKey(wrappingKey, keyToWrap, databaseContext),
      wrapKey(wrappingKey, keyToWrap, databaseContext),
    ]);

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  test.each([
    ['wrong wrapping key', fromHex('33'.repeat(KEY_BYTES)), databaseContext],
    [
      'wrong profile',
      fromHex('11'.repeat(KEY_BYTES)),
      { ...databaseContext, contextId: 'profile-2' },
    ],
    [
      'wrong purpose',
      fromHex('11'.repeat(KEY_BYTES)),
      { ...databaseContext, purpose: KeyWrapPurpose.VAULT_KEY },
    ],
  ])('rejects authentication with %s', async (_name, key, context) => {
    const envelope = await wrapKey(
      fromHex('11'.repeat(KEY_BYTES)),
      fromHex('22'.repeat(KEY_BYTES)),
      databaseContext,
    );

    await expect(
      unwrapKey(key as Uint8Array, envelope, context as KeyWrapContext),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  test('rejects valid-length nonce and ciphertext tampering', async () => {
    const wrappingKey = fromHex('11'.repeat(KEY_BYTES));
    const envelope = await wrapKey(
      wrappingKey,
      fromHex('22'.repeat(KEY_BYTES)),
      databaseContext,
    );
    const nonce = await decodeBase64(envelope.nonce);
    const ciphertext = await decodeBase64(envelope.ciphertext);
    nonce[0] ^= 1;
    ciphertext[0] ^= 1;
    const encode = (bytes: Uint8Array) =>
      Buffer.from(bytes).toString('base64');

    await expect(
      unwrapKey(
        wrappingKey,
        { ...envelope, nonce: encode(nonce) },
        databaseContext,
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    await expect(
      unwrapKey(
        wrappingKey,
        { ...envelope, ciphertext: encode(ciphertext) },
        databaseContext,
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  test.each([
    { version: 1, nonce: 'invalid', ciphertext: 'AA==' },
    { version: 1, nonce: Buffer.alloc(23).toString('base64'), ciphertext: 'AA==' },
    { version: 1, nonce: Buffer.alloc(24).toString('base64'), ciphertext: 'AA==' },
    { version: 1, nonce: Buffer.alloc(24).toString('base64') },
    {
      version: 1,
      nonce: Buffer.alloc(24).toString('base64'),
      ciphertext: Buffer.alloc(48).toString('base64'),
      unexpected: true,
    },
  ])('rejects malformed envelopes', async (envelope) => {
    await expect(
      unwrapKey(
        fromHex('11'.repeat(KEY_BYTES)),
        envelope,
        databaseContext,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CRYPTO_INPUT' });
  });

  test('rejects unknown envelope versions before authentication', async () => {
    await expect(
      unwrapKey(
        fromHex('11'.repeat(KEY_BYTES)),
        {
          version: 2,
          nonce: Buffer.alloc(24).toString('base64'),
          ciphertext: Buffer.alloc(48).toString('base64'),
        },
        databaseContext,
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CRYPTO_VERSION' });
  });

  test('rejects invalid key lengths and contexts', async () => {
    await expect(
      wrapKey(
        new Uint8Array(KEY_BYTES - 1),
        new Uint8Array(KEY_BYTES),
        databaseContext,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CRYPTO_INPUT' });
    await expect(
      wrapKey(
        new Uint8Array(KEY_BYTES),
        new Uint8Array(KEY_BYTES),
        { ...databaseContext, contextId: '' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CRYPTO_INPUT' });
  });
});
