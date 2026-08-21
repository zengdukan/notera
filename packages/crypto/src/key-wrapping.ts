import {
  assertByteLength,
  decodeBase64,
  encodeBase64,
  encodeUtf8,
} from './bytes';
import { decryptAead, encryptAead } from './aead';
import { CryptoError } from './errors';
import {
  AUTH_TAG_BYTES,
  CRYPTO_FORMAT_VERSION,
  KEY_BYTES,
  KeyWrapPurpose,
  NONCE_BYTES,
} from './parameters';
import { generateNonce } from './random';

const AAD_MAGIC = encodeUtf8('notera/key-wrap');
const ALLOWED_PURPOSES: ReadonlyArray<KeyWrapPurpose> = [
  KeyWrapPurpose.DATABASE_KEY,
  KeyWrapPurpose.VAULT_KEY,
  KeyWrapPurpose.ATTACHMENT_FILE_KEY,
];

export type WrappedKeyEnvelope = Readonly<{
  version: 1;
  nonce: string;
  ciphertext: string;
}>;

export type KeyWrapContext = Readonly<{
  purpose: KeyWrapPurpose;
  contextId: string;
}>;

function invalidInput(): never {
  throw new CryptoError('INVALID_CRYPTO_INPUT');
}

function validateContext(context: KeyWrapContext): Uint8Array {
  if (
    typeof context !== 'object' ||
    context === null ||
    !ALLOWED_PURPOSES.includes(context.purpose) ||
    typeof context.contextId !== 'string'
  ) {
    invalidInput();
  }

  const contextBytes = encodeUtf8(context.contextId);
  if (contextBytes.length === 0 || contextBytes.length > 65535) {
    invalidInput();
  }
  return contextBytes;
}

export function encodeKeyWrapAad(context: KeyWrapContext): Uint8Array {
  const contextBytes = validateContext(context);
  const result = new Uint8Array(AAD_MAGIC.length + 4 + contextBytes.length);
  result.set(AAD_MAGIC, 0);
  let offset = AAD_MAGIC.length;
  result[offset] = CRYPTO_FORMAT_VERSION;
  offset += 1;
  result[offset] = context.purpose;
  offset += 1;
  new DataView(result.buffer).setUint16(offset, contextBytes.length, false);
  offset += 2;
  result.set(contextBytes, offset);
  return result;
}

function parseEnvelope(value: unknown): WrappedKeyEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalidInput();
  }

  const envelope = value as Record<string, unknown>;
  if (envelope.version !== CRYPTO_FORMAT_VERSION) {
    if (typeof envelope.version === 'number') {
      throw new CryptoError('UNSUPPORTED_CRYPTO_VERSION');
    }
    invalidInput();
  }

  const keys = Object.keys(envelope).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== 'ciphertext' ||
    keys[1] !== 'nonce' ||
    keys[2] !== 'version' ||
    typeof envelope.nonce !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    invalidInput();
  }

  return {
    version: CRYPTO_FORMAT_VERSION,
    nonce: envelope.nonce,
    ciphertext: envelope.ciphertext,
  };
}

export async function wrapKey(
  wrappingKey: Uint8Array,
  keyToWrap: Uint8Array,
  context: KeyWrapContext,
): Promise<WrappedKeyEnvelope> {
  assertByteLength('wrapping key', wrappingKey, KEY_BYTES);
  assertByteLength('key to wrap', keyToWrap, KEY_BYTES);
  const additionalData = encodeKeyWrapAad(context);
  const nonce = await generateNonce();
  const ciphertext = await encryptAead(
    keyToWrap,
    wrappingKey,
    nonce,
    additionalData,
  );

  return Object.freeze({
    version: CRYPTO_FORMAT_VERSION,
    nonce: await encodeBase64(nonce),
    ciphertext: await encodeBase64(ciphertext),
  });
}

export async function unwrapKey(
  wrappingKey: Uint8Array,
  envelopeValue: unknown,
  context: KeyWrapContext,
): Promise<Uint8Array> {
  assertByteLength('wrapping key', wrappingKey, KEY_BYTES);
  const envelope = parseEnvelope(envelopeValue);
  const additionalData = encodeKeyWrapAad(context);
  const nonce = await decodeBase64(envelope.nonce);
  const ciphertext = await decodeBase64(envelope.ciphertext);
  assertByteLength('nonce', nonce, NONCE_BYTES);
  assertByteLength('wrapped key', ciphertext, KEY_BYTES + AUTH_TAG_BYTES);

  const key = await decryptAead(
    ciphertext,
    wrappingKey,
    nonce,
    additionalData,
  );
  assertByteLength('unwrapped key', key, KEY_BYTES);
  return key;
}
