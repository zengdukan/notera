import Button, { IconButton } from '@atlaskit/button/new';
import DropdownMenu, { DropdownItem, DropdownItemGroup } from '@atlaskit/dropdown-menu';
import AddIcon from '@atlaskit/icon/core/add';
import LockIcon from '@atlaskit/icon/core/lock-locked';
import SearchIcon from '@atlaskit/icon/core/search';
import { Inline, Stack, Text } from '@atlaskit/primitives';

export function NavigationHeader({
  profileName,
  onLock,
  onSearch,
  onCreateNote,
  onCreateFolder,
}: {
  readonly profileName: string;
  readonly onLock: () => void;
  readonly onSearch: () => void;
  readonly onCreateNote: () => void;
  readonly onCreateFolder: () => void;
}) {
  return (
    <Stack space="space.150">
      <Inline alignBlock="center" spread="space-between">
        <Text weight="semibold" maxLines={1}>{profileName}</Text>
        <IconButton label="Lock profile" icon={LockIcon} appearance="subtle" onClick={onLock} />
      </Inline>
      <Inline alignBlock="center" space="space.050">
        <Button shouldFitContainer iconBefore={SearchIcon} onClick={onSearch}>
          Search
        </Button>
        <DropdownMenu<HTMLButtonElement>
          trigger={({ triggerRef, ...props }) => (
            <IconButton {...props} ref={triggerRef} label="Create" icon={AddIcon} appearance="primary" />
          )}
        >
          <DropdownItemGroup>
            <DropdownItem onClick={onCreateNote}>New note</DropdownItem>
            <DropdownItem onClick={onCreateFolder}>New folder</DropdownItem>
          </DropdownItemGroup>
        </DropdownMenu>
      </Inline>
    </Stack>
  );
}
