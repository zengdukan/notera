import { useEffect, useState, type ReactNode } from 'react';
import Avatar, { AvatarContent } from '@atlaskit/avatar';
import Button from '@atlaskit/button/new';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import ChevronDownIcon from '@atlaskit/icon/core/chevron-down';
import ClockIcon from '@atlaskit/icon/core/clock';
import DeleteIcon from '@atlaskit/icon/core/delete';
import LockIcon from '@atlaskit/icon/core/lock-locked';
import SettingsIcon from '@atlaskit/icon/core/settings';
import StarIcon from '@atlaskit/icon/core/star-unstarred';
import { Main } from '@atlaskit/navigation-system/layout/main';
import { PanelSplitter } from '@atlaskit/navigation-system/layout/panel-splitter';
import { Root } from '@atlaskit/navigation-system/layout/root';
import {
  SideNav,
  SideNavBody,
  SideNavHeader,
  SideNavToggleButton,
} from '@atlaskit/navigation-system/layout/side-nav';
import { Box, Inline, Text, xcss } from '@atlaskit/primitives';
import { ButtonMenuItem } from '@atlaskit/side-nav-items/button-menu-item';
import { MenuList } from '@atlaskit/side-nav-items/menu-list';
import {
  Divider,
  MenuSection,
  MenuSectionHeading,
} from '@atlaskit/side-nav-items/menu-section';

import { NAVIGATION_DEFAULT_WIDTH } from './navigation-reducer';
import './ResizableNavigation.css';

const DESKTOP_NAVIGATION_QUERY = '(min-width: 64rem)';

function startsCollapsed(): boolean {
  if (typeof window === 'undefined' || window.matchMedia === undefined) {
    return false;
  }
  return !window.matchMedia(DESKTOP_NAVIGATION_QUERY).matches;
}

const centralWorkspaceStyles = xcss({
  minWidth: '0',
  height: '100%',
  overflow: 'hidden',
});
const profileMenuStyles = xcss({ minWidth: '0', flexShrink: 1 });
const profileNameStyles = xcss({
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export function ResizableNavigation({
  profileName,
  tree,
  children,
  onFavorites,
  onRecent,
  onTrash,
  onLock,
  onSettings,
}: {
  readonly profileName: string;
  readonly tree: ReactNode;
  readonly children: ReactNode;
  readonly onFavorites: () => void;
  readonly onRecent: () => void;
  readonly onTrash: () => void;
  readonly onLock: () => void;
  readonly onSettings: () => void;
}) {
  const [collapsed, setCollapsed] = useState(startsCollapsed);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_NAVIGATION_QUERY);
    const syncWithViewport = (event?: MediaQueryListEvent) => {
      setCollapsed(!(event?.matches ?? mediaQuery.matches));
    };
    syncWithViewport();
    mediaQuery.addEventListener('change', syncWithViewport);
    return () => mediaQuery.removeEventListener('change', syncWithViewport);
  }, []);

  return (
    <Root defaultSideNavCollapsed={collapsed} isSideNavShortcutEnabled>
      <SideNav
        testId={collapsed ? undefined : 'notera-expanded-side-nav'}
        label="Notera navigation"
        defaultWidth={NAVIGATION_DEFAULT_WIDTH}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
      >
        <SideNavHeader>
          <Inline alignBlock="center" spread="space-between">
            <Box xcss={profileMenuStyles}>
              <DropdownMenu<HTMLButtonElement>
                placement="bottom-start"
                menuLabel="Profile actions"
                trigger={({ triggerRef, ...triggerProps }) => (
                  <Button
                    {...triggerProps}
                    ref={triggerRef}
                    appearance="subtle"
                    spacing="compact"
                    aria-label={`Open ${profileName} profile menu`}
                  >
                    <Inline
                      as="span"
                      alignBlock="center"
                      space="space.075"
                      shouldWrap={false}
                    >
                      <Avatar name={profileName} size="medium" as="span">
                        <AvatarContent>
                          <Text align="center" weight="semibold">
                            {Array.from(profileName.trim())[0]}
                          </Text>
                        </AvatarContent>
                      </Avatar>
                      <Box as="span" xcss={profileNameStyles}>
                        <Text weight="semibold">{profileName}</Text>
                      </Box>
                      <ChevronDownIcon label="" color="currentColor" />
                    </Inline>
                  </Button>
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
                    elemBefore={
                      <SettingsIcon label="" color="currentColor" />
                    }
                    onClick={onSettings}
                  >
                    Settings
                  </DropdownItem>
                </DropdownItemGroup>
              </DropdownMenu>
            </Box>
            <SideNavToggleButton
              collapseLabel="Collapse sidebar"
              expandLabel="Expand sidebar"
            />
          </Inline>
        </SideNavHeader>
        <SideNavBody>
          <MenuSection ariaLabel="Workspace">
            <MenuList>
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
                Trash
              </ButtonMenuItem>
            </MenuList>
          </MenuSection>
          <MenuSection ariaLabel="Content">
            <Divider />
            <MenuSectionHeading headingLevel={2}>Content</MenuSectionHeading>
            {tree}
          </MenuSection>
        </SideNavBody>
        <PanelSplitter label="Resize navigation" />
      </SideNav>
      <Main>
        <Box xcss={centralWorkspaceStyles}>{children}</Box>
      </Main>
    </Root>
  );
}
