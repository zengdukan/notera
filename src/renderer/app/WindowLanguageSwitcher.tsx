import { useState } from 'react';
import DropdownMenu, {
  DropdownItem,
  DropdownItemGroup,
} from '@atlaskit/dropdown-menu';
import { useFlags } from '@atlaskit/flag';
import TranslateIcon from '@atlaskit/icon/core/translate';
import {
  EndItem,
  MenuListItem,
} from '@atlaskit/navigation-system/top-nav-items';
import { useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';

import type { NoteraClient } from '../platform/notera-client';
import {
  updateDeviceSettings,
  type LanguagePreference,
} from '../settings/settings-queries';

export function WindowLanguageSwitcher({
  client,
}: {
  readonly client: NoteraClient;
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
  const languageLabel = intl.formatMessage({
    id:
      language === 'zh-CN'
        ? 'settings.language.chinese'
        : 'settings.language.english',
  });

  const changeLanguage = async (next: LanguagePreference) => {
    if (next === language || updating) return;
    setUpdating(true);
    try {
      await updateDeviceSettings(client, queryClient, { language: next });
    } catch {
      showFlag({
        id: 'window-language-error',
        appearance: 'error',
        isAutoDismiss: true,
        title: intl.formatMessage({ id: 'window.language.error' }),
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <MenuListItem>
      <DropdownMenu<HTMLButtonElement>
        shouldRenderToParent
        placement="bottom-end"
        menuLabel={intl.formatMessage({ id: 'settings.language.label' })}
        trigger={({ triggerRef, ...triggerProps }) => (
          <EndItem
            {...triggerProps}
            ref={triggerRef}
            icon={TranslateIcon}
            label={languageLabel}
            isListItem={false}
            testId="notera-window-language"
          />
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
    </MenuListItem>
  );
}
