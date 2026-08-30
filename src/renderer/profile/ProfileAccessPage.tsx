import { useState } from 'react';
import Heading from '@atlaskit/heading';
import { Stack, Text } from '@atlaskit/primitives';
import { FormattedMessage } from 'react-intl';

import { CreateProfileForm } from './CreateProfileForm';
import { ProfileAccessHeader } from './ProfileAccessHeader';
import { ProfileAccessHero } from './ProfileAccessHero';
import { ProfileList, type ProfileListItem } from './ProfileList';
import { UnlockProfileForm } from './UnlockProfileForm';
import './ProfileAccessPage.css';

export function ProfileAccessPage({
  profiles,
  isBusy = false,
  onCreate,
  onUnlock,
}: {
  readonly profiles: readonly ProfileListItem[];
  readonly isBusy?: boolean;
  readonly onCreate: Parameters<typeof CreateProfileForm>[0]['onCreate'];
  readonly onUnlock: Parameters<typeof UnlockProfileForm>[0]['onUnlock'];
}) {
  const [creating, setCreating] = useState(profiles.length === 0);
  const [selected, setSelected] = useState<ProfileListItem | undefined>(
    profiles[0],
  );

  return (
    <div className="notera-profile-access">
      <ProfileAccessHeader />
      <main className="notera-profile-access__main">
        <ProfileAccessHero hasProfiles={profiles.length > 0} />
        <section className="notera-profile-access__panel">
          <Stack space="space.300">
            <AccessPanelHeader
              creating={creating || selected === undefined}
              isFirstProfile={profiles.length === 0}
              selected={selected}
            />
            {profiles.length > 0 ? (
              <ProfileList
                profiles={profiles}
                isDisabled={isBusy}
                selectedId={creating ? undefined : selected?.localProfileId}
                onCreate={creating ? undefined : () => setCreating(true)}
                onSelect={(profile) => {
                  setSelected(profile);
                  setCreating(false);
                }}
              />
            ) : null}
            {creating || selected === undefined ? (
              <CreateProfileForm isDisabled={isBusy} onCreate={onCreate} />
            ) : (
              <UnlockProfileForm
                key={selected.localProfileId}
                isDisabled={isBusy}
                profile={selected}
                onUnlock={onUnlock}
              />
            )}
          </Stack>
        </section>
      </main>
    </div>
  );
}

function AccessPanelHeader({
  creating,
  isFirstProfile,
  selected,
}: {
  readonly creating: boolean;
  readonly isFirstProfile: boolean;
  readonly selected?: ProfileListItem;
}) {
  if (creating) {
    return (
      <Stack space="space.100">
        <Text as="p" color="color.text.brand" weight="semibold">
          <FormattedMessage
            id={
              isFirstProfile
                ? 'profile.create.firstEyebrow'
                : 'profile.create.eyebrow'
            }
          />
        </Text>
        <Heading size="xlarge">
          <FormattedMessage
            id={
              isFirstProfile
                ? 'profile.create.firstTitle'
                : 'profile.create.title'
            }
          />
        </Heading>
      </Stack>
    );
  }

  return (
    <Stack space="space.100">
      <Text as="p" color="color.text.brand" weight="semibold">
        <FormattedMessage id="profile.unlock.eyebrow" />
      </Text>
      <Heading size="xlarge">
        <FormattedMessage
          id="profile.unlock.title"
          values={{ profile: selected?.displayName }}
        />
      </Heading>
      <Text as="p" color="color.text.subtle">
        <FormattedMessage id="profile.unlock.description" />
      </Text>
    </Stack>
  );
}
