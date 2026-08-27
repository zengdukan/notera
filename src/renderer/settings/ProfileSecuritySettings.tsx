import Button from '@atlaskit/button/new';
import Form, { Field, FormFooter } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import { ButtonGroup } from '@atlaskit/button';
import { Stack } from '@atlaskit/primitives';
import Select from '@atlaskit/select';
import Textfield from '@atlaskit/textfield';

export type AutoLockMinutes = 1 | 5 | 15 | 30 | 60;

const lockOptions = ([1, 5, 15, 30, 60] as const).map((value) => ({
  label: `${value} ${value === 1 ? 'minute' : 'minutes'}`,
  value,
}));

export function ProfileSecuritySettings({
  autoLockMinutes,
  onUpdateAutoLock,
  onRenameProfile,
  onChangePassword,
  onLock,
  onRemove,
}: {
  readonly autoLockMinutes: AutoLockMinutes;
  readonly onUpdateAutoLock: (
    value: AutoLockMinutes,
  ) => Promise<unknown> | unknown;
  readonly onRenameProfile: (displayName: string) => Promise<void> | void;
  readonly onChangePassword: (value: {
    readonly oldPassword: string;
    readonly newPassword: string;
  }) => Promise<void> | void;
  readonly onLock: () => Promise<unknown> | unknown;
  readonly onRemove: () => Promise<unknown> | unknown;
}) {
  return (
    <Stack space="space.300">
      <Select
        inputId="settings-auto-lock"
        aria-label="Automatic lock"
        options={lockOptions}
        value={lockOptions.find((option) => option.value === autoLockMinutes)}
        onChange={(option) => {
          if (option) void onUpdateAutoLock(option.value);
        }}
      />

      <Stack space="space.100">
        <Heading size="small">Rename profile</Heading>
        <Form<{ displayName: string }>
          onSubmit={({ displayName }) => onRenameProfile(displayName)}
        >
          {({ formProps, submitting }) => (
            <form {...formProps}>
              <Field name="displayName" label="Profile name" isRequired>
                {({ fieldProps }) => <Textfield {...fieldProps} />}
              </Field>
              <FormFooter>
                <Button type="submit" isLoading={submitting}>
                  Rename
                </Button>
              </FormFooter>
            </form>
          )}
        </Form>
      </Stack>

      <Stack space="space.100">
        <Heading size="small">Change password</Heading>
        <Form<{ oldPassword: string; newPassword: string }>
          onSubmit={onChangePassword}
        >
          {({ formProps, submitting }) => (
            <form {...formProps}>
              <Field name="oldPassword" label="Current password" isRequired>
                {({ fieldProps }) => (
                  <Textfield {...fieldProps} type="password" />
                )}
              </Field>
              <Field name="newPassword" label="New password" isRequired>
                {({ fieldProps }) => (
                  <Textfield {...fieldProps} type="password" />
                )}
              </Field>
              <FormFooter>
                <Button type="submit" isLoading={submitting}>
                  Change password
                </Button>
              </FormFooter>
            </form>
          )}
        </Form>
      </Stack>

      <ButtonGroup label="Profile security actions">
        <Button onClick={() => void onLock()}>Lock now</Button>
        <Button appearance="danger" onClick={() => void onRemove()}>
          Remove from device
        </Button>
      </ButtonGroup>
    </Stack>
  );
}
