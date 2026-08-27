import { z } from 'zod';

import { emptyObjectSchema } from '../common';
import { defineRequestContract } from '../contract';

export const themePreferenceSchema = z.enum(['SYSTEM', 'LIGHT', 'DARK']);
export const languagePreferenceSchema = z.enum(['zh-CN', 'en']);
export const autoLockMinutesSchema = z.union([
  z.literal(1),
  z.literal(5),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);

export const deviceSettingsSchema = z.strictObject({
  theme: themePreferenceSchema,
  language: languagePreferenceSchema,
});

export const profileSettingsSchema = z.strictObject({
  autoLockMinutes: autoLockMinutesSchema,
});

export const settingsGetDevice = defineRequestContract({
  key: 'settings.getDevice',
  channel: 'notera:settings:get-device',
  request: emptyObjectSchema,
  data: deviceSettingsSchema,
  errors: ['IPC_OPERATION_FAILED'],
});

export const settingsUpdateDevice = defineRequestContract({
  key: 'settings.updateDevice',
  channel: 'notera:settings:update-device',
  request: deviceSettingsSchema
    .partial()
    .refine(
      (value) => Object.keys(value).length > 0,
      'At least one device setting is required.',
    ),
  data: deviceSettingsSchema,
  errors: ['SAVE_FAILED', 'DISK_FULL', 'IPC_OPERATION_FAILED'],
});

export const settingsGetProfile = defineRequestContract({
  key: 'settings.getProfile',
  channel: 'notera:settings:get-profile',
  request: emptyObjectSchema,
  data: profileSettingsSchema,
  errors: ['PROFILE_LOCKED', 'IPC_OPERATION_FAILED'],
});

export const settingsUpdateProfile = defineRequestContract({
  key: 'settings.updateProfile',
  channel: 'notera:settings:update-profile',
  request: profileSettingsSchema,
  data: profileSettingsSchema,
  errors: [
    'PROFILE_LOCKED',
    'SAVE_FAILED',
    'DISK_FULL',
    'IPC_OPERATION_FAILED',
  ],
});

export const settingsContracts = {
  getDevice: settingsGetDevice,
  updateDevice: settingsUpdateDevice,
  getProfile: settingsGetProfile,
  updateProfile: settingsUpdateProfile,
} as const;
