import Tabs, { Tab, TabList, TabPanel } from '@atlaskit/tabs';

import {
  GeneralSettings,
  type LanguagePreference,
  type ThemePreference,
} from './GeneralSettings';
import {
  type AutoLockMinutes,
  ProfileSecuritySettings,
} from './ProfileSecuritySettings';

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
  readonly profile: { autoLockMinutes: AutoLockMinutes };
  readonly onUpdateDevice: Parameters<typeof GeneralSettings>[0]['onUpdate'];
  readonly onUpdateProfile: (value: {
    autoLockMinutes: AutoLockMinutes;
  }) => Promise<unknown> | unknown;
  readonly onRenameProfile: (displayName: string) => Promise<void> | void;
  readonly onChangePassword: Parameters<
    typeof ProfileSecuritySettings
  >[0]['onChangePassword'];
  readonly onLock: () => Promise<unknown> | unknown;
  readonly onRemove: () => Promise<unknown> | unknown;
}) {
  return (
    <Tabs id="notera-settings-tabs">
      <TabList>
        <Tab>General</Tab>
        <Tab>Profile and security</Tab>
      </TabList>
      <TabPanel>
        <GeneralSettings value={device} onUpdate={onUpdateDevice} />
      </TabPanel>
      <TabPanel>
        <ProfileSecuritySettings
          autoLockMinutes={profile.autoLockMinutes}
          onUpdateAutoLock={(autoLockMinutes) =>
            onUpdateProfile({ autoLockMinutes })
          }
          onRenameProfile={onRenameProfile}
          onChangePassword={onChangePassword}
          onLock={onLock}
          onRemove={onRemove}
        />
      </TabPanel>
    </Tabs>
  );
}
