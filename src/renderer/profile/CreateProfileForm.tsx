import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Form, { ErrorMessage, Field, MessageWrapper } from '@atlaskit/form';
import { Stack, Text } from '@atlaskit/primitives/compiled';
import SectionMessage from '@atlaskit/section-message';
import Textfield from '@atlaskit/textfield';
import { useIntl } from 'react-intl';
import { PasswordTextfield } from '../shared-ui/PasswordTextfield';

import {
  fieldErrorForProfileOperation,
  localizedProfileFormMessages,
  systemErrorForProfileOperation,
  validateNewProfilePassword,
  validateProfileName,
  type ProfileFormError,
} from './profile-form';

export function CreateProfileForm({
  onCreate,
  isDisabled = false,
}: {
  readonly onCreate: (value: {
    readonly displayName: string;
    readonly password: string;
  }) => Promise<void> | void;
  readonly isDisabled?: boolean;
}) {
  const [systemError, setSystemError] = useState<ProfileFormError>();
  const intl = useIntl();
  const messages = localizedProfileFormMessages(intl);

  return (
    <Form<{ displayName: string; password: string; confirmPassword: string }>
      onSubmit={async ({ displayName, password, confirmPassword }) => {
        setSystemError(undefined);
        if (password !== confirmPassword) {
          return { confirmPassword: messages.passwordMismatch };
        }
        try {
          await onCreate({ displayName: displayName.trim(), password });
          return undefined;
        } catch (error) {
          const fieldError = fieldErrorForProfileOperation(error, messages);
          if (fieldError) return fieldError;
          setSystemError(
            systemErrorForProfileOperation(error, 'create', messages),
          );
          return undefined;
        }
      }}
    >
      {({ formProps, submitting }) => (
        <form {...formProps}>
          <Stack space="space.200">
            {systemError ? (
              <SectionMessage
                appearance="error"
                headingLevel="h3"
                title={systemError.title}
              >
                <Text as="p">{systemError.description}</Text>
              </SectionMessage>
            ) : null}
            <Field
              name="displayName"
              label={intl.formatMessage({ id: 'profile.form.nameLabel' })}
              isRequired
              isDisabled={submitting || isDisabled}
              defaultValue=""
              validate={(value) => validateProfileName(value, messages)}
            >
              {({ fieldProps, error, meta }) => (
                <>
                  <Textfield
                    {...fieldProps}
                    autoFocus
                    isInvalid={Boolean(
                      error && (meta.touched || meta.submitFailed),
                    )}
                  />
                  {error && (meta.touched || meta.submitFailed) ? (
                    <MessageWrapper>
                      <ErrorMessage>{error}</ErrorMessage>
                    </MessageWrapper>
                  ) : null}
                </>
              )}
            </Field>
            <Field
              name="password"
              label={intl.formatMessage({ id: 'profile.form.passwordLabel' })}
              isRequired
              isDisabled={submitting || isDisabled}
              defaultValue=""
              validate={(value) => validateNewProfilePassword(value, messages)}
            >
              {({ fieldProps, error, meta }) => (
                <>
                  <PasswordTextfield
                    {...fieldProps}
                    isInvalid={Boolean(
                      error && (meta.touched || meta.submitFailed),
                    )}
                  />
                  {error && (meta.touched || meta.submitFailed) ? (
                    <MessageWrapper>
                      <ErrorMessage>{error}</ErrorMessage>
                    </MessageWrapper>
                  ) : (
                    <MessageWrapper>
                      <Text as="span" size="small" color="color.text.subtle">
                        {intl.formatMessage({
                          id: 'profile.form.passwordRules',
                        })}
                        <br />
                        {intl.formatMessage({
                          id: 'profile.form.passwordRecovery',
                        })}
                      </Text>
                    </MessageWrapper>
                  )}
                </>
              )}
            </Field>
            <Field
              name="confirmPassword"
              label={intl.formatMessage({
                id: 'profile.form.confirmPasswordLabel',
              })}
              isRequired
              isDisabled={submitting || isDisabled}
              defaultValue=""
            >
              {({ fieldProps, error, meta }) => (
                <>
                  <PasswordTextfield
                    {...fieldProps}
                    isInvalid={Boolean(
                      error && (meta.touched || meta.submitFailed),
                    )}
                  />
                  {error && (meta.touched || meta.submitFailed) ? (
                    <MessageWrapper>
                      <ErrorMessage>{error}</ErrorMessage>
                    </MessageWrapper>
                  ) : null}
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
                  ? 'profile.create.submitting'
                  : 'profile.create.submit',
              })}
            </Button>
          </Stack>
        </form>
      )}
    </Form>
  );
}
