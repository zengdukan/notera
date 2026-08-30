import type { IntlShape } from 'react-intl';

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

export interface ProfileFormMessages {
  readonly profileNameRequired: string;
  readonly profileNameTooLong: string;
  readonly passwordRequired: string;
  readonly passwordTooLong: string;
  readonly wrongPassword: string;
  readonly invalidName: string;
  readonly createFailed: string;
  readonly unlockFailed: string;
  readonly genericFailure: string;
  readonly cryptoUnavailable: string;
  readonly diskFull: string;
  readonly damagedProfile: string;
  readonly schemaTooNew: string;
  readonly migrationFailed: string;
  readonly profileMissing: string;
}

const defaultMessages: ProfileFormMessages = {
  profileNameRequired: PROFILE_NAME_REQUIRED,
  profileNameTooLong: PROFILE_NAME_TOO_LONG,
  passwordRequired: PASSWORD_REQUIRED,
  passwordTooLong: PASSWORD_TOO_LONG,
  wrongPassword: WRONG_PASSWORD,
  invalidName: 'Choose a different Profile name.',
  createFailed: 'Profile could not be created',
  unlockFailed: 'Profile could not be unlocked',
  genericFailure: 'Something went wrong. Try again or restart Notera.',
  cryptoUnavailable:
    'Secure encryption is unavailable. Restart Notera and try again.',
  diskFull: 'There is not enough free disk space. Free up space and try again.',
  damagedProfile:
    'This Profile cannot be opened because its local data is damaged.',
  schemaTooNew:
    'This Profile was created by a newer version of Notera. Update the app and try again.',
  migrationFailed:
    'Notera could not finish upgrading this Profile. Restart the app and try again.',
  profileMissing:
    'This Profile is no longer available on this device. Select another Profile.',
};

export function localizedProfileFormMessages(
  intl: IntlShape,
): ProfileFormMessages {
  return {
    profileNameRequired: intl.formatMessage({
      id: 'profile.validation.nameRequired',
    }),
    profileNameTooLong: intl.formatMessage({
      id: 'profile.validation.nameTooLong',
    }),
    passwordRequired: intl.formatMessage({
      id: 'profile.validation.passwordRequired',
    }),
    passwordTooLong: intl.formatMessage({
      id: 'profile.validation.passwordTooLong',
    }),
    wrongPassword: intl.formatMessage({ id: 'profile.error.wrongPassword' }),
    invalidName: intl.formatMessage({ id: 'profile.error.invalidName' }),
    createFailed: intl.formatMessage({ id: 'profile.error.createTitle' }),
    unlockFailed: intl.formatMessage({ id: 'profile.error.unlockTitle' }),
    genericFailure: intl.formatMessage({ id: 'profile.error.generic' }),
    cryptoUnavailable: intl.formatMessage({
      id: 'profile.error.cryptoUnavailable',
    }),
    diskFull: intl.formatMessage({ id: 'profile.error.diskFull' }),
    damagedProfile: intl.formatMessage({ id: 'profile.error.damaged' }),
    schemaTooNew: intl.formatMessage({ id: 'profile.error.schemaTooNew' }),
    migrationFailed: intl.formatMessage({
      id: 'profile.error.migrationFailed',
    }),
    profileMissing: intl.formatMessage({ id: 'profile.error.missing' }),
  };
}

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

export function validateProfileName(
  value?: string,
  messages: ProfileFormMessages = defaultMessages,
): string | undefined {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) return messages.profileNameRequired;
  if (unicodeLength(normalized) > 100) return messages.profileNameTooLong;
  return undefined;
}

export function validatePassword(
  value?: string,
  messages: ProfileFormMessages = defaultMessages,
): string | undefined {
  if (!value) return messages.passwordRequired;
  if (unicodeLength(value) > 1024) return messages.passwordTooLong;
  return undefined;
}

export function fieldErrorForProfileOperation(
  error: unknown,
  messages: ProfileFormMessages = defaultMessages,
): Record<string, string> | undefined {
  if (!(error instanceof NoteraClientError)) return undefined;
  if (error.code === 'WRONG_PASSWORD')
    return { password: messages.wrongPassword };
  if (error.code === 'INVALID_NAME') {
    return { displayName: messages.invalidName };
  }
  return undefined;
}

export function systemErrorForProfileOperation(
  error: unknown,
  operation: 'create' | 'unlock',
  messages: ProfileFormMessages = defaultMessages,
): ProfileFormError {
  const fallback: ProfileFormError = {
    title:
      operation === 'create' ? messages.createFailed : messages.unlockFailed,
    description: messages.genericFailure,
  };

  if (!(error instanceof NoteraClientError)) return fallback;

  switch (error.code) {
    case 'CRYPTO_UNAVAILABLE':
      return {
        ...fallback,
        description: messages.cryptoUnavailable,
      };
    case 'DISK_FULL':
      return {
        ...fallback,
        description: messages.diskFull,
      };
    case 'VAULT_META_INVALID':
    case 'DB_CORRUPT':
      return {
        ...fallback,
        description: messages.damagedProfile,
      };
    case 'DB_SCHEMA_TOO_NEW':
      return {
        ...fallback,
        description: messages.schemaTooNew,
      };
    case 'MIGRATION_FAILED':
      return {
        ...fallback,
        description: messages.migrationFailed,
      };
    case 'ENTITY_NOT_FOUND':
      return {
        ...fallback,
        description: messages.profileMissing,
      };
    default:
      return fallback;
  }
}
