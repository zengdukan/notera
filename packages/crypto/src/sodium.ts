import sodium from 'libsodium-wrappers';

import { CryptoError } from './errors';

export async function initializeSodium(
  ready: Promise<unknown> = sodium.ready,
): Promise<typeof sodium> {
  try {
    await ready;
    return sodium;
  } catch {
    throw new CryptoError('CRYPTO_INITIALIZATION_FAILED');
  }
}

export async function getSodium(): Promise<typeof sodium> {
  return initializeSodium();
}
