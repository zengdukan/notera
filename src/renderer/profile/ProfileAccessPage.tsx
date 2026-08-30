import { useState } from 'react';
import Heading from '@atlaskit/heading';
import DevicesIcon from '@atlaskit/icon/core/devices';
import LockIcon from '@atlaskit/icon/core/lock-locked';
import ShieldIcon from '@atlaskit/icon/core/shield';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';

import noteraIconUrl from '../../../assets/icon.svg';

import { CreateProfileForm } from './CreateProfileForm';
import { ProfileList, type ProfileListItem } from './ProfileList';
import { UnlockProfileForm } from './UnlockProfileForm';
import './ProfileAccessPage.css';

const headerBrandStyles = xcss({ color: 'color.text' });

export function ProfileAccessPage({
  profiles,
  onCreate,
  onUnlock,
}: {
  readonly profiles: readonly ProfileListItem[];
  readonly onCreate: Parameters<typeof CreateProfileForm>[0]['onCreate'];
  readonly onUnlock: Parameters<typeof UnlockProfileForm>[0]['onUnlock'];
}) {
  const [creating, setCreating] = useState(profiles.length === 0);
  const [selected, setSelected] = useState<ProfileListItem | undefined>(
    profiles[0],
  );

  return (
    <div className="notera-profile-access">
      <header className="notera-profile-access__header">
        <Inline space="space.150" alignBlock="center" xcss={headerBrandStyles}>
          <span className="notera-profile-access__brand-mark">
            <img src={noteraIconUrl} alt="" />
          </span>
          <Heading size="medium">Notera</Heading>
        </Inline>
      </header>
      <main className="notera-profile-access__main">
        <section className="notera-profile-access__hero">
          <Stack space="space.400">
            <Stack space="space.150">
              <Heading size="xxlarge">Your notes stay on this device.</Heading>
              <Text as="p" color="color.text.subtle">
                Each Profile is an independent, encrypted local workspace. No
                account registration or network connection is required.
              </Text>
            </Stack>
            <Stack space="space.250">
              <Feature
                icon={<DevicesIcon label="" />}
                title="Local Profiles"
                description="Keep separate workspaces on this device."
              />
              <Feature
                icon={<ShieldIcon label="" />}
                title="Encrypted by default"
                description="Your notes are protected with your master password."
              />
              <Feature
                icon={<LockIcon label="" />}
                title="Available offline"
                description="Open and edit notes without an internet connection."
              />
            </Stack>
          </Stack>
        </section>
        <section className="notera-profile-access__panel">
          <Stack space="space.300">
            {profiles.length > 0 ? (
              <ProfileList
                profiles={profiles}
                selectedId={creating ? undefined : selected?.localProfileId}
                onCreate={() => setCreating(true)}
                onSelect={(profile) => {
                  setSelected(profile);
                  setCreating(false);
                }}
              />
            ) : null}
            {creating || selected === undefined ? (
              <CreateProfileForm onCreate={onCreate} />
            ) : (
              <UnlockProfileForm
                key={selected.localProfileId}
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

function Feature({
  icon,
  title,
  description,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <Inline space="space.200" alignBlock="start">
      <span className="notera-profile-access__feature-icon">{icon}</span>
      <Stack space="space.050">
        <Text as="p" weight="semibold">
          {title}
        </Text>
        <Text as="p" color="color.text.subtle">
          {description}
        </Text>
      </Stack>
    </Inline>
  );
}
