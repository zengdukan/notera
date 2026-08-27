import { Stack } from '@atlaskit/primitives';
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
  return (
    <Stack space="space.200">
      <Select
        inputId="settings-theme"
        aria-label="Theme"
        options={themeOptions}
        value={themeOptions.find((option) => option.value === value.theme)}
        onChange={(option) => {
          if (option) void onUpdate({ theme: option.value });
        }}
      />
      <Select
        inputId="settings-language"
        aria-label="Language"
        options={languageOptions}
        value={languageOptions.find((option) => option.value === value.language)}
        onChange={(option) => {
          if (option) void onUpdate({ language: option.value });
        }}
      />
    </Stack>
  );
}
