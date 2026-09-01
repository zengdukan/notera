import { useQuery } from '@tanstack/react-query';

import { profileSettingsKey } from '../app/query-keys';
import type { NoteraClient, RequestData } from '../platform/notera-client';

export type DeviceSettings = RequestData<'settings.getDevice'>;
export type ThemePreference = DeviceSettings['theme'];
export type LanguagePreference = DeviceSettings['language'];

export const deviceSettingsKey = () => ['device', 'settings'] as const;

export function useDeviceSettings(client: NoteraClient) {
  return useQuery({
    queryKey: deviceSettingsKey(),
    queryFn: () => client.request('settings.getDevice', {}),
  });
}

export function useProfileSettings(client: NoteraClient, profileId: string) {
  return useQuery({
    queryKey: profileSettingsKey(profileId),
    queryFn: () => client.request('settings.getProfile', {}),
  });
}
