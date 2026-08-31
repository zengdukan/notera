import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import LockIcon from '@atlaskit/icon/core/lock-locked';
import { SideNavToggleButton } from '@atlaskit/navigation-system/layout/side-nav';
import {
  TopNavEnd,
  TopNavMiddle,
  TopNavStart,
} from '@atlaskit/navigation-system/layout/top-nav';
import {
  CreateButton,
  CustomTitle,
  EndItem,
  Search,
  Settings,
} from '@atlaskit/navigation-system/top-nav-items';
import { Inline, Text } from '@atlaskit/primitives';

export function NavigationHeader({
  profileName,
  onLock,
  onSearch,
  onCreateNote,
  onCreateFolder,
  onSettings,
}: {
  readonly profileName: string;
  readonly onLock: () => void;
  readonly onSearch: () => void;
  readonly onCreateNote: () => void;
  readonly onCreateFolder: () => void;
  readonly onSettings: () => void;
}) {
  const createMenu = (
    <DropdownMenu<HTMLButtonElement>
      shouldRenderToParent
      trigger={({ triggerRef, ...props }) => (
        <CreateButton {...props} ref={triggerRef}>
          Create
        </CreateButton>
      )}
    >
      <DropdownItemGroup>
        <DropdownItem onClick={onCreateNote}>New note</DropdownItem>
        <DropdownItem onClick={onCreateFolder}>New folder</DropdownItem>
      </DropdownItemGroup>
    </DropdownMenu>
  );

  return (
    <>
      <TopNavStart
        sideNavToggleButton={
          <SideNavToggleButton
            collapseLabel="Collapse navigation"
            expandLabel="Expand navigation"
          />
        }
      >
        <CustomTitle>
          <Inline alignBlock="center" space="space.100">
            <Text weight="bold">Notera</Text>
            <Text color="color.text.subtle">{profileName}</Text>
          </Inline>
        </CustomTitle>
      </TopNavStart>
      <TopNavMiddle>
        <Search
          label="Search"
          elemAfter={<Text color="color.text.subtle">Ctrl + J</Text>}
          onClick={onSearch}
        />
        {createMenu}
      </TopNavMiddle>
      <TopNavEnd
        label="Profile actions"
        showMoreButtonLabel="Show profile actions"
      >
        <Settings label="Settings" onClick={onSettings} />
        <EndItem icon={LockIcon} label="Lock profile" onClick={onLock} />
      </TopNavEnd>
    </>
  );
}
