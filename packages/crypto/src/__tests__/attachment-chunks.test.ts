import {
  buildAttachmentChunkNonce,
  decryptAttachmentChunk,
  encodeAttachmentChunkAad,
  encryptAttachmentChunk,
  type AttachmentChunkContext,
} from '../attachment-chunks';
import {
  ATTACHMENT_FORMAT_VERSION,
  ATTACHMENT_NONCE_PREFIX_BYTES,
  AUTH_TAG_BYTES,
  KEY_BYTES,
} from '../parameters';
import {
  generateAttachmentFileKey,
  generateAttachmentNoncePrefix,
} from '../random';

const vaultId = '01890f47-6abc-7def-8abc-0123456789ab';
const blobId = '123e4567-e89b-12d3-a456-426614174000';

function fromHex(value: string): Uint8Array {
  return new Uint8Array(
    value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
}

function toHex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex');
}

function context(
  overrides: Partial<AttachmentChunkContext> = {},
): AttachmentChunkContext {
  return {
    formatVersion: ATTACHMENT_FORMAT_VERSION,
    vaultId,
    blobId,
    chunkIndex: 2,
    plaintextLength: 3,
    ...overrides,
  };
}

describe('attachment chunk encryption', () => {
  test('encodes the nonce and AAD canonically', () => {
    const prefix = fromHex('000102030405060708090a0b0c0d0e0f');

    expect(toHex(buildAttachmentChunkNonce(prefix, 2))).toBe(
      '000102030405060708090a0b0c0d0e0f0000000000000002',
    );
    expect(
      toHex(
        encodeAttachmentChunkAad(context({ plaintextLength: 1024 * 1024 })),
      ),
    ).toBe(
      [
        '0017',
        '6e6f746572612f6174746163686d656e742d6368756e6b',
        '0001',
        '01890f476abc7def8abc0123456789ab',
        '123e4567e89b12d3a456426614174000',
        '0000000000000002',
        '00100000',
      ].join(''),
    );
  });

  test('generates independent fixed-length attachment secrets', async () => {
    const [fileKeyA, fileKeyB, prefixA, prefixB] = await Promise.all([
      generateAttachmentFileKey(),
      generateAttachmentFileKey(),
      generateAttachmentNoncePrefix(),
      generateAttachmentNoncePrefix(),
    ]);

    expect(fileKeyA).toHaveLength(KEY_BYTES);
    expect(fileKeyB).toHaveLength(KEY_BYTES);
    expect(fileKeyA).not.toEqual(fileKeyB);
    expect(prefixA).toHaveLength(ATTACHMENT_NONCE_PREFIX_BYTES);
    expect(prefixB).toHaveLength(ATTACHMENT_NONCE_PREFIX_BYTES);
    expect(prefixA).not.toEqual(prefixB);
  });

  test.each([0, 3, 5 * 1024 * 1024])(
    'round-trips a %i-byte authenticated chunk',
    async (plaintextLength) => {
      const plaintext = new Uint8Array(plaintextLength).fill(0x5a);
      const fileKey = fromHex('11'.repeat(KEY_BYTES));
      const prefix = fromHex('22'.repeat(ATTACHMENT_NONCE_PREFIX_BYTES));
      const chunkContext = context({ plaintextLength });

      const ciphertext = await encryptAttachmentChunk(
        plaintext,
        fileKey,
        prefix,
        chunkContext,
      );

      expect(ciphertext).toHaveLength(plaintextLength + AUTH_TAG_BYTES);
      await expect(
        decryptAttachmentChunk(ciphertext, fileKey, prefix, chunkContext),
      ).resolves.toEqual(plaintext);
    },
  );

  test.each([
    ['vault id', { vaultId: '01890f47-6abc-7def-8abc-0123456789ac' }],
    ['blob id', { blobId: '123e4567-e89b-12d3-a456-426614174001' }],
    ['chunk index', { chunkIndex: 3 }],
    ['plaintext length', { plaintextLength: 2 }],
  ])('rejects a substituted %s', async (_name, overrides) => {
    const plaintext = new Uint8Array([1, 2, 3]);
    const fileKey = fromHex('11'.repeat(KEY_BYTES));
    const prefix = fromHex('22'.repeat(ATTACHMENT_NONCE_PREFIX_BYTES));
    const ciphertext = await encryptAttachmentChunk(
      plaintext,
      fileKey,
      prefix,
      context(),
    );

    await expect(
      decryptAttachmentChunk(
        ciphertext,
        fileKey,
        prefix,
        context(overrides as Partial<AttachmentChunkContext>),
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  test('rejects substituted nonce, ciphertext, and file key', async () => {
    const plaintext = new Uint8Array([1, 2, 3]);
    const fileKey = fromHex('11'.repeat(KEY_BYTES));
    const prefix = fromHex('22'.repeat(ATTACHMENT_NONCE_PREFIX_BYTES));
    const ciphertext = await encryptAttachmentChunk(
      plaintext,
      fileKey,
      prefix,
      context(),
    );
    const changedPrefix = Uint8Array.from(prefix);
    const changedCiphertext = Uint8Array.from(ciphertext);
    changedPrefix[0] ^= 1;
    changedCiphertext[0] ^= 1;

    await expect(
      decryptAttachmentChunk(ciphertext, fileKey, changedPrefix, context()),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    await expect(
      decryptAttachmentChunk(changedCiphertext, fileKey, prefix, context()),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    await expect(
      decryptAttachmentChunk(
        ciphertext,
        fromHex('33'.repeat(KEY_BYTES)),
        prefix,
        context(),
      ),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  test.each([
    context({ vaultId: vaultId.toUpperCase() }),
    context({ blobId: 'not-a-uuid' }),
    context({ chunkIndex: -1 }),
    context({ chunkIndex: 1.5 }),
    context({ chunkIndex: Number.MAX_SAFE_INTEGER + 1 }),
    context({ plaintextLength: -1 }),
    context({ plaintextLength: 5 * 1024 * 1024 + 1 }),
  ])('rejects invalid attachment contexts', (invalidContext) => {
    expect(() => encodeAttachmentChunkAad(invalidContext)).toThrow(
      expect.objectContaining({ code: 'INVALID_CRYPTO_INPUT' }),
    );
  });

  test('rejects unknown versions and invalid byte lengths', async () => {
    const plaintext = new Uint8Array([1, 2, 3]);
    const fileKey = fromHex('11'.repeat(KEY_BYTES));
    const prefix = fromHex('22'.repeat(ATTACHMENT_NONCE_PREFIX_BYTES));

    await expect(
      encryptAttachmentChunk(
        plaintext,
        fileKey,
        prefix,
        context({ formatVersion: 2 as 1 }),
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CRYPTO_VERSION' });
    await expect(
      encryptAttachmentChunk(plaintext, fileKey.subarray(1), prefix, context()),
    ).rejects.toMatchObject({ code: 'INVALID_CRYPTO_INPUT' });
    await expect(
      encryptAttachmentChunk(plaintext, fileKey, prefix.subarray(1), context()),
    ).rejects.toMatchObject({ code: 'INVALID_CRYPTO_INPUT' });
    await expect(
      encryptAttachmentChunk(
        plaintext,
        fileKey,
        prefix,
        context({ plaintextLength: 2 }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CRYPTO_INPUT' });
  });
});
