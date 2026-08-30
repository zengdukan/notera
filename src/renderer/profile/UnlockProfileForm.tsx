import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Form, {
  ErrorMessage,
  Field,
  HelperMessage,
  MessageWrapper,
} from '@atlaskit/form';
import { Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Textfield from '@atlaskit/textfield';
import { useIntl } from 'react-intl';

import {
  fieldErrorForProfileOperation,
  localizedProfileFormMessages,
  systemErrorForProfileOperation,
  validatePassword,
  type ProfileFormError,
} from './profile-form';

import type { ProfileListItem } from './ProfileList';

export function UnlockProfileForm({
  profile,
  onUnlock,
  isDisabled = false,
}: {
  readonly profile: ProfileListItem;
  readonly onUnlock: (value: {
    readonly localProfileId: string;
    readonly password: string;
  }) => Promise<void> | void;
  readonly isDisabled?: boolean;
}) {
  const [systemError, setSystemError] = useState<ProfileFormError>();
  const intl = useIntl();
  const messages = localizedProfileFormMessages(intl);

  if (systemError) {
    return (
      <Stack space="space.200">
        <SectionMessage
          appearance="error"
          headingLevel="h3"
          title={systemError.title}
        >
          <Text as="p">{systemError.description}</Text>
        </SectionMessage>
        <Button
          appearance="primary"
          shouldFitContainer
          onClick={() => setSystemError(undefined)}
        >
          {intl.formatMessage({ id: 'profile.form.retry' })}
        </Button>
      </Stack>
    );
  }

  return (
    <Form<{ password: string }>
      onSubmit={async ({ password }) => {
        setSystemError(undefined);
        try {
          await onUnlock({
            localProfileId: profile.localProfileId,
            password,
          });
          return undefined;
        } catch (error) {
          const fieldError = fieldErrorForProfileOperation(error, messages);
          if (fieldError) return fieldError;
          setSystemError(
            systemErrorForProfileOperation(error, 'unlock', messages),
          );
          return undefined;
        }
      }}
    >
      {({ formProps, submitting }) => (
        <form {...formProps}>
          <Stack space="space.300">
            <Field
              name="password"
              label={intl.formatMessage({ id: 'profile.form.passwordLabel' })}
              isRequired
              isDisabled={submitting || isDisabled}
              defaultValue=""
              validate={(value) => validatePassword(value, messages)}
            >
              {({ fieldProps, error, meta }) => (
                <>
                  <Textfield
                    {...fieldProps}
                    type="password"
                    autoFocus
                    isInvalid={Boolean(
                      error && (meta.touched || meta.submitFailed),
                    )}
                  />
                  <MessageWrapper>
                    {error && (meta.touched || meta.submitFailed) ? (
                      <ErrorMessage>{error}</ErrorMessage>
                    ) : (
                      <HelperMessage>
                        {intl.formatMessage({
                          id: 'profile.form.passwordManager',
                        })}
                      </HelperMessage>
                    )}
                  </MessageWrapper>
                </>
              )}
            </Field>
            <Button
              appearance="primary"
              type="submit"
              isDisabled={isDisabled}
              isLoading={submitting}
              shouldFitContainer
            >
              {intl.formatMessage({
                id: submitting
                  ? 'profile.unlock.submitting'
                  : 'profile.unlock.submit',
              })}
            </Button>
          </Stack>
        </form>
      )}
    </Form>
  );
}
