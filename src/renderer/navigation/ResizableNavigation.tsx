import type { ReactNode } from 'react';
import Button from '@atlaskit/button/new';
import {
  Main,
  Root,
  SideNav,
  SideNavBody,
  SideNavHeader,
  SideNavToggleButton,
} from '@atlaskit/navigation-system';
import { SideNavPanelSplitter } from '@atlaskit/navigation-system/layout/side-nav';
import { Stack } from '@atlaskit/primitives';

import { NAVIGATION_DEFAULT_WIDTH } from './navigation-reducer';

export function ResizableNavigation({
  header,
  tree,
  children,
  onFavorites,
  onRecent,
  onTrash,
  onSettings,
}: {
  readonly header: ReactNode;
  readonly tree: ReactNode;
  readonly children: ReactNode;
  readonly onFavorites: () => void;
  readonly onRecent: () => void;
  readonly onTrash: () => void;
  readonly onSettings: () => void;
}) {
  return (
    <Root defaultSideNavCollapsed={false} isSideNavShortcutEnabled>
      <SideNav label="Notera navigation" defaultWidth={NAVIGATION_DEFAULT_WIDTH}>
        <SideNavHeader>
          <Stack space="space.100">
            <SideNavToggleButton collapseLabel="Collapse navigation" expandLabel="Expand navigation" />
            {header}
          </Stack>
        </SideNavHeader>
        <SideNavBody>
          <Stack space="space.050">
            <Button appearance="subtle" shouldFitContainer onClick={onFavorites}>Favorites</Button>
            <Button appearance="subtle" shouldFitContainer onClick={onRecent}>Recent</Button>
            <Button appearance="subtle" shouldFitContainer onClick={onTrash}>Trash</Button>
            <Button appearance="subtle" shouldFitContainer onClick={onSettings}>Settings</Button>
            {tree}
          </Stack>
        </SideNavBody>
        <SideNavPanelSplitter label="Resize navigation" />
      </SideNav>
      <Main>{children}</Main>
    </Root>
  );
}
