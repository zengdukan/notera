import { NoteraClientError } from '../platform/notera-client';

export const PROFILE_NAME_REQUIRED = 'Enter a Profile name.';
export const PROFILE_NAME_TOO_LONG =
  'Profile name must be 100 characters or fewer.';
export const PASSWORD_REQUIRED = 'Enter your master password.';
export const PASSWORD_TOO_LONG =
  'Master password must be 1,024 characters or fewer.';
export const WRONG_PASSWORD = 'That master password is incorrect.';

export interface ProfileFormError {
  readonly title: string;
  readonly description: string;
}

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

export function validateProfileName(value?: string): string | undefined {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) return PROFILE_NAME_REQUIRED;
  if (unicodeLength(normalized) > 100) return PROFILE_NAME_TOO_LONG;
  return undefined;
}

export function validatePassword(value?: string): string | undefined {
  if (!value) return PASSWORD_REQUIRED;
  if (unicodeLength(value) > 1024) return PASSWORD_TOO_LONG;
  return undefined;
}

export function fieldErrorForProfileOperation(
  error: unknown,
): Record<string, string> | undefined {
  if (!(error instanceof NoteraClientError)) return undefined;
  if (error.code === 'WRONG_PASSWORD') return { password: WRONG_PASSWORD };
  if (error.code === 'INVALID_NAME') {
    return { displayName: 'Choose a different Profile name.' };
  }
  return undefined;
}

export function systemErrorForProfileOperation(
  error: unknown,
  operation: 'create' | 'unlock',
): ProfileFormError {
  const fallback: ProfileFormError = {
    title:
      operation === 'create'
        ? 'Profile could not be created'
        : 'Profile could not be unlocked',
    description: 'Something went wrong. Try again or restart Notera.',
  };

  if (!(error instanceof NoteraClientError)) return fallback;

  switch (error.code) {
    case 'CRYPTO_UNAVAILABLE':
      return {
        ...fallback,
        description:
          'Secure encryption is unavailable. Restart Notera and try again.',
      };
    case 'DISK_FULL':
      return {
        ...fallback,
        description:
          'There is not enough free disk space. Free up space and try again.',
      };
    case 'VAULT_META_INVALID':
    case 'DB_CORRUPT':
      return {
        ...fallback,
        description:
          'This Profile cannot be opened because its local data is damaged.',
      };
    case 'DB_SCHEMA_TOO_NEW':
      return {
        ...fallback,
        description:
          'This Profile was created by a newer version of Notera. Update the app and try again.',
      };
    case 'MIGRATION_FAILED':
      return {
        ...fallback,
        description:
          'Notera could not finish upgrading this Profile. Restart the app and try again.',
      };
    case 'ENTITY_NOT_FOUND':
      return {
        ...fallback,
        description:
          'This Profile is no longer available on this device. Select another Profile.',
      };
    default:
      return fallback;
  }
}
