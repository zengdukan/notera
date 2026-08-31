import { useState } from 'react';
import { Stack } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Select from '@atlaskit/select';

export type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK';
export type LanguagePreference = 'zh-CN' | 'en';

const themeOptions = [
  { label: 'System', value: 'SYSTEM' as const },
  { label: 'Light', value: 'LIGHT' as const },
  { label: 'Dark', value: 'DARK' as const },
];
const languageOptions = [
  { label: '简体中文', value: 'zh-CN' as const },
  { label: 'English', value: 'en' as const },
];

export function GeneralSettings({
  value,
  onUpdate,
}: {
  readonly value: {
    readonly theme: ThemePreference;
    readonly language: LanguagePreference;
  };
  readonly onUpdate: (
    update: Partial<{ theme: ThemePreference; language: LanguagePreference }>,
  ) => Promise<unknown> | unknown;
}) {
  const [updating, setUpdating] = useState(false);
  const [failed, setFailed] = useState(false);

  const updateSetting = async (
    update: Partial<{
      theme: ThemePreference;
      language: LanguagePreference;
    }>,
  ) => {
    setFailed(false);
    setUpdating(true);
    try {
      await onUpdate(update);
    } catch {
      setFailed(true);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Stack space="space.300">
      {failed ? (
        <SectionMessage appearance="error" title="Settings were not updated">
          <p>Try again. Your previous settings are still active.</p>
        </SectionMessage>
      ) : null}
      <fieldset className="notera-settings-fieldset">
        <legend>Theme</legend>
        <div
          aria-label="Theme"
          className="notera-theme-options"
          role="radiogroup"
        >
          {themeOptions.map((option) => {
            const id = `settings-theme-${option.value.toLowerCase()}`;
            return (
              <div className="notera-theme-option" key={option.value}>
                <input
                  checked={value.theme === option.value}
                  disabled={updating}
                  id={id}
                  name="settings-theme"
                  onChange={() => void updateSetting({ theme: option.value })}
                  type="radio"
                  value={option.value}
                />
                <label htmlFor={id}>{option.label}</label>
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="notera-settings-field">
        <label htmlFor="settings-language">Language</label>
        <Select
          inputId="settings-language"
          aria-label="Language"
          isDisabled={updating}
          options={languageOptions}
          value={languageOptions.find(
            (option) => option.value === value.language,
          )}
          onChange={(option) => {
            if (option) void updateSetting({ language: option.value });
          }}
        />
      </div>
    </Stack>
  );
}
