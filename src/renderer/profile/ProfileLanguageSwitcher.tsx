import { useState } from 'react';
import Button from '@atlaskit/button/new';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import { useFlags } from '@atlaskit/flag';
import TranslateIcon from '@atlaskit/icon/core/translate';
import { useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';

import type { NoteraClient } from '../platform/notera-client';
import {
  updateDeviceSettings,
  type LanguagePreference,
} from '../settings/settings-queries';

export function ProfileLanguageSwitcher({
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
  );
}
