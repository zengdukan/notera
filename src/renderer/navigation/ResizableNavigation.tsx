import { useState, type ReactNode } from 'react';
import Button, { IconButton } from '@atlaskit/button/new';
import ClockIcon from '@atlaskit/icon/core/clock';
import DeleteIcon from '@atlaskit/icon/core/delete';
import SettingsIcon from '@atlaskit/icon/core/settings';
import SidebarExpandIcon from '@atlaskit/icon/core/sidebar-expand';
import StarIcon from '@atlaskit/icon/core/star-unstarred';
import {
  Main,
  Root,
  SideNav,
  SideNavBody,
  SideNavHeader,
  SideNavToggleButton,
  useToggleSideNav,
} from '@atlaskit/navigation-system';
import { SideNavPanelSplitter } from '@atlaskit/navigation-system/layout/side-nav';
import { Box, Stack, xcss } from '@atlaskit/primitives';
import Tooltip from '@atlaskit/tooltip';

import { NAVIGATION_DEFAULT_WIDTH } from './navigation-reducer';

const mainLayoutStyles = xcss({
  display: 'flex',
  height: '100vh',
  minWidth: '0',
  overflow: 'hidden',
});
const quickNavigationStyles = xcss({
  width: 'space.800',
  height: '100vh',
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
  header,
  onFavorites,
  onRecent,
  onTrash,
  onSettings,
}: {
  readonly header?: ReactNode;
  readonly onFavorites: () => void;
  readonly onRecent: () => void;
  readonly onTrash: () => void;
  readonly onSettings: () => void;
}) {
  const toggleSideNav = useToggleSideNav({ trigger: 'toggle-button' });
  return (
    <Box
      as="nav"
      aria-label="Notera quick navigation"
      xcss={quickNavigationStyles}
    >
      <Stack alignInline="center" space="space.100">
        <QuickAction
          label="Expand navigation"
          icon={SidebarExpandIcon}
          onClick={toggleSideNav}
        />
        {header}
        <QuickAction label="Favorites" icon={StarIcon} onClick={onFavorites} />
        <QuickAction label="Recent" icon={ClockIcon} onClick={onRecent} />
        <QuickAction label="Trash" icon={DeleteIcon} onClick={onTrash} />
        <QuickAction
          label="Settings"
          icon={SettingsIcon}
          onClick={onSettings}
        />
      </Stack>
    </Box>
  );
}

export function ResizableNavigation({
  header,
  collapsedHeader,
  tree,
  children,
  onFavorites,
  onRecent,
  onTrash,
  onSettings,
}: {
  readonly header: ReactNode;
  readonly collapsedHeader?: ReactNode;
  readonly tree: ReactNode;
  readonly children: ReactNode;
  readonly onFavorites: () => void;
  readonly onRecent: () => void;
  readonly onTrash: () => void;
  readonly onSettings: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <Root defaultSideNavCollapsed={false} isSideNavShortcutEnabled>
      <SideNav
        label="Notera navigation"
        defaultWidth={NAVIGATION_DEFAULT_WIDTH}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
      >
        {!collapsed ? (
          <>
            <SideNavHeader>
              <Stack space="space.100">
                <SideNavToggleButton
                  collapseLabel="Collapse navigation"
                  expandLabel="Expand navigation"
                />
                {header}
              </Stack>
            </SideNavHeader>
            <SideNavBody>
              <Stack space="space.050">
                <Button
                  appearance="subtle"
                  shouldFitContainer
                  iconBefore={StarIcon}
                  onClick={onFavorites}
                >
                  Favorites
                </Button>
                <Button
                  appearance="subtle"
                  shouldFitContainer
                  iconBefore={ClockIcon}
                  onClick={onRecent}
                >
                  Recent
                </Button>
                <Button
                  appearance="subtle"
                  shouldFitContainer
                  iconBefore={DeleteIcon}
                  onClick={onTrash}
                >
                  Trash
                </Button>
                <Button
                  appearance="subtle"
                  shouldFitContainer
                  iconBefore={SettingsIcon}
                  onClick={onSettings}
                >
                  Settings
                </Button>
                {tree}
              </Stack>
            </SideNavBody>
          </>
        ) : null}
        <SideNavPanelSplitter label="Resize navigation" />
      </SideNav>
      <Main>
        <Box xcss={mainLayoutStyles}>
          {collapsed ? (
            <QuickNavigation
              header={collapsedHeader}
              onFavorites={onFavorites}
              onRecent={onRecent}
              onTrash={onTrash}
              onSettings={onSettings}
            />
          ) : null}
          <Box xcss={centralWorkspaceStyles}>{children}</Box>
        </Box>
      </Main>
    </Root>
  );
}
