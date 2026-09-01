import { useState } from 'react';
import { ButtonGroup } from '@atlaskit/button';
import Button from '@atlaskit/button/new';
import Form, { Field, FormFooter } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import { Stack } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Select from '@atlaskit/select';
import Textfield from '@atlaskit/textfield';

export type AutoLockMinutes = 1 | 5 | 15 | 30 | 60;

const lockOptions = ([1, 5, 15, 30, 60] as const).map((value) => ({
  label: `${value} ${value === 1 ? 'minute' : 'minutes'}`,
  value,
}));

type ProfileOperation = 'preference' | 'lock' | 'remove';

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
  const [operation, setOperation] = useState<ProfileOperation>();
  const [failed, setFailed] = useState(false);

  const runOperation = async (
    nextOperation: ProfileOperation,
    action: () => Promise<unknown> | unknown,
  ) => {
    setFailed(false);
    setOperation(nextOperation);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      setOperation(undefined);
    }
  };

  const runFormAction = async (action: () => Promise<unknown> | unknown) => {
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="notera-profile-settings">
      <Stack space="space.300">
        {failed ? (
          <SectionMessage
            appearance="error"
            title="Profile settings were not updated"
          >
            <p>Try the operation again.</p>
          </SectionMessage>
        ) : null}

        <div className="notera-settings-field">
          <span className="notera-settings-field__label">Automatic lock</span>
          <Select
            inputId="settings-auto-lock"
            aria-label="Automatic lock"
            isDisabled={operation !== undefined}
            options={lockOptions}
            value={lockOptions.find(
              (option) => option.value === autoLockMinutes,
            )}
            onChange={(option) => {
              if (option) {
                void runOperation('preference', () =>
                  onUpdateAutoLock(option.value),
                );
              }
            }}
          />
        </div>

        <section className="notera-settings-section">
          <Stack space="space.100">
            <Heading size="small">Rename profile</Heading>
            <Form<{ displayName: string }>
              onSubmit={({ displayName }) =>
                runFormAction(() => onRenameProfile(displayName))
              }
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
        </section>

        <section className="notera-settings-section">
          <Stack space="space.100">
            <Heading size="small">Change password</Heading>
            <Form<{ oldPassword: string; newPassword: string }>
              onSubmit={(values) =>
                runFormAction(() => onChangePassword(values))
              }
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
        </section>

        <div className="notera-settings-actions">
          <ButtonGroup label="Profile security actions">
            <Button
              isDisabled={operation !== undefined}
              isLoading={operation === 'lock'}
              onClick={() => void runOperation('lock', onLock)}
            >
              Lock now
            </Button>
            <Button
              appearance="danger"
              isDisabled={operation !== undefined}
              isLoading={operation === 'remove'}
              onClick={() => void runOperation('remove', onRemove)}
            >
              Remove from device
            </Button>
          </ButtonGroup>
        </div>
      </Stack>
    </div>
  );
}
