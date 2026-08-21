export type CryptoErrorCode =
  | 'INVALID_CRYPTO_INPUT'
  | 'UNSUPPORTED_CRYPTO_VERSION'
  | 'AUTHENTICATION_FAILED'
  | 'CRYPTO_INITIALIZATION_FAILED'
  | 'CRYPTO_OPERATION_FAILED';

const ERROR_MESSAGES: Readonly<Record<CryptoErrorCode, string>> = {
  INVALID_CRYPTO_INPUT: 'Invalid crypto input',
  UNSUPPORTED_CRYPTO_VERSION: 'Unsupported crypto version',
  AUTHENTICATION_FAILED: 'Authentication failed',
  CRYPTO_INITIALIZATION_FAILED: 'Crypto initialization failed',
  CRYPTO_OPERATION_FAILED: 'Crypto operation failed',
};

export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'CryptoError';
    this.code = code;
  }
}

export function isCryptoError(error: unknown): error is CryptoError {
  return error instanceof CryptoError;
}
