import Button from '@atlaskit/button/new';
import AddIcon from '@atlaskit/icon/core/add';
import CheckMarkIcon from '@atlaskit/icon/core/check-mark';
import { ButtonItem } from '@atlaskit/menu';
import { Stack, Text } from '@atlaskit/primitives';
import VisuallyHidden from '@atlaskit/visually-hidden';
import { useId } from 'react';
import { useIntl } from 'react-intl';

const VISIBLE_PROFILE_COUNT = 4;

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
  readonly onCreate?: () => void;
}) {
  const intl = useIntl();
  const scrollHintId = useId();
  const isScrollable = profiles.length > VISIBLE_PROFILE_COUNT;

  return (
    <Stack space="space.100">
      <Text as="p" color="color.text.subtle" weight="semibold">
        {intl.formatMessage({ id: 'profile.list.label' })}
      </Text>
      {isScrollable ? (
        <VisuallyHidden id={scrollHintId}>
          {intl.formatMessage({ id: 'profile.list.scrollHint' })}
        </VisuallyHidden>
      ) : null}
      <div
        aria-describedby={isScrollable ? scrollHintId : undefined}
        aria-label={intl.formatMessage({ id: 'profile.list.ariaLabel' })}
        className={`notera-profile-list${
          isScrollable ? ' notera-profile-list--scrollable' : ''
        }`}
        role="listbox"
      >
        {profiles.map((profile) => (
          <div
            className="notera-profile-list__item"
            key={profile.localProfileId}
          >
            <ButtonItem
              aria-selected={selectedId === profile.localProfileId}
              description={intl.formatMessage({
                id: 'profile.list.description',
              })}
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
      {onCreate ? (
        <Button
          appearance="subtle"
          iconBefore={AddIcon}
          isDisabled={isDisabled}
          onClick={onCreate}
        >
          {intl.formatMessage({ id: 'profile.list.create' })}
        </Button>
      ) : null}
    </Stack>
  );
}
