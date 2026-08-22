export const ATTACHMENT_MANIFEST_VERSION = 1 as const;
export const ATTACHMENT_CHUNK_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MANIFEST_HEADER_BYTES = 38;
export const MANIFEST_CHUNK_RECORD_BYTES = 40;
export const CIPHERTEXT_HASH_BYTES = 32;

export const MANIFEST_MAGIC = new Uint8Array([0x4e, 0x54, 0x41, 0x4d]);
