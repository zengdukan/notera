import { useEffect, useState, type ReactNode } from 'react';
import ClockIcon from '@atlaskit/icon/core/clock';
import DeleteIcon from '@atlaskit/icon/core/delete';
import StarIcon from '@atlaskit/icon/core/star-unstarred';
import { Main } from '@atlaskit/navigation-system/layout/main';
import { PanelSplitter } from '@atlaskit/navigation-system/layout/panel-splitter';
import { Root } from '@atlaskit/navigation-system/layout/root';
import {
  SideNav,
  SideNavBody,
} from '@atlaskit/navigation-system/layout/side-nav';
import { TopNav } from '@atlaskit/navigation-system/layout/top-nav';
import { Box, xcss } from '@atlaskit/primitives';
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

export function ResizableNavigation({
  header,
  tree,
  children,
  onFavorites,
  onRecent,
  onTrash,
}: {
  readonly header: ReactNode;
  readonly tree: ReactNode;
  readonly children: ReactNode;
  readonly onFavorites: () => void;
  readonly onRecent: () => void;
  readonly onTrash: () => void;
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
      <TopNav>{header}</TopNav>
      <SideNav
        testId={collapsed ? undefined : 'notera-expanded-side-nav'}
        label="Notera navigation"
        defaultWidth={NAVIGATION_DEFAULT_WIDTH}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
      >
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
