import { CryptoError, isCryptoError } from './errors';
import { getSodium } from './sodium';

const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function invalidInput(): never {
  throw new CryptoError('INVALID_CRYPTO_INPUT');
}

export function assertByteLength(
  _name: string,
  bytes: Uint8Array,
  expectedLength: number,
): void {
  if (!(bytes instanceof Uint8Array) || bytes.length !== expectedLength) {
    invalidInput();
  }
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array)) {
    invalidInput();
  }

  return new Uint8Array(bytes);
}

export function encodeUtf8(value: string): Uint8Array {
  if (typeof value !== 'string') {
    invalidInput();
  }

  return new TextEncoder().encode(value);
}

export async function encodeBase64(bytes: Uint8Array): Promise<string> {
  if (!(bytes instanceof Uint8Array)) {
    invalidInput();
  }

  const crypto = await getSodium();
  return crypto.to_base64(bytes, crypto.base64_variants.ORIGINAL);
}

export async function decodeBase64(value: string): Promise<Uint8Array> {
  if (
    typeof value !== 'string' ||
    value.length % 4 !== 0 ||
    !CANONICAL_BASE64.test(value)
  ) {
    invalidInput();
  }

  try {
    const crypto = await getSodium();
    const decoded = crypto.from_base64(value, crypto.base64_variants.ORIGINAL);
    const canonical = crypto.to_base64(
      decoded,
      crypto.base64_variants.ORIGINAL,
    );

    if (canonical !== value) {
      invalidInput();
    }

    return new Uint8Array(decoded);
  } catch (error) {
    if (isCryptoError(error)) {
      throw error;
    }
    return invalidInput();
  }
}

export function wipeBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array)) {
    invalidInput();
  }

  bytes.fill(0);
}
