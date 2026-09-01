import { useMemo, useState } from 'react';
import Form, { Field, Fieldset, FormSection } from '@atlaskit/form';
import { Box, Stack, Text } from '@atlaskit/primitives';
import { RadioGroup } from '@atlaskit/radio';
import SectionMessage from '@atlaskit/section-message';
import Select from '@atlaskit/select';
import { useIntl } from 'react-intl';

import type { LanguagePreference, ThemePreference } from './settings-queries';

export type { LanguagePreference, ThemePreference } from './settings-queries';

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
  const intl = useIntl();
  const [updating, setUpdating] = useState(false);
  const [failed, setFailed] = useState(false);
  const themeOptions = useMemo(
    () => [
      {
        label: intl.formatMessage({ id: 'settings.theme.system' }),
        value: 'SYSTEM',
      },
      {
        label: intl.formatMessage({ id: 'settings.theme.light' }),
        value: 'LIGHT',
      },
      {
        label: intl.formatMessage({ id: 'settings.theme.dark' }),
        value: 'DARK',
      },
    ],
    [intl],
  );
  const languageOptions = useMemo(
    () => [
      {
        label: intl.formatMessage({ id: 'settings.language.chinese' }),
        value: 'zh-CN' as const,
      },
      {
        label: intl.formatMessage({ id: 'settings.language.english' }),
        value: 'en' as const,
      },
    ],
    [intl],
  );

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
    <Stack space="space.100">
      {failed ? (
        <SectionMessage
          appearance="error"
          headingLevel="h3"
          title={intl.formatMessage({ id: 'settings.updateError.title' })}
        >
          <Text as="p">
            {intl.formatMessage({ id: 'settings.updateError.description' })}
          </Text>
        </SectionMessage>
      ) : null}
      <Form<{ language: (typeof languageOptions)[number]; theme: string }>
        isDisabled={updating}
        label={intl.formatMessage({ id: 'settings.generalForm.label' })}
        onSubmit={() => undefined}
      >
        {({ disabled, formProps }) => (
          <form {...formProps}>
            <Stack space="space.100">
              <FormSection
                title={intl.formatMessage({
                  id: 'settings.sections.appearance',
                })}
              >
                <Fieldset
                  legend={
                    <Box as="span" id="settings-theme-label">
                      {intl.formatMessage({ id: 'settings.theme.label' })}
                    </Box>
                  }
                >
                  <Field
                    name="theme"
                    defaultValue={value.theme}
                    component={({ fieldProps }) => (
                      <RadioGroup
                        {...fieldProps}
                        isDisabled={disabled}
                        labelId="settings-theme-label"
                        options={themeOptions}
                        value={value.theme}
                        onChange={(event) =>
                          void updateSetting({
                            theme: event.currentTarget.value as ThemePreference,
                          })
                        }
                      />
                    )}
                  />
                </Fieldset>
              </FormSection>
              <FormSection
                title={intl.formatMessage({
                  id: 'settings.sections.language',
                })}
              >
                <Field<(typeof languageOptions)[number]>
                  name="language"
                  label={intl.formatMessage({
                    id: 'settings.language.label',
                  })}
                  defaultValue={languageOptions.find(
                    (option) => option.value === value.language,
                  )}
                  component={({ fieldProps }) => (
                    <Select
                      {...fieldProps}
                      inputId={fieldProps.id}
                      isDisabled={disabled}
                      options={languageOptions}
                      value={languageOptions.find(
                        (option) => option.value === value.language,
                      )}
                      onChange={(option) => {
                        if (option) {
                          void updateSetting({ language: option.value });
                        }
                      }}
                    />
                  )}
                />
              </FormSection>
            </Stack>
          </form>
        )}
      </Form>
    </Stack>
  );
}
