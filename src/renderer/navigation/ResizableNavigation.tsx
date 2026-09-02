import { useState, type ReactNode } from 'react';
import Avatar, { AvatarContent } from '@atlaskit/avatar';
import { IconButton } from '@atlaskit/button/new';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import AddIcon from '@atlaskit/icon/core/add';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ClockIcon from '@atlaskit/icon/core/clock';
import DeleteIcon from '@atlaskit/icon/core/delete';
import LockIcon from '@atlaskit/icon/core/lock-locked';
import SearchIcon from '@atlaskit/icon/core/search';
import SettingsIcon from '@atlaskit/icon/core/settings';
import SidebarExpandIcon from '@atlaskit/icon/core/sidebar-expand';
import StarIcon from '@atlaskit/icon/core/star-unstarred';
import { Main } from '@atlaskit/navigation-system/layout/main';
import { Root } from '@atlaskit/navigation-system/layout/root';
import {
  SideNav,
  SideNavBody,
  SideNavHeader,
  SideNavPanelSplitter,
  SideNavToggleButton,
  useToggleSideNav,
} from '@atlaskit/navigation-system/layout/side-nav';
import {
  Box,
  Inline,
  Pressable,
  Stack,
  Text,
  xcss,
} from '@atlaskit/primitives';
import { Show } from '@atlaskit/primitives/responsive';
import { useIntl } from 'react-intl';
import { ButtonMenuItem } from '@atlaskit/side-nav-items/button-menu-item';
import { MenuList } from '@atlaskit/side-nav-items/menu-list';
import {
  Divider,
  MenuSection,
  MenuSectionHeading,
} from '@atlaskit/side-nav-items/menu-section';
import { token } from '@atlaskit/tokens';
import Tooltip from '@atlaskit/tooltip';

import { NAVIGATION_DEFAULT_WIDTH } from './navigation-reducer';
import './ResizableNavigation.css';

const mainLayoutStyles = xcss({
  display: 'flex',
  height: '100%',
  minWidth: '0',
  overflow: 'hidden',
});
const quickNavigationStyles = xcss({
  width: 'space.800',
  height: '100%',
  flexShrink: '0',
  boxSizing: 'border-box',
  paddingBlock: 'space.100',
  backgroundColor: 'elevation.surface',
  borderInlineEndColor: 'color.border',
  borderInlineEndStyle: 'solid',
  borderInlineEndWidth: 'border.width',
});
const centralWorkspaceStyles = xcss({
  flexGrow: '1',
  minWidth: '0',
  height: '100%',
  overflow: 'hidden',
});
const sideNavBodyContentStyles = xcss({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: '0',
  overflow: 'hidden',
});
const workspaceSectionStyles = xcss({ flexShrink: 0 });
const notesSectionStyles = xcss({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  height: '100%',
  minHeight: '0',
  overflow: 'hidden',
});
const notesHeadingStyles = xcss({ paddingInlineEnd: 'space.050' });
const noteTreeScrollStyles = xcss({
  flexGrow: 1,
  minHeight: '0',
  overflowX: 'hidden',
  overflowY: 'auto',
});
const profileMenuStyles = xcss({ minWidth: '0', flexShrink: 1 });
const profileMenuTriggerStyles = xcss({
  maxWidth: '100%',
  paddingBlock: 'space.050',
  paddingInline: 'space.075',
  backgroundColor: 'color.background.neutral.subtle',
  borderRadius: 'radius.small',
  color: 'color.text.subtle',
  ':hover': {
    backgroundColor: 'color.background.neutral.subtle.hovered',
  },
  ':active': {
    backgroundColor: 'color.background.neutral.subtle.pressed',
  },
});
const compactProfileMenuTriggerStyles = xcss({
  padding: 'space.050',
  backgroundColor: 'color.background.neutral.subtle',
  borderRadius: 'radius.small',
  color: 'color.text.subtle',
  ':hover': {
    backgroundColor: 'color.background.neutral.subtle.hovered',
  },
  ':active': {
    backgroundColor: 'color.background.neutral.subtle.pressed',
  },
});
const selectedProfileMenuTriggerStyles = xcss({
  backgroundColor: 'color.background.neutral.subtle.pressed',
});
const profileNameStyles = xcss({
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

function ProfileMenu({
  profileName,
  compact = false,
  onLock,
  onSettings,
}: {
  readonly profileName: string;
  readonly compact?: boolean;
  readonly onLock: () => void;
  readonly onSettings: () => void;
}) {
  const profileInitial = Array.from(profileName.trim())[0]?.toLocaleUpperCase();

  return (
    <Box xcss={compact ? undefined : profileMenuStyles}>
      <DropdownMenu<HTMLButtonElement>
        shouldRenderToParent
        placement="bottom-start"
        menuLabel="Profile actions"
        trigger={({ triggerRef, isSelected, onClick, ...triggerProps }) => (
          <Pressable
            {...triggerProps}
            ref={triggerRef}
            xcss={[
              compact
                ? compactProfileMenuTriggerStyles
                : profileMenuTriggerStyles,
              isSelected && selectedProfileMenuTriggerStyles,
            ]}
            style={{ overflowY: 'visible' }}
            aria-label={`Open ${profileName} profile menu`}
            onClick={(event) => onClick?.(event)}
          >
            <Inline
              as="span"
              alignBlock="center"
              space="space.075"
              shouldWrap={false}
            >
              <Avatar
                name={profileName}
                size="medium"
                as="span"
                borderColor={token('color.background.accent.blue.subtlest')}
              >
                <AvatarContent>
                  <Text
                    align="center"
                    color="color.text.accent.blue"
                    weight="semibold"
                  >
                    {profileInitial}
                  </Text>
                </AvatarContent>
              </Avatar>
              {compact ? null : (
                <>
                  <Box as="span" xcss={profileNameStyles}>
                    <Text weight="semibold">{profileName}</Text>
                  </Box>
                  <ChevronDownIcon label="" color="currentColor" />
                </>
              )}
            </Inline>
          </Pressable>
        )}
      >
        <DropdownItemGroup>
          <DropdownItem
            elemBefore={<LockIcon label="" color="currentColor" />}
            onClick={onLock}
          >
            Lock profile
          </DropdownItem>
          <DropdownItem
            elemBefore={<SettingsIcon label="" color="currentColor" />}
            onClick={onSettings}
          >
            Settings
          </DropdownItem>
        </DropdownItemGroup>
      </DropdownMenu>
    </Box>
  );
}

function QuickAction({
  label,
  icon,
  onClick,
}: {
  readonly label: string;
  readonly icon: typeof StarIcon;
  readonly onClick: () => void;
}) {
  return (
    <Tooltip content={label} position="right">
      <IconButton
        label={label}
        icon={icon}
        appearance="subtle"
        onClick={onClick}
      />
    </Tooltip>
  );
}

function QuickNavigation({
  profileName,
  onSearch,
  onFavorites,
  onRecent,
  onTrash,
  onLock,
  onSettings,
}: {
  readonly profileName: string;
  readonly onSearch: () => void;
  readonly onFavorites: () => void;
  readonly onRecent: () => void;
  readonly onTrash: () => void;
  readonly onLock: () => void;
  readonly onSettings: () => void;
}) {
  const intl = useIntl();
  const toggleSideNav = useToggleSideNav({ trigger: 'toggle-button' });

  return (
    <Box
      as="nav"
      aria-label="Notera quick navigation"
      testId="notera-quick-navigation"
      xcss={quickNavigationStyles}
    >
      <Stack alignInline="center" space="space.100">
        <QuickAction
          label="Expand sidebar"
          icon={SidebarExpandIcon}
          onClick={toggleSideNav}
        />
        <ProfileMenu
          compact
          profileName={profileName}
          onLock={onLock}
          onSettings={onSettings}
        />
        <QuickAction label="Search" icon={SearchIcon} onClick={onSearch} />
        <QuickAction label="Favorites" icon={StarIcon} onClick={onFavorites} />
        <QuickAction label="Recent" icon={ClockIcon} onClick={onRecent} />
        <QuickAction
          label={intl.formatMessage({ id: 'trash.title' })}
          icon={DeleteIcon}
          onClick={onTrash}
        />
      </Stack>
    </Box>
  );
}

export function ResizableNavigation({
  profileName,
  tree,
  children,
  onSearch,
  onFavorites,
  onRecent,
  onTrash,
  onCreateNote,
  onCreateFolder,
  onLock,
  onSettings,
}: {
  readonly profileName: string;
  readonly tree: ReactNode;
  readonly children: ReactNode;
  readonly onSearch: () => void;
  readonly onFavorites: () => void;
  readonly onRecent: () => void;
  readonly onTrash: () => void;
  readonly onCreateNote: () => void;
  readonly onCreateFolder: () => void;
  readonly onLock: () => void;
  readonly onSettings: () => void;
}) {
  const intl = useIntl();
  const [isSideNavCollapsedOnDesktop, setIsSideNavCollapsedOnDesktop] =
    useState(false);
  const quickNavigation = (
    <QuickNavigation
      profileName={profileName}
      onSearch={onSearch}
      onFavorites={onFavorites}
      onRecent={onRecent}
      onTrash={onTrash}
      onLock={onLock}
      onSettings={onSettings}
    />
  );

  return (
    <Root defaultSideNavCollapsed={false} isSideNavShortcutEnabled>
      <SideNav
        testId={
          isSideNavCollapsedOnDesktop ? undefined : 'notera-expanded-side-nav'
        }
        label="Notera navigation"
        defaultWidth={NAVIGATION_DEFAULT_WIDTH}
        onCollapse={({ screen }) => {
          if (screen === 'desktop') setIsSideNavCollapsedOnDesktop(true);
        }}
        onExpand={({ screen }) => {
          if (screen === 'desktop') setIsSideNavCollapsedOnDesktop(false);
        }}
      >
        <SideNavHeader>
          <Inline alignBlock="center" spread="space-between">
            <ProfileMenu
              profileName={profileName}
              onLock={onLock}
              onSettings={onSettings}
            />
            <SideNavToggleButton
              collapseLabel="Collapse sidebar"
              expandLabel="Expand sidebar"
            />
          </Inline>
        </SideNavHeader>
        <SideNavBody>
          <Box xcss={sideNavBodyContentStyles}>
            <Box xcss={workspaceSectionStyles}>
              <MenuSection ariaLabel="Workspace">
                <MenuList>
                  <ButtonMenuItem
                    elemBefore={<SearchIcon label="" color="currentColor" />}
                    onClick={onSearch}
                  >
                    Search
                  </ButtonMenuItem>
                  <ButtonMenuItem
                    elemBefore={<StarIcon label="" color="currentColor" />}
                    onClick={onFavorites}
                  >
                    Favorites
                  </ButtonMenuItem>
                  <ButtonMenuItem
                    elemBefore={<ClockIcon label="" color="currentColor" />}
                    onClick={onRecent}
                  >
                    Recent
                  </ButtonMenuItem>
                  <ButtonMenuItem
                    elemBefore={<DeleteIcon label="" color="currentColor" />}
                    onClick={onTrash}
                  >
                    {intl.formatMessage({ id: 'trash.title' })}
                  </ButtonMenuItem>
                </MenuList>
              </MenuSection>
            </Box>
            <Box testId="notera-notes-area" xcss={notesSectionStyles}>
              <MenuSection ariaLabel="Notes" testId="notera-notes-menu-section">
                <Divider />
                <Inline
                  xcss={notesHeadingStyles}
                  alignBlock="center"
                  spread="space-between"
                >
                  <MenuSectionHeading headingLevel={2}>
                    Notes
                  </MenuSectionHeading>
                  <DropdownMenu<HTMLButtonElement>
                    shouldRenderToParent
                    placement="bottom-start"
                    trigger={({ triggerRef, ...triggerProps }) => (
                      <IconButton
                        {...triggerProps}
                        ref={triggerRef}
                        label="Create note or folder"
                        icon={AddIcon}
                        appearance="subtle"
                        spacing="compact"
                      />
                    )}
                  >
                    <DropdownItemGroup>
                      <DropdownItem onClick={onCreateNote}>
                        New Note
                      </DropdownItem>
                      <DropdownItem onClick={onCreateFolder}>
                        New folder
                      </DropdownItem>
                    </DropdownItemGroup>
                  </DropdownMenu>
                </Inline>
                <Box
                  testId="notera-note-tree-scroll-container"
                  xcss={noteTreeScrollStyles}
                >
                  {tree}
                </Box>
              </MenuSection>
            </Box>
          </Box>
        </SideNavBody>
        <SideNavPanelSplitter label="Resize navigation" />
      </SideNav>
      <Main>
        <Box xcss={mainLayoutStyles}>
          {isSideNavCollapsedOnDesktop ? (
            quickNavigation
          ) : (
            <Show below="md">{quickNavigation}</Show>
          )}
          <Box xcss={centralWorkspaceStyles}>{children}</Box>
        </Box>
      </Main>
    </Root>
  );
}
