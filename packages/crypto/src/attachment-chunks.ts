import { decryptAead, encryptAead } from './aead';
import { assertByteLength, encodeUtf8 } from './bytes';
import { CryptoError } from './errors';
import {
  ATTACHMENT_FORMAT_VERSION,
  ATTACHMENT_NONCE_PREFIX_BYTES,
  AUTH_TAG_BYTES,
  KEY_BYTES,
  NONCE_BYTES,
} from './parameters';

const ATTACHMENT_CHUNK_BYTES = 5 * 1024 * 1024;
const AAD_DOMAIN = encodeUtf8('notera/attachment-chunk');
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface AttachmentChunkContext {
  readonly formatVersion: 1;
  readonly vaultId: string;
  readonly blobId: string;
  readonly chunkIndex: number;
  readonly plaintextLength: number;
}

function invalidInput(): never {
  throw new CryptoError('INVALID_CRYPTO_INPUT');
}

function assertSafeUnsigned(value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    invalidInput();
  }
}

function uuidBytes(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !CANONICAL_UUID.test(value)) {
    return invalidInput();
  }
  const hex = value.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function validateContext(context: AttachmentChunkContext): {
  vaultId: Uint8Array;
  blobId: Uint8Array;
} {
  if (typeof context !== 'object' || context === null) {
    return invalidInput();
  }
  if (context.formatVersion !== ATTACHMENT_FORMAT_VERSION) {
    if (typeof context.formatVersion === 'number') {
      throw new CryptoError('UNSUPPORTED_CRYPTO_VERSION');
    }
    return invalidInput();
  }
  assertSafeUnsigned(context.chunkIndex, Number.MAX_SAFE_INTEGER);
  assertSafeUnsigned(context.plaintextLength, ATTACHMENT_CHUNK_BYTES);
  return {
    vaultId: uuidBytes(context.vaultId),
    blobId: uuidBytes(context.blobId),
  };
}

export function buildAttachmentChunkNonce(
  noncePrefix: Uint8Array,
  chunkIndex: number,
): Uint8Array {
  assertByteLength(
    'attachment nonce prefix',
    noncePrefix,
    ATTACHMENT_NONCE_PREFIX_BYTES,
  );
  assertSafeUnsigned(chunkIndex, Number.MAX_SAFE_INTEGER);
  const nonce = new Uint8Array(NONCE_BYTES);
  nonce.set(noncePrefix, 0);
  new DataView(nonce.buffer).setBigUint64(
    ATTACHMENT_NONCE_PREFIX_BYTES,
    BigInt(chunkIndex),
    false,
  );
  return nonce;
}

export function encodeAttachmentChunkAad(
  context: AttachmentChunkContext,
): Uint8Array {
  const ids = validateContext(context);
  const aad = new Uint8Array(2 + AAD_DOMAIN.length + 2 + 16 + 16 + 8 + 4);
  const view = new DataView(aad.buffer);
  let offset = 0;
  view.setUint16(offset, AAD_DOMAIN.length, false);
  offset += 2;
  aad.set(AAD_DOMAIN, offset);
  offset += AAD_DOMAIN.length;
  view.setUint16(offset, context.formatVersion, false);
  offset += 2;
  aad.set(ids.vaultId, offset);
  offset += ids.vaultId.length;
  aad.set(ids.blobId, offset);
  offset += ids.blobId.length;
  view.setBigUint64(offset, BigInt(context.chunkIndex), false);
  offset += 8;
  view.setUint32(offset, context.plaintextLength, false);
  return aad;
}

export async function encryptAttachmentChunk(
  plaintext: Uint8Array,
  fileKey: Uint8Array,
  noncePrefix: Uint8Array,
  context: AttachmentChunkContext,
): Promise<Uint8Array> {
  assertByteLength('attachment file key', fileKey, KEY_BYTES);
  if (!(plaintext instanceof Uint8Array)) {
    return invalidInput();
  }
  const aad = encodeAttachmentChunkAad(context);
  if (plaintext.byteLength !== context.plaintextLength) {
    return invalidInput();
  }
  const nonce = buildAttachmentChunkNonce(noncePrefix, context.chunkIndex);
  return encryptAead(plaintext, fileKey, nonce, aad);
}

export async function decryptAttachmentChunk(
  ciphertext: Uint8Array,
  fileKey: Uint8Array,
  noncePrefix: Uint8Array,
  context: AttachmentChunkContext,
): Promise<Uint8Array> {
  assertByteLength('attachment file key', fileKey, KEY_BYTES);
  if (
    !(ciphertext instanceof Uint8Array) ||
    ciphertext.byteLength < AUTH_TAG_BYTES ||
    ciphertext.byteLength > ATTACHMENT_CHUNK_BYTES + AUTH_TAG_BYTES
  ) {
    return invalidInput();
  }
  const aad = encodeAttachmentChunkAad(context);
  const nonce = buildAttachmentChunkNonce(noncePrefix, context.chunkIndex);
  const plaintext = await decryptAead(ciphertext, fileKey, nonce, aad);
  if (plaintext.byteLength !== context.plaintextLength) {
    return invalidInput();
  }
  return plaintext;
}
