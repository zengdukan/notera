import { useState } from 'react';
import Heading from '@atlaskit/heading';
import Button from '@atlaskit/button/new';
import ArrowLeftIcon from '@atlaskit/icon/core/arrow-left';
import { cssMap } from '@atlaskit/css';
import { Box, Inline, Stack, Text } from '@atlaskit/primitives/compiled';
import { FormattedMessage } from 'react-intl';

import { CreateProfileForm } from './CreateProfileForm';
import { ProfileAccessHeader } from './ProfileAccessHeader';
import { ProfileAccessHero } from './ProfileAccessHero';
import { ProfileList, type ProfileListItem } from './ProfileList';
import { UnlockProfileForm } from './UnlockProfileForm';

/* eslint-disable @atlaskit/design-system/no-unsafe-design-token-usage, @atlaskit/design-system/ensure-design-token-usage */
import type { NoteraClient } from '../platform/notera-client';

const styles = cssMap({
  root: {
    minHeight: '100vh',
    backgroundColor: 'var(--ds-surface-sunken)',
  },
  main: {
    width: '100%',
    maxWidth: '1120px',
    marginInline: 'auto',
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: 'minmax(360px, 1fr) 552px',
    alignItems: 'center',
    gap: 'var(--ds-space-800)',
    paddingBlock: 'var(--ds-space-600)',
    paddingInline: 'var(--ds-space-400)',
    '@media not all and (min-width: 48rem)': {
      display: 'block',
      paddingBlock: 'var(--ds-space-400)',
    },
    '@media not all and (min-width: 30rem)': {
      paddingInline: 'var(--ds-space-250)',
    },
  },
  panel: {
    minHeight: '684px',
    boxSizing: 'border-box',
    padding: 'var(--ds-space-600)',
    borderWidth: 'var(--ds-border-width)',
    borderStyle: 'solid',
    borderColor: 'var(--ds-border)',
    borderRadius: 'var(--ds-radius-large)',
    backgroundColor: 'var(--ds-surface-raised)',
    boxShadow: 'var(--ds-shadow-raised)',
    '@media not all and (min-width: 48rem)': {
      width: '100%',
      maxWidth: '600px',
      minHeight: 'auto',
      marginInline: 'auto',
      marginBlockStart: 'var(--ds-space-400)',
      padding: 'var(--ds-space-500)',
    },
    '@media not all and (min-width: 30rem)': {
      marginBlockStart: '0',
      padding: '0',
      borderWidth: '0',
      backgroundColor: 'transparent',
      boxShadow: 'initial',
    },
  },
});

export function ProfileAccessPage({
  profiles,
  isBusy = false,
  onCreate,
  onUnlock,
  client,
}: {
  readonly profiles: readonly ProfileListItem[];
  readonly isBusy?: boolean;
  readonly onCreate: Parameters<typeof CreateProfileForm>[0]['onCreate'];
  readonly onUnlock: Parameters<typeof UnlockProfileForm>[0]['onUnlock'];
  readonly client?: NoteraClient;
}) {
  const [creating, setCreating] = useState(profiles.length === 0);
  const [selected, setSelected] = useState<ProfileListItem | undefined>(
    profiles[0],
  );

  const isCreating = creating || selected === undefined;

  const handleBackToUnlock = () => {
    setCreating(false);
    if (selected === undefined && profiles.length > 0) {
      setSelected(profiles[0]);
    }
  };

  return (
    <Box xcss={styles.root}>
      <ProfileAccessHeader client={client} />
      <Box as="main" xcss={styles.main}>
        <ProfileAccessHero hasProfiles={profiles.length > 0} />
        <Box as="section" xcss={styles.panel}>
          <Stack space="space.300">
            <AccessPanelHeader
              creating={isCreating}
              isFirstProfile={profiles.length === 0}
              selected={selected}
              onBackToUnlock={
                isCreating && profiles.length > 0
                  ? handleBackToUnlock
                  : undefined
              }
            />
            {!isCreating && profiles.length > 0 ? (
              <ProfileList
                profiles={profiles}
                isDisabled={isBusy}
                selectedId={selected?.localProfileId}
                onCreate={() => setCreating(true)}
                onSelect={(profile) => {
                  setSelected(profile);
                  setCreating(false);
                }}
              />
            ) : null}
            {isCreating ? (
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
        </Box>
      </Box>
    </Box>
  );
}

function AccessPanelHeader({
  creating,
  isFirstProfile,
  selected,
  onBackToUnlock,
}: {
  readonly creating: boolean;
  readonly isFirstProfile: boolean;
  readonly selected?: ProfileListItem;
  readonly onBackToUnlock?: () => void;
}) {
  if (creating) {
    const showBackButton = !isFirstProfile && onBackToUnlock;
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
        <Inline
          alignBlock="center"
          spread={showBackButton ? 'space-between' : undefined}
        >
          <Heading size="xlarge">
            <FormattedMessage
              id={
                isFirstProfile
                  ? 'profile.create.firstTitle'
                  : 'profile.create.title'
              }
            />
          </Heading>
          {showBackButton ? (
            <Button
              appearance="subtle"
              iconBefore={ArrowLeftIcon}
              onClick={onBackToUnlock}
            >
              <FormattedMessage id="profile.create.backToUnlock" />
            </Button>
          ) : null}
        </Inline>
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
