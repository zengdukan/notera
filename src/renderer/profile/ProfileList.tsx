import Button from '@atlaskit/button/new';
import AddIcon from '@atlaskit/icon/core/add';
import CheckMarkIcon from '@atlaskit/icon/core/check-mark';
import { ButtonItem } from '@atlaskit/menu';
import { Stack, Text } from '@atlaskit/primitives';

export interface ProfileListItem {
  readonly localProfileId: string;
  readonly displayName: string;
}

export function ProfileList({
  profiles,
  selectedId,
  isDisabled = false,
  onSelect,
  onCreate,
}: {
  readonly profiles: readonly ProfileListItem[];
  readonly selectedId?: string;
  readonly isDisabled?: boolean;
  readonly onSelect: (profile: ProfileListItem) => void;
  readonly onCreate: () => void;
}) {
  return (
    <Stack space="space.100">
      <Text as="p" color="color.text.subtle" weight="semibold">
        PROFILES
      </Text>
      <div
        aria-label="Profiles on this device"
        className="notera-profile-list"
        role="listbox"
      >
        {profiles.map((profile) => (
          <div
            className="notera-profile-list__item"
            key={profile.localProfileId}
          >
            <ButtonItem
              aria-selected={selectedId === profile.localProfileId}
              description="This device · Encrypted"
              iconAfter={
                selectedId === profile.localProfileId ? (
                  <CheckMarkIcon label="Selected" />
                ) : undefined
              }
              iconBefore={
                <span
                  aria-hidden
                  className="notera-profile-list__avatar-initial"
                >
                  {Array.from(profile.displayName.trim())[0]?.toUpperCase() ??
                    '?'}
                </span>
              }
              isDisabled={isDisabled}
              isSelected={selectedId === profile.localProfileId}
              onClick={() => onSelect(profile)}
              role="option"
            >
              {profile.displayName}
            </ButtonItem>
          </div>
        ))}
      </div>
      <Button
        appearance="subtle"
        iconBefore={AddIcon}
        isDisabled={isDisabled}
        onClick={onCreate}
      >
        Create Profile
      </Button>
    </Stack>
  );
}
