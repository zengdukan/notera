import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Form, { ErrorMessage, Field, MessageWrapper } from '@atlaskit/form';
import { Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Textfield from '@atlaskit/textfield';
import { useIntl } from 'react-intl';

import {
  fieldErrorForProfileOperation,
  localizedProfileFormMessages,
  systemErrorForProfileOperation,
  validatePassword,
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
    <Form<{ displayName: string; password: string }>
      onSubmit={async ({ displayName, password }) => {
        setSystemError(undefined);
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
              validate={(value) => validatePassword(value, messages)}
            >
              {({ fieldProps, error, meta }) => (
                <>
                  <Textfield
                    {...fieldProps}
                    type="password"
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
                      <span className="notera-profile-form__password-help">
                        {intl.formatMessage({
                          id: 'profile.form.passwordRules',
                        })}
                        <br />
                        {intl.formatMessage({
                          id: 'profile.form.passwordRecovery',
                        })}
                      </span>
                    </MessageWrapper>
                  )}
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
            <div className="notera-profile-form__mobile-notice">
              <SectionMessage
                title={intl.formatMessage({ id: 'profile.form.noticeTitle' })}
              >
                <Text as="p">
                  {intl.formatMessage({ id: 'profile.form.passwordRecovery' })}
                </Text>
              </SectionMessage>
            </div>
          </Stack>
        </form>
      )}
    </Form>
  );
}
