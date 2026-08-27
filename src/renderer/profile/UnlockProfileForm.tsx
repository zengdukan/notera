import Button from '@atlaskit/button/new';
import Form, { Field, FormFooter } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import { Stack } from '@atlaskit/primitives';
import Textfield from '@atlaskit/textfield';

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
  return (
    <Stack space="space.200">
      <Heading size="large">{profile.displayName}</Heading>
      <Form<{ password: string }>
        onSubmit={({ password }) =>
          onUnlock({ localProfileId: profile.localProfileId, password })
        }
      >
        {({ formProps, submitting }) => (
          <form {...formProps}>
            <Field name="password" label="Password" isRequired>
              {({ fieldProps }) => (
                <Textfield {...fieldProps} type="password" autoFocus />
              )}
            </Field>
            <FormFooter>
              <Button appearance="primary" type="submit" isLoading={submitting}>
                Unlock
              </Button>
            </FormFooter>
          </form>
        )}
      </Form>
    </Stack>
  );
}
