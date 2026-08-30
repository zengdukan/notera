import Button from '@atlaskit/button/new';
import Heading from '@atlaskit/heading';
import PersonIcon from '@atlaskit/icon/core/person';
import { Inline, Stack } from '@atlaskit/primitives';

export interface ProfileListItem {
  readonly localProfileId: string;
  readonly displayName: string;
}

export function ProfileList({
  profiles,
  selectedId,
  onSelect,
  onCreate,
}: {
  readonly profiles: readonly ProfileListItem[];
  readonly selectedId?: string;
  readonly onSelect: (profile: ProfileListItem) => void;
  readonly onCreate: () => void;
}) {
  return (
    <Stack space="space.200">
      <Inline alignBlock="center" spread="space-between">
        <Heading size="small">Profiles on this device</Heading>
        <Button appearance="subtle" onClick={onCreate}>
          Create new
        </Button>
      </Inline>
      <Stack space="space.050">
        {profiles.map((profile) => (
          <Button
            key={profile.localProfileId}
            appearance={
              selectedId === profile.localProfileId ? 'primary' : 'subtle'
            }
            aria-pressed={selectedId === profile.localProfileId}
            iconBefore={PersonIcon}
            shouldFitContainer
            onClick={() => onSelect(profile)}
          >
            {profile.displayName}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}
