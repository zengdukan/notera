import type { CSSProperties } from 'react';
import { cssMap } from '@atlaskit/css';
import CrossIcon from '@atlaskit/icon/core/cross';
import MaximizeIcon from '@atlaskit/icon/core/maximize';
import MinimizeIcon from '@atlaskit/icon/core/minimize';
import Image from '@atlaskit/image';
import {
  TopNav,
  TopNavEnd,
  TopNavMiddle,
  TopNavStart,
} from '@atlaskit/navigation-system/layout/top-nav';
import { EndItem } from '@atlaskit/navigation-system/top-nav-items';
import { Box, Inline, Text } from '@atlaskit/primitives/compiled';
import Tile from '@atlaskit/tile';
import { useIntl } from 'react-intl';

import logoSrc from '../../../assets/icon.svg';
import type { NoteraClient } from '../platform/notera-client';
import { WindowLanguageSwitcher } from './WindowLanguageSwitcher';
import './WindowTitleBar.css';

const styles = cssMap({
  dragRegion: {
    width: '100%',
    height: '100%',
  },
});

const dragRegionStyle = {
  WebkitAppRegion: 'drag',
} as CSSProperties;

export function WindowTitleBar({ client }: { readonly client: NoteraClient }) {
  const intl = useIntl();
  const invoke = (
    key: 'app.minimizeWindow' | 'app.toggleMaximizeWindow' | 'app.closeWindow',
  ) => {
    void client.request(key, {}).catch(() => undefined);
  };

  return (
    <TopNav testId="notera-window-title-bar">
      <TopNavStart sideNavToggleButton={null}>
        <Inline alignBlock="center" space="space.100">
          <Tile
            label=""
            size="small"
            backgroundColor="color.background.brand.bold"
          >
            <Image src={logoSrc} alt="" width="16" height="16" />
          </Tile>
          <Text weight="semibold">
            {intl.formatMessage({ id: 'app.name' })}
          </Text>
        </Inline>
      </TopNavStart>
      <TopNavMiddle>
        <Box
          testId="notera-window-drag-region"
          xcss={styles.dragRegion}
          style={dragRegionStyle}
        />
      </TopNavMiddle>
      <TopNavEnd
        label={intl.formatMessage({ id: 'window.controls' })}
        showMoreButtonLabel={intl.formatMessage({ id: 'window.controls' })}
      >
        <WindowLanguageSwitcher client={client} />
        <EndItem
          icon={MinimizeIcon}
          label={intl.formatMessage({ id: 'window.minimize' })}
          onClick={() => invoke('app.minimizeWindow')}
        />
        <EndItem
          icon={MaximizeIcon}
          label={intl.formatMessage({ id: 'window.toggleMaximize' })}
          onClick={() => invoke('app.toggleMaximizeWindow')}
        />
        <EndItem
          icon={CrossIcon}
          label={intl.formatMessage({ id: 'window.close' })}
          onClick={() => invoke('app.closeWindow')}
          testId="notera-window-close"
        />
      </TopNavEnd>
    </TopNav>
  );
}
