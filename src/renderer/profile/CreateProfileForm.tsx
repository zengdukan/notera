import Button from '@atlaskit/button/new';
import Form, { Field, FormFooter } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import { Stack } from '@atlaskit/primitives';
import Textfield from '@atlaskit/textfield';

export function CreateProfileForm({
  onCreate,
}: {
  readonly onCreate: (value: {
    readonly displayName: string;
    readonly password: string;
  }) => Promise<void> | void;
}) {
  return (
    <Stack space="space.200">
      <Heading size="large">Create profile</Heading>
      <Form<{ displayName: string; password: string }> onSubmit={onCreate}>
        {({ formProps, submitting }) => (
          <form {...formProps}>
            <Field name="displayName" label="Profile name" isRequired>
              {({ fieldProps }) => <Textfield {...fieldProps} autoFocus />}
            </Field>
            <Field name="password" label="Password" isRequired>
              {({ fieldProps }) => <Textfield {...fieldProps} type="password" />}
            </Field>
            <FormFooter>
              <Button appearance="primary" type="submit" isLoading={submitting}>
                Create profile
              </Button>
            </FormFooter>
          </form>
        )}
      </Form>
    </Stack>
  );
}
