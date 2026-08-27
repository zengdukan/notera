import { useState } from 'react';
import { Box, Grid, Stack, Text, xcss } from '@atlaskit/primitives';
import { FormattedMessage } from 'react-intl';

import { CreateProfileForm } from './CreateProfileForm';
import { ProfileList, type ProfileListItem } from './ProfileList';
import { UnlockProfileForm } from './UnlockProfileForm';

const pageStyles = xcss({
  width: '100%',
  maxWidth: '960px',
  marginInline: 'auto',
  paddingBlockStart: 'space.600',
});

const panelStyles = xcss({
  padding: 'space.300',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderColor: 'color.border',
  borderRadius: 'radius.medium',
  backgroundColor: 'elevation.surface',
});

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
    <Box xcss={pageStyles}>
      <Stack space="space.200">
        <Text as="p">
          <FormattedMessage id="app.chooseProfile" />
        </Text>
        <Grid templateColumns="minmax(240px, 1fr) minmax(320px, 2fr)" gap="space.300">
        <Box xcss={panelStyles}>
          <ProfileList
            profiles={profiles}
            selectedId={creating ? undefined : selected?.localProfileId}
            onCreate={() => setCreating(true)}
            onSelect={(profile) => {
              setSelected(profile);
              setCreating(false);
            }}
          />
        </Box>
        <Box xcss={panelStyles}>
          {creating || selected === undefined ? (
            <CreateProfileForm onCreate={onCreate} />
          ) : (
            <UnlockProfileForm profile={selected} onUnlock={onUnlock} />
          )}
        </Box>
        </Grid>
      </Stack>
    </Box>
  );
}
