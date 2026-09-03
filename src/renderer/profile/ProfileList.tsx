import Button from '@atlaskit/button/new';
import Avatar from '@atlaskit/avatar';
import AddIcon from '@atlaskit/icon/core/add';
import CheckMarkIcon from '@atlaskit/icon/core/check-mark';
import { ButtonItem } from '@atlaskit/menu';
import { cssMap } from '@atlaskit/css';
import { Box, Stack, Text } from '@atlaskit/primitives/compiled';
import VisuallyHidden from '@atlaskit/visually-hidden';
import { useId } from 'react';
import { useIntl } from 'react-intl';
import Tile from '@atlaskit/tile';

const VISIBLE_PROFILE_COUNT = 3;

const listStyles = cssMap({
  root: {
    maxBlockSize: '168px',
    overflowY: 'auto',
    overscrollBehaviorBlock: 'contain',
  },
});

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
      <Box
        aria-describedby={isScrollable ? scrollHintId : undefined}
        aria-label={intl.formatMessage({ id: 'profile.list.ariaLabel' })}
        role="listbox"
        xcss={isScrollable ? listStyles.root : undefined}
      >
        {profiles.map((profile) => (
          <ButtonItem
            aria-selected={selectedId === profile.localProfileId}
            description={intl.formatMessage({
              id: 'profile.list.description',
            })}
            iconAfter={
              selectedId === profile.localProfileId ? (
                <CheckMarkIcon
                  label={intl.formatMessage({ id: 'profile.list.selected' })}
                />
              ) : undefined
            }
            iconBefore={
              <Tile label="" hasBorder>
                {Array.from(profile.displayName.trim())[0]?.toUpperCase()}
              </Tile>
            }
            isDisabled={isDisabled}
            isSelected={selectedId === profile.localProfileId}
            key={profile.localProfileId}
            onClick={() => onSelect(profile)}
            role="option"
          >
            {profile.displayName}
          </ButtonItem>
        ))}
      </Box>
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
