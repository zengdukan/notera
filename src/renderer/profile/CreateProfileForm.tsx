import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Form, {
  ErrorMessage,
  Field,
  FormFooter,
  MessageWrapper,
} from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import PersonIcon from '@atlaskit/icon/core/person-add';
import { Inline, Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Textfield from '@atlaskit/textfield';

import {
  fieldErrorForProfileOperation,
  systemErrorForProfileOperation,
  validatePassword,
  validateProfileName,
  type ProfileFormError,
} from './profile-form';

export function CreateProfileForm({
  onCreate,
}: {
  readonly onCreate: (value: {
    readonly displayName: string;
    readonly password: string;
  }) => Promise<void> | void;
}) {
  const [systemError, setSystemError] = useState<ProfileFormError>();

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <PersonIcon label="" />
          <Heading size="large">Create your first Profile</Heading>
        </Inline>
        <Text as="p" color="color.text.subtle">
          Create a local encrypted workspace and start taking notes.
        </Text>
      </Stack>
      <Form<{ displayName: string; password: string }>
        onSubmit={async ({ displayName, password }) => {
          setSystemError(undefined);
          try {
            await onCreate({ displayName: displayName.trim(), password });
            return undefined;
          } catch (error) {
            const fieldError = fieldErrorForProfileOperation(error);
            if (fieldError) return fieldError;
            setSystemError(systemErrorForProfileOperation(error, 'create'));
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
                label="Profile name"
                isRequired
                isDisabled={submitting}
                defaultValue=""
                validate={validateProfileName}
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
              <Text as="p" color="color.text.subtle">
                Notera cannot recover or reset your master password.
              </Text>
              <FormFooter>
                <Button
                  appearance="primary"
                  type="submit"
                  isLoading={submitting}
                >
                  Create Profile
                </Button>
              </FormFooter>
            </Stack>
          </form>
        )}
      </Form>
    </Stack>
  );
}
