import { ModalBody } from '@atlaskit/modal-dialog';
import { Box, Stack, xcss } from '@atlaskit/primitives';

import {
  GeneralSettings,
  type LanguagePreference,
  type ThemePreference,
} from './GeneralSettings';
import {
  type AutoLockMinutes,
  ProfileSecuritySettings,
  type RemoveProfileResult,
} from './ProfileSecuritySettings';

const settingsContentStyles = xcss({
  width: '100%',
  maxWidth: '600px',
  minHeight: '420px',
  marginInline: 'auto',
});

export function SettingsModal({
  device,
  profile,
  onUpdateDevice,
  onUpdateProfile,
  onRenameProfile,
  onChangePassword,
  onLock,
  onRemove,
}: {
  readonly device: { theme: ThemePreference; language: LanguagePreference };
  readonly profile: {
    autoLockMinutes: AutoLockMinutes;
    displayName: string;
  };
  readonly onUpdateDevice: Parameters<typeof GeneralSettings>[0]['onUpdate'];
  readonly onUpdateProfile: (value: {
    autoLockMinutes: AutoLockMinutes;
  }) => Promise<unknown> | unknown;
  readonly onRenameProfile: (displayName: string) => Promise<string> | string;
  readonly onChangePassword: Parameters<
    typeof ProfileSecuritySettings
  >[0]['onChangePassword'];
  readonly onLock: () => Promise<unknown> | unknown;
  readonly onRemove: () => Promise<RemoveProfileResult> | RemoveProfileResult;
}) {
  return (
    <ModalBody>
      <Box paddingBlockEnd="space.100" xcss={settingsContentStyles}>
        <Stack space="space.100">
          <GeneralSettings value={device} onUpdate={onUpdateDevice} />
          <ProfileSecuritySettings
            autoLockMinutes={profile.autoLockMinutes}
            displayName={profile.displayName}
            onUpdateAutoLock={(autoLockMinutes) =>
              onUpdateProfile({ autoLockMinutes })
            }
            onRenameProfile={onRenameProfile}
            onChangePassword={onChangePassword}
            onLock={onLock}
            onRemove={onRemove}
          />
        </Stack>
      </Box>
    </ModalBody>
  );
}
