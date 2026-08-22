import { ATTACHMENT_NONCE_PREFIX_BYTES, AUTH_TAG_BYTES } from '@notera/crypto';
import {
  ATTACHMENT_CHUNK_BYTES,
  ATTACHMENT_MANIFEST_VERSION,
  CIPHERTEXT_HASH_BYTES,
  MANIFEST_CHUNK_RECORD_BYTES,
  MANIFEST_HEADER_BYTES,
  MANIFEST_MAGIC,
  MAX_ATTACHMENT_BYTES,
} from './constants';
import { AttachmentStorageError } from './errors';
import type { AttachmentManifestChunk, AttachmentManifestV1 } from './types';

export interface ManifestChunkInput {
  readonly plaintextLength: number;
  readonly ciphertextLength: number;
  readonly ciphertextSha256: Uint8Array;
}

interface ManifestInput {
  readonly noncePrefix: Uint8Array;
  readonly plaintextLength: number;
  readonly chunks: readonly ManifestChunkInput[];
}

const MAX_MANIFEST_BYTES =
  MANIFEST_HEADER_BYTES +
  Math.ceil(MAX_ATTACHMENT_BYTES / ATTACHMENT_CHUNK_BYTES) *
    MANIFEST_CHUNK_RECORD_BYTES;

function invalidInput(): never {
  throw new AttachmentStorageError('INVALID_ATTACHMENT_INPUT');
}

function corrupt(): never {
  throw new AttachmentStorageError('MANIFEST_CORRUPT');
}

function expectedChunkCount(plaintextLength: number): number {
  return Math.max(1, Math.ceil(plaintextLength / ATTACHMENT_CHUNK_BYTES));
}

function expectedPlaintextLength(
  totalLength: number,
  index: number,
  chunkCount: number,
): number {
  if (index < chunkCount - 1) {
    return ATTACHMENT_CHUNK_BYTES;
  }
  return totalLength - (chunkCount - 1) * ATTACHMENT_CHUNK_BYTES;
}

function validSafeLength(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function validateInput(input: ManifestInput): void {
  if (
    typeof input !== 'object' ||
    input === null ||
    !(input.noncePrefix instanceof Uint8Array) ||
    input.noncePrefix.byteLength !== ATTACHMENT_NONCE_PREFIX_BYTES ||
    !validSafeLength(input.plaintextLength, MAX_ATTACHMENT_BYTES) ||
    !Array.isArray(input.chunks)
  ) {
    invalidInput();
  }
  const chunkCount = expectedChunkCount(input.plaintextLength);
  if (input.chunks.length !== chunkCount) {
    invalidInput();
  }
  input.chunks.forEach((chunk, index) => {
    const plaintextLength = expectedPlaintextLength(
      input.plaintextLength,
      index,
      chunkCount,
    );
    if (
      typeof chunk !== 'object' ||
      chunk === null ||
      chunk.plaintextLength !== plaintextLength ||
      chunk.ciphertextLength !== plaintextLength + AUTH_TAG_BYTES ||
      !(chunk.ciphertextSha256 instanceof Uint8Array) ||
      chunk.ciphertextSha256.byteLength !== CIPHERTEXT_HASH_BYTES
    ) {
      invalidInput();
    }
  });
}

export function encodeManifestV1(input: ManifestInput): Uint8Array {
  validateInput(input);
  const result = new Uint8Array(
    MANIFEST_HEADER_BYTES + input.chunks.length * MANIFEST_CHUNK_RECORD_BYTES,
  );
  const view = new DataView(result.buffer);
  result.set(MANIFEST_MAGIC, 0);
  view.setUint16(4, ATTACHMENT_MANIFEST_VERSION, false);
  view.setUint32(6, ATTACHMENT_CHUNK_BYTES, false);
  result.set(input.noncePrefix, 10);
  view.setBigUint64(26, BigInt(input.plaintextLength), false);
  view.setUint32(34, input.chunks.length, false);
  let offset = MANIFEST_HEADER_BYTES;
  input.chunks.forEach((chunk) => {
    view.setUint32(offset, chunk.plaintextLength, false);
    view.setUint32(offset + 4, chunk.ciphertextLength, false);
    result.set(chunk.ciphertextSha256, offset + 8);
    offset += MANIFEST_CHUNK_RECORD_BYTES;
  });
  return result;
}

function hasMagic(bytes: Uint8Array): boolean {
  return MANIFEST_MAGIC.every((value, index) => bytes[index] === value);
}

export function decodeManifest(bytes: Uint8Array): AttachmentManifestV1 {
  if (!(bytes instanceof Uint8Array)) {
    return invalidInput();
  }
  if (
    bytes.byteLength < 6 ||
    bytes.byteLength > MAX_MANIFEST_BYTES ||
    !hasMagic(bytes)
  ) {
    return corrupt();
  }
  const source = Uint8Array.from(bytes);
  const view = new DataView(
    source.buffer,
    source.byteOffset,
    source.byteLength,
  );
  const version = view.getUint16(4, false);
  if (version !== ATTACHMENT_MANIFEST_VERSION) {
    throw new AttachmentStorageError('UNSUPPORTED_MANIFEST_VERSION');
  }
  if (source.byteLength < MANIFEST_HEADER_BYTES) {
    return corrupt();
  }
  if (view.getUint32(6, false) !== ATTACHMENT_CHUNK_BYTES) {
    return corrupt();
  }
  const totalBigInt = view.getBigUint64(26, false);
  if (totalBigInt > BigInt(MAX_ATTACHMENT_BYTES)) {
    return corrupt();
  }
  const plaintextLength = Number(totalBigInt);
  const chunkCount = view.getUint32(34, false);
  if (
    chunkCount !== expectedChunkCount(plaintextLength) ||
    source.byteLength !==
      MANIFEST_HEADER_BYTES + chunkCount * MANIFEST_CHUNK_RECORD_BYTES
  ) {
    return corrupt();
  }

  const chunks: AttachmentManifestChunk[] = [];
  let plaintextOffset = 0;
  let ciphertextOffset = 0;
  let recordOffset = MANIFEST_HEADER_BYTES;
  for (let index = 0; index < chunkCount; index += 1) {
    const chunkPlaintextLength = view.getUint32(recordOffset, false);
    const ciphertextLength = view.getUint32(recordOffset + 4, false);
    const expectedLength = expectedPlaintextLength(
      plaintextLength,
      index,
      chunkCount,
    );
    if (
      chunkPlaintextLength !== expectedLength ||
      ciphertextLength !== chunkPlaintextLength + AUTH_TAG_BYTES
    ) {
      return corrupt();
    }
    const ciphertextSha256 = source.slice(
      recordOffset + 8,
      recordOffset + 8 + CIPHERTEXT_HASH_BYTES,
    );
    chunks.push(
      Object.freeze({
        index,
        plaintextOffset,
        ciphertextOffset,
        plaintextLength: chunkPlaintextLength,
        ciphertextLength,
        ciphertextSha256,
      }),
    );
    plaintextOffset += chunkPlaintextLength;
    ciphertextOffset += ciphertextLength;
    recordOffset += MANIFEST_CHUNK_RECORD_BYTES;
  }
  if (plaintextOffset !== plaintextLength) {
    return corrupt();
  }
  return Object.freeze({
    version: ATTACHMENT_MANIFEST_VERSION,
    chunkSize: ATTACHMENT_CHUNK_BYTES,
    noncePrefix: source.slice(10, 26),
    plaintextLength,
    ciphertextLength: ciphertextOffset,
    chunks: Object.freeze(chunks),
  });
}
