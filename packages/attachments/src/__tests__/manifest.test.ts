import {
  ATTACHMENT_CHUNK_BYTES,
  CIPHERTEXT_HASH_BYTES,
  MANIFEST_CHUNK_RECORD_BYTES,
  MANIFEST_HEADER_BYTES,
  MAX_ATTACHMENT_BYTES,
} from '../constants';
import { AttachmentStorageError, mapAttachmentError } from '../errors';
import {
  decodeManifest,
  encodeManifestV1,
  type ManifestChunkInput,
} from '../manifest';

const noncePrefix = Uint8Array.from({ length: 16 }, (_value, index) => index);

function chunksFor(plaintextLength: number): ManifestChunkInput[] {
  const chunkCount = Math.max(
    1,
    Math.ceil(plaintextLength / ATTACHMENT_CHUNK_BYTES),
  );
  return Array.from({ length: chunkCount }, (_value, index) => {
    const plaintextOffset = index * ATTACHMENT_CHUNK_BYTES;
    const length = Math.min(
      ATTACHMENT_CHUNK_BYTES,
      Math.max(0, plaintextLength - plaintextOffset),
    );
    return {
      plaintextLength: length,
      ciphertextLength: length + 16,
      ciphertextSha256: new Uint8Array(CIPHERTEXT_HASH_BYTES).fill(index + 1),
    };
  });
}

function encodedFor(plaintextLength: number): Uint8Array {
  return encodeManifestV1({
    noncePrefix,
    plaintextLength,
    chunks: chunksFor(plaintextLength),
  });
}

describe('attachment manifest v1', () => {
  test.each([
    0,
    1,
    ATTACHMENT_CHUNK_BYTES,
    ATTACHMENT_CHUNK_BYTES + 1,
    100 * 1024 * 1024,
  ])('round-trips offsets for %i plaintext bytes', (plaintextLength) => {
    const encoded = encodedFor(plaintextLength);
    const manifest = decodeManifest(encoded);
    const expectedCount = Math.max(
      1,
      Math.ceil(plaintextLength / ATTACHMENT_CHUNK_BYTES),
    );

    expect(encoded).toHaveLength(
      MANIFEST_HEADER_BYTES + expectedCount * MANIFEST_CHUNK_RECORD_BYTES,
    );
    expect(manifest).toMatchObject({
      version: 1,
      chunkSize: ATTACHMENT_CHUNK_BYTES,
      plaintextLength,
    });
    expect(manifest.chunks).toHaveLength(expectedCount);
    expect(manifest.ciphertextLength).toBe(
      manifest.chunks.reduce(
        (total, chunk) => total + chunk.ciphertextLength,
        0,
      ),
    );
    manifest.chunks.forEach((chunk, index) => {
      expect(chunk.index).toBe(index);
      expect(chunk.plaintextOffset).toBe(index * ATTACHMENT_CHUNK_BYTES);
      expect(chunk.ciphertextOffset).toBe(
        manifest.chunks
          .slice(0, index)
          .reduce((total, item) => total + item.ciphertextLength, 0),
      );
    });
  });

  test('uses a deterministic big-endian byte layout', () => {
    const encoded = encodedFor(0);

    expect(Buffer.from(encoded).toString('hex')).toBe(
      [
        '4e54414d',
        '0001',
        '00500000',
        '000102030405060708090a0b0c0d0e0f',
        '0000000000000000',
        '00000001',
        '00000000',
        '00000010',
        '01'.repeat(32),
      ].join(''),
    );
    expect(encodedFor(0)).toEqual(encoded);
  });

  test('copies inputs and freezes parsed object shells', () => {
    const encoded = encodedFor(1);
    const manifest = decodeManifest(encoded);
    const originalNonce = Uint8Array.from(manifest.noncePrefix);
    const originalHash = Uint8Array.from(manifest.chunks[0].ciphertextSha256);
    encoded.fill(0);

    expect(manifest.noncePrefix).toEqual(originalNonce);
    expect(manifest.chunks[0].ciphertextSha256).toEqual(originalHash);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.chunks)).toBe(true);
    expect(Object.isFrozen(manifest.chunks[0])).toBe(true);
  });

  test('rejects an unsupported version before structural parsing', () => {
    const encoded = encodedFor(0);
    new DataView(encoded.buffer).setUint16(4, 2, false);

    expect(() => decodeManifest(encoded)).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_MANIFEST_VERSION' }),
    );
  });

  test.each([
    [
      'magic',
      (bytes: Uint8Array) => {
        bytes[0] ^= 1;
      },
    ],
    [
      'chunk size',
      (bytes: Uint8Array) =>
        new DataView(bytes.buffer).setUint32(6, ATTACHMENT_CHUNK_BYTES - 1),
    ],
    [
      'chunk count',
      (bytes: Uint8Array) => new DataView(bytes.buffer).setUint32(34, 2),
    ],
    [
      'plaintext length',
      (bytes: Uint8Array) => new DataView(bytes.buffer).setUint32(38, 1),
    ],
    [
      'ciphertext length',
      (bytes: Uint8Array) => new DataView(bytes.buffer).setUint32(42, 15),
    ],
  ])('rejects corrupt %s fields', (_name, mutate) => {
    const encoded = encodedFor(0);
    mutate(encoded);

    expect(() => decodeManifest(encoded)).toThrow(
      expect.objectContaining({ code: 'MANIFEST_CORRUPT' }),
    );
  });

  test('rejects truncation, trailing bytes, and oversized totals', () => {
    const encoded = encodedFor(0);
    const trailing = new Uint8Array(encoded.length + 1);
    trailing.set(encoded);
    const oversized = Uint8Array.from(encoded);
    new DataView(oversized.buffer).setBigUint64(
      26,
      BigInt(MAX_ATTACHMENT_BYTES + 1),
      false,
    );

    expect(() =>
      decodeManifest(encoded.subarray(0, encoded.length - 1)),
    ).toThrow(expect.objectContaining({ code: 'MANIFEST_CORRUPT' }));
    expect(() => decodeManifest(trailing)).toThrow(
      expect.objectContaining({ code: 'MANIFEST_CORRUPT' }),
    );
    expect(() => decodeManifest(oversized)).toThrow(
      expect.objectContaining({ code: 'MANIFEST_CORRUPT' }),
    );
  });

  test('rejects invalid encoder inputs', () => {
    expect(() =>
      encodeManifestV1({
        noncePrefix: noncePrefix.subarray(1),
        plaintextLength: 0,
        chunks: chunksFor(0),
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ATTACHMENT_INPUT' }));
    expect(() =>
      encodeManifestV1({
        noncePrefix,
        plaintextLength: MAX_ATTACHMENT_BYTES + 1,
        chunks: chunksFor(0),
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ATTACHMENT_INPUT' }));
    expect(() =>
      encodeManifestV1({
        noncePrefix,
        plaintextLength: 0,
        chunks: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ATTACHMENT_INPUT' }));
    expect(() =>
      encodeManifestV1({
        noncePrefix,
        plaintextLength: 0,
        chunks: [
          {
            ...chunksFor(0)[0],
            ciphertextSha256: new Uint8Array(CIPHERTEXT_HASH_BYTES - 1),
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ATTACHMENT_INPUT' }));
  });
});

describe('attachment storage errors', () => {
  test('exposes stable safe messages', () => {
    const error = new AttachmentStorageError('MANIFEST_CORRUPT');

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('MANIFEST_CORRUPT');
    expect(error.message).toBe('The attachment manifest is corrupt.');
  });

  test.each([
    [new DOMException('sensitive abort', 'AbortError'), 'OPERATION_ABORTED'],
    [{ code: 'ENOSPC', message: 'sensitive path' }, 'DISK_FULL'],
    [new Error('sensitive native failure'), 'ATTACHMENT_IO_FAILED'],
  ])('maps native failures without leaking details', (cause, code) => {
    const mapped = mapAttachmentError(cause);

    expect(mapped.code).toBe(code);
    expect(mapped.message).not.toContain('sensitive');
  });

  test('preserves an existing stable attachment error', () => {
    const original = new AttachmentStorageError('BLOB_MISSING');

    expect(mapAttachmentError(original)).toBe(original);
  });
});
