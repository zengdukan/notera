export type DomainErrorCode =
  | 'INVALID_ID'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_SORT_ORDER'
  | 'INVALID_NAME'
  | 'INVALID_ADF_DOCUMENT'
  | 'ROOT_FOLDER_IMMUTABLE'
  | 'FOLDER_CYCLE'
  | 'PARENT_FOLDER_INVALID'
  | 'VAULT_MISMATCH'
  | 'CONTENT_VERSION_OVERFLOW'
  | 'VERSION_NOTE_MISMATCH'
  | 'TRASH_ENTRY_EXPIRED'
  | 'ATTACHMENT_TOO_LARGE'
  | 'ATTACHMENT_STILL_REFERENCED'
  | 'DUPLICATE_TARGET_ID'
  | 'ENTITY_NOT_FOUND'
  | 'TRASH_TARGET_REQUIRED'
  | 'INVALID_ENTITY_STATE';

const ERROR_MESSAGES: Readonly<Record<DomainErrorCode, string>> = {
  INVALID_ID: 'The identifier is invalid.',
  INVALID_TIMESTAMP: 'The timestamp is invalid.',
  INVALID_SORT_ORDER: 'The sort order is invalid.',
  INVALID_NAME: 'The name is invalid.',
  INVALID_ADF_DOCUMENT: 'The document is invalid.',
  ROOT_FOLDER_IMMUTABLE: 'The root folder cannot be changed.',
  FOLDER_CYCLE: 'The folder move would create a cycle.',
  PARENT_FOLDER_INVALID: 'The parent folder is invalid.',
  VAULT_MISMATCH: 'The objects belong to different vaults.',
  CONTENT_VERSION_OVERFLOW: 'The content version cannot be incremented.',
  VERSION_NOTE_MISMATCH: 'The version does not belong to the note.',
  TRASH_ENTRY_EXPIRED: 'The trash entry has expired.',
  ATTACHMENT_TOO_LARGE: 'The attachment exceeds the size limit.',
  ATTACHMENT_STILL_REFERENCED: 'The attachment is still referenced.',
  DUPLICATE_TARGET_ID: 'A target identifier is duplicated.',
  ENTITY_NOT_FOUND: 'A required domain object was not found.',
  TRASH_TARGET_REQUIRED: 'An explicit restore target is required.',
  INVALID_ENTITY_STATE: 'The domain object state is invalid.',
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function failDomain(code: DomainErrorCode): never {
  throw new DomainError(code);
}

export function assertDomain(
  condition: unknown,
  code: DomainErrorCode,
): asserts condition {
  if (!condition) {
    failDomain(code);
  }
}
