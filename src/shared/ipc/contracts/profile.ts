import { z } from 'zod';
import {
  emptyObjectSchema,
  limitedUnicodeString,
  timestampSchema,
  uuidSchema,
} from '../common';
import { defineRequestContract } from '../contract';
import { cursorPageRequestSchema, cursorPageSchema } from '../pagination';

const profileNameSchema = limitedUnicodeString(100).refine(
  (value) => value.trim().length > 0,
  { message: 'Profile name cannot be blank.' },
);
const passwordSchema = limitedUnicodeString(1024).min(1);

export const profileSummarySchema = z.strictObject({
  localProfileId: uuidSchema,
  displayName: profileNameSchema,
  lastUsedAt: timestampSchema,
  isCurrent: z.boolean(),
});

export const unlockedSessionSchema = z.strictObject({
  state: z.literal('UNLOCKED'),
  localProfileId: uuidSchema,
  displayName: profileNameSchema,
  rootFolderId: uuidSchema,
});

export const sessionStateSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('LOCKED') }),
  unlockedSessionSchema,
]);

export const profileList = defineRequestContract({
  key: 'profile.list',
  channel: 'notera:profile:list',
  request: cursorPageRequestSchema,
  data: cursorPageSchema(profileSummarySchema),
  errors: ['IPC_OPERATION_FAILED'],
});

export const profileGetSessionState = defineRequestContract({
  key: 'profile.getSessionState',
  channel: 'notera:profile:get-session-state',
  request: emptyObjectSchema,
  data: sessionStateSchema,
  errors: ['IPC_OPERATION_FAILED'],
});

export const profileCreate = defineRequestContract({
  key: 'profile.create',
  channel: 'notera:profile:create',
  request: z.strictObject({
    displayName: profileNameSchema,
    password: passwordSchema,
  }),
  data: unlockedSessionSchema,
  errors: [
    'INVALID_NAME',
    'CRYPTO_UNAVAILABLE',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const profileUnlock = defineRequestContract({
  key: 'profile.unlock',
  channel: 'notera:profile:unlock',
  request: z.strictObject({
    localProfileId: uuidSchema,
    password: passwordSchema,
  }),
  data: unlockedSessionSchema,
  errors: [
    'WRONG_PASSWORD',
    'VAULT_META_INVALID',
    'CRYPTO_UNAVAILABLE',
    'DB_CORRUPT',
    'DB_SCHEMA_TOO_NEW',
    'MIGRATION_FAILED',
    'ENTITY_NOT_FOUND',
    'IPC_OPERATION_FAILED',
  ],
});

export const profileLock = defineRequestContract({
  key: 'profile.lock',
  channel: 'notera:profile:lock',
  request: emptyObjectSchema,
  data: emptyObjectSchema,
  errors: ['IPC_OPERATION_FAILED'],
});

export const profileTouchActivity = defineRequestContract({
  key: 'profile.touchActivity',
  channel: 'notera:profile:touch-activity',
  request: emptyObjectSchema,
  data: emptyObjectSchema,
  errors: ['PROFILE_LOCKED', 'IPC_OPERATION_FAILED'],
});

export const profileSwitch = defineRequestContract({
  key: 'profile.switch',
  channel: 'notera:profile:switch',
  request: z.strictObject({
    localProfileId: uuidSchema,
    password: passwordSchema,
  }),
  data: unlockedSessionSchema,
  errors: [
    'WRONG_PASSWORD',
    'VAULT_META_INVALID',
    'CRYPTO_UNAVAILABLE',
    'DB_CORRUPT',
    'DB_SCHEMA_TOO_NEW',
    'MIGRATION_FAILED',
    'ENTITY_NOT_FOUND',
    'IPC_OPERATION_FAILED',
  ],
});

export const profileRename = defineRequestContract({
  key: 'profile.rename',
  channel: 'notera:profile:rename',
  request: z.strictObject({ displayName: profileNameSchema }),
  data: profileSummarySchema,
  errors: [
    'PROFILE_LOCKED',
    'INVALID_NAME',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const profileChangePassword = defineRequestContract({
  key: 'profile.changePassword',
  channel: 'notera:profile:change-password',
  request: z.strictObject({
    oldPassword: passwordSchema,
    newPassword: passwordSchema,
  }),
  data: emptyObjectSchema,
  errors: [
    'PROFILE_LOCKED',
    'WRONG_PASSWORD',
    'CRYPTO_UNAVAILABLE',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

const removeProfileResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('removed') }),
  z.strictObject({ status: z.literal('cancelled') }),
]);

export const profileRemoveFromDevice = defineRequestContract({
  key: 'profile.removeFromDevice',
  channel: 'notera:profile:remove-from-device',
  request: z.strictObject({ localProfileId: uuidSchema }),
  data: removeProfileResultSchema,
  errors: ['ENTITY_NOT_FOUND', 'IPC_OPERATION_FAILED'],
});

export const profileContracts = {
  list: profileList,
  getSessionState: profileGetSessionState,
  create: profileCreate,
  unlock: profileUnlock,
  lock: profileLock,
  touchActivity: profileTouchActivity,
  switch: profileSwitch,
  rename: profileRename,
  changePassword: profileChangePassword,
  removeFromDevice: profileRemoveFromDevice,
} as const;
