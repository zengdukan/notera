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

import {
  fieldErrorForProfileOperation,
  systemErrorForProfileOperation,
  validatePassword,
  type ProfileFormError,
} from './profile-form';

import type { ProfileListItem } from './ProfileList';

export function UnlockProfileForm({
  profile,
  onUnlock,
}: {
  readonly profile: ProfileListItem;
  readonly onUnlock: (value: {
    readonly localProfileId: string;
    readonly password: string;
  }) => Promise<void> | void;
}) {
  const [systemError, setSystemError] = useState<ProfileFormError>();

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
          const fieldError = fieldErrorForProfileOperation(error);
          if (fieldError) return fieldError;
          setSystemError(systemErrorForProfileOperation(error, 'unlock'));
          return undefined;
        }
      }}
    >
      {({ formProps, submitting }) => (
        <form {...formProps}>
          <Stack space="space.300">
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
              name="password"
              label="Master password"
              isRequired
              isDisabled={submitting}
              defaultValue=""
              validate={validatePassword}
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
                        Supports autofill from your system or browser password
                        manager.
                      </HelperMessage>
                    )}
                  </MessageWrapper>
                </>
              )}
            </Field>
            <Button
              appearance="primary"
              type="submit"
              isLoading={submitting}
              shouldFitContainer
            >
              Unlock Profile
            </Button>
          </Stack>
        </form>
      )}
    </Form>
  );
}
