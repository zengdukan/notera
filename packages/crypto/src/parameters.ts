export const CRYPTO_FORMAT_VERSION = 1 as const;
export const KDF_VERSION = 1 as const;
export const SALT_BYTES = 16;
export const KEY_BYTES = 32;
export const NONCE_BYTES = 24;
export const AUTH_TAG_BYTES = 16;
export const ATTACHMENT_FORMAT_VERSION = 1 as const;
export const ATTACHMENT_NONCE_PREFIX_BYTES = 16;
export const ARGON2_OUTPUT_BYTES = 64;
export const ARGON2_OPSLIMIT = 3;
export const ARGON2_MEMLIMIT = 64 * 1024 * 1024;

export enum KeyWrapPurpose {
  DATABASE_KEY = 1,
  VAULT_KEY = 2,
  ATTACHMENT_FILE_KEY = 3,
}

export enum KeyDerivationContext {
  PASSWORD_WRAPPING_KEY = 'notera/password-wrapping-key/v1',
  ATTACHMENT_THUMBNAIL_KEY = 'notera/attachment-thumbnail-key/v1',
}

Object.freeze(KeyWrapPurpose);
Object.freeze(KeyDerivationContext);
