import Button, { IconButton } from '@atlaskit/button/new';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import AddIcon from '@atlaskit/icon/core/add';
import LockIcon from '@atlaskit/icon/core/lock-locked';
import SearchIcon from '@atlaskit/icon/core/search';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import Tooltip from '@atlaskit/tooltip';

export function NavigationHeader({
  profileName,
  onLock,
  onSearch,
  onCreateNote,
  onCreateFolder,
  compact = false,
}: {
  readonly profileName: string;
  readonly onLock: () => void;
  readonly onSearch: () => void;
  readonly onCreateNote: () => void;
  readonly onCreateFolder: () => void;
  readonly compact?: boolean;
}) {
  const createMenu = (
    <DropdownMenu<HTMLButtonElement>
      shouldRenderToParent
      trigger={({ triggerRef, ...props }) => (
        <IconButton
          {...props}
          ref={triggerRef}
          label="Create"
          icon={AddIcon}
          appearance="primary"
        />
      )}
    >
      <DropdownItemGroup>
        <DropdownItem onClick={onCreateNote}>New note</DropdownItem>
        <DropdownItem onClick={onCreateFolder}>New folder</DropdownItem>
      </DropdownItemGroup>
    </DropdownMenu>
  );

  if (compact) {
    return (
      <Stack alignInline="center" space="space.100">
        <Tooltip content="Lock profile" position="right">
          <IconButton
            label="Lock profile"
            icon={LockIcon}
            appearance="subtle"
            onClick={onLock}
          />
        </Tooltip>
        <Tooltip content="Search" position="right">
          <IconButton
            label="Search"
            icon={SearchIcon}
            appearance="subtle"
            onClick={onSearch}
          />
        </Tooltip>
        {createMenu}
      </Stack>
    );
  }

  return (
    <Stack space="space.150">
      <Inline alignBlock="center" spread="space-between">
        <Text weight="semibold" maxLines={1}>
          {profileName}
        </Text>
        <IconButton
          label="Lock profile"
          icon={LockIcon}
          appearance="subtle"
          onClick={onLock}
        />
      </Inline>
      <Inline alignBlock="center" space="space.050">
        <Button
          shouldFitContainer
          iconBefore={SearchIcon}
          onClick={onSearch}
          aria-label="Search"
        >
          <Inline spread="space-between" grow="fill">
            <Text>Search</Text>
            <Text color="color.text.subtle">Ctrl + J</Text>
          </Inline>
        </Button>
        {createMenu}
      </Inline>
    </Stack>
  );
}
