import Heading from '@atlaskit/heading';
import Button from '@atlaskit/button/new';
import Image from '@atlaskit/image';
import Tile from '@atlaskit/tile';
import { cssMap } from '@atlaskit/css';
import { Box, Inline, Text } from '@atlaskit/primitives/compiled';
import { FormattedMessage, useIntl } from 'react-intl';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import TranslateIcon from '@atlaskit/icon/core/translate';
import { useState } from 'react';
import { useFlags } from '@atlaskit/flag';
import { useQueryClient } from '@tanstack/react-query';
import type { NoteraClient } from '../platform/notera-client';
import {
  updateDeviceSettings,
  type LanguagePreference,
} from '../settings/settings-queries';

import logoSrc from '../../../assets/icon.svg';

/* eslint-disable @atlaskit/design-system/no-unsafe-design-token-usage */

const headerStyles = cssMap({
  root: {
    minHeight: '72px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBlockEndColor: 'var(--ds-border)',
    borderBlockEndWidth: 'var(--ds-border-width)',
    borderBlockEndStyle: 'solid',
  },
});

export function ProfileAccessHeader({
  client,
}: {
  readonly client?: NoteraClient;
}) {
  const queryClient = useQueryClient();
  const intl = useIntl();
  const { showFlag } = useFlags();
  const [updating, setUpdating] = useState(false);
  const language =
    queryClient.getQueryData<{ language: LanguagePreference }>([
      'device',
      'settings',
    ])?.language ?? 'en';
  const changeLanguage = async (next: LanguagePreference) => {
    if (!client || next === language || updating) return;
    setUpdating(true);
    try {
      await updateDeviceSettings(client, queryClient, { language: next });
    } catch {
      showFlag({
        id: 'profile-language-error',
        appearance: 'error',
        isAutoDismiss: true,
        title: intl.formatMessage({ id: 'profile.language.error' }),
      });
    } finally {
      setUpdating(false);
    }
  };
  return (
    <Box
      as="header"
      backgroundColor="elevation.surface"
      paddingInline="space.400"
      paddingBlock="space.200"
      xcss={headerStyles.root}
    >
      <Inline space="space.100" alignBlock="center">
        <Tile
          label=""
          size="medium"
          backgroundColor="color.background.brand.bold"
        >
          <Image src={logoSrc} alt="" width="24" height="24" />
        </Tile>
        <Heading size="medium">
          <FormattedMessage id="app.name" />
        </Heading>
      </Inline>
      <Inline space="space.200" alignBlock="center">
        <DropdownMenu
          trigger={({ triggerRef, ...triggerProps }) => (
            <Button
              {...triggerProps}
              ref={triggerRef}
              appearance="subtle"
              iconBefore={TranslateIcon}
              isDisabled={!client || updating}
            >
              {intl.formatMessage({
                id:
                  language === 'zh-CN'
                    ? 'settings.language.chinese'
                    : 'settings.language.english',
              })}
            </Button>
          )}
        >
          <DropdownItemGroup
            title={intl.formatMessage({ id: 'settings.language.label' })}
          >
            <DropdownItem
              isSelected={language === 'en'}
              isDisabled={updating}
              onClick={() => void changeLanguage('en')}
            >
              {intl.formatMessage({ id: 'settings.language.english' })}
            </DropdownItem>
            <DropdownItem
              isSelected={language === 'zh-CN'}
              isDisabled={updating}
              onClick={() => void changeLanguage('zh-CN')}
            >
              {intl.formatMessage({ id: 'settings.language.chinese' })}
            </DropdownItem>
          </DropdownItemGroup>
        </DropdownMenu>
      </Inline>
    </Box>
  );
}
