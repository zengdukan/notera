import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Form, { ErrorMessage, Field, FormFooter } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import LockIcon from '@atlaskit/icon/core/lock-locked';
import { Inline, Stack, Text } from '@atlaskit/primitives';
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
    <Stack space="space.300">
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <LockIcon label="" />
          <Heading size="large">Unlock Profile</Heading>
        </Inline>
        <Text as="p" color="color.text.subtle">
          Select a local Profile and enter its master password.
        </Text>
      </Stack>
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
            <Stack space="space.200">
              <Stack space="space.050">
                <Text as="p" color="color.text.subtle">
                  Selected Profile
                </Text>
                <Heading size="medium">{profile.displayName}</Heading>
              </Stack>
              {systemError ? (
                <SectionMessage appearance="error" title={systemError.title}>
                  <Text as="p">{systemError.description}</Text>
                </SectionMessage>
              ) : null}
              <Field
                name="password"
                label="Master password"
                isRequired
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
                    {error && (meta.touched || meta.submitFailed) ? (
                      <ErrorMessage>{error}</ErrorMessage>
                    ) : null}
                  </>
                )}
              </Field>
              <FormFooter>
                <Button
                  appearance="primary"
                  type="submit"
                  isLoading={submitting}
                >
                  Unlock Profile
                </Button>
              </FormFooter>
            </Stack>
          </form>
        )}
      </Form>
    </Stack>
  );
}
