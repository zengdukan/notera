import { useMemo, useState } from 'react';
import Button, { IconButton } from '@atlaskit/button/new';
import Form, {
  ErrorMessage,
  Field,
  FormFooter,
  FormSection,
  MessageWrapper,
} from '@atlaskit/form';
import DeleteIcon from '@atlaskit/icon/core/delete';
import EditIcon from '@atlaskit/icon/core/edit';
import EyeOpenIcon from '@atlaskit/icon/core/eye-open';
import EyeOpenStrikethroughIcon from '@atlaskit/icon/core/eye-open-strikethrough';
import LockUnlockedIcon from '@atlaskit/icon/core/lock-unlocked';
import { Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import Select from '@atlaskit/select';
import Textfield, { type TextFieldProps } from '@atlaskit/textfield';
import { useIntl } from 'react-intl';

import { NoteraClientError } from '../platform/notera-client';
import {
  fieldErrorForProfileOperation,
  localizedProfileFormMessages,
  validatePassword,
  validateProfileName,
} from '../profile/profile-form';

export type AutoLockMinutes = 1 | 5 | 15 | 30 | 60;
export type RemoveProfileResult = 'removed' | 'cancelled';

type ProfileOperation =
  | 'preference'
  | 'rename'
  | 'password'
  | 'lock'
  | 'remove';
type Feedback = 'error' | 'rename-success' | 'password-success';
type PasswordChangeForm = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

function PasswordTextfield(props: TextFieldProps) {
  const intl = useIntl();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const visibilityLabel = intl.formatMessage({
    id: isPasswordVisible ? 'settings.password.hide' : 'settings.password.show',
  });

  return (
    <Textfield
      {...props}
      type={isPasswordVisible ? 'text' : 'password'}
      elemAfterInput={
        <IconButton
          appearance="subtle"
          icon={isPasswordVisible ? EyeOpenStrikethroughIcon : EyeOpenIcon}
          label={visibilityLabel}
          spacing="compact"
          type="button"
          onClick={() => setIsPasswordVisible((visible) => !visible)}
        />
      }
    />
  );
}

export function ProfileSecuritySettings({
  autoLockMinutes,
  displayName,
  onUpdateAutoLock,
  onRenameProfile,
  onChangePassword,
  onRemove,
}: {
  readonly autoLockMinutes: AutoLockMinutes;
  readonly displayName: string;
  readonly onUpdateAutoLock: (
    value: AutoLockMinutes,
  ) => Promise<unknown> | unknown;
  readonly onRenameProfile: (displayName: string) => Promise<string> | string;
  readonly onChangePassword: (value: {
    readonly oldPassword: string;
    readonly newPassword: string;
  }) => Promise<void> | void;
  readonly onLock: () => Promise<unknown> | unknown;
  readonly onRemove: () => Promise<RemoveProfileResult> | RemoveProfileResult;
}) {
  const intl = useIntl();
  const messages = localizedProfileFormMessages(intl);
  const [operation, setOperation] = useState<ProfileOperation>();
  const [feedback, setFeedback] = useState<Feedback>();
  const lockOptions = useMemo(
    () =>
      ([1, 5, 15, 30, 60] as const).map((value) => ({
        label: intl.formatMessage(
          { id: 'settings.autoLock.minutes' },
          { minutes: value },
        ),
        value,
      })),
    [intl],
  );

  const runOperation = async (
    nextOperation: ProfileOperation,
    action: () => Promise<unknown> | unknown,
  ) => {
    setFeedback(undefined);
    setOperation(nextOperation);
    try {
      await action();
    } catch {
      setFeedback('error');
    } finally {
      setOperation(undefined);
    }
  };

  return (
    <Stack space="space.100">
      {feedback === 'error' ? (
        <SectionMessage
          appearance="error"
          headingLevel="h3"
          title={intl.formatMessage({ id: 'settings.profileError.title' })}
        >
          <Text as="p">
            {intl.formatMessage({ id: 'settings.profileError.description' })}
          </Text>
        </SectionMessage>
      ) : null}
      <Form<{ autoLock: (typeof lockOptions)[number] }>
        isDisabled={operation !== undefined}
        label={intl.formatMessage({ id: 'settings.securityForm.label' })}
        onSubmit={() => undefined}
      >
        {({ disabled, formProps }) => (
          <form {...formProps}>
            <FormSection
              title={intl.formatMessage({ id: 'settings.sections.security' })}
            >
              <Field<(typeof lockOptions)[number]>
                name="autoLock"
                label={intl.formatMessage({ id: 'settings.autoLock.label' })}
                defaultValue={lockOptions.find(
                  (option) => option.value === autoLockMinutes,
                )}
                component={({ fieldProps }) => (
                  <Select
                    {...fieldProps}
                    inputId={fieldProps.id}
                    isDisabled={disabled}
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
                )}
              />
            </FormSection>
          </form>
        )}
      </Form>

      <Form<{ displayName: string }>
        key={displayName}
        isDisabled={operation !== undefined && operation !== 'rename'}
        label={intl.formatMessage({ id: 'settings.renameForm.label' })}
        onSubmit={async ({ displayName: nextDisplayName }, form) => {
          setFeedback(undefined);
          setOperation('rename');
          try {
            const renamed = await onRenameProfile(nextDisplayName.trim());
            form.reset({ displayName: renamed });
            setFeedback('rename-success');
            return undefined;
          } catch (error) {
            const fieldErrors = fieldErrorForProfileOperation(error, messages);
            if (fieldErrors !== undefined) return fieldErrors;
            setFeedback('error');
            return undefined;
          } finally {
            setOperation(undefined);
          }
        }}
      >
        {({ formProps, submitting }) => (
          <form {...formProps}>
            <FormSection
              title={intl.formatMessage({ id: 'settings.rename.title' })}
            >
              <Field
                name="displayName"
                label={intl.formatMessage({
                  id: 'settings.rename.nameLabel',
                })}
                defaultValue={displayName}
                isRequired
                validate={(value) => validateProfileName(value, messages)}
              >
                {({ fieldProps, error, meta }) => (
                  <>
                    <Textfield
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
              <FormFooter align="start">
                <Button
                  appearance="primary"
                  iconBefore={EditIcon}
                  type="submit"
                  isLoading={submitting}
                >
                  {intl.formatMessage({ id: 'settings.rename.submit' })}
                </Button>
              </FormFooter>
              {feedback === 'rename-success' ? (
                <SectionMessage
                  appearance="success"
                  headingLevel="h3"
                  title={intl.formatMessage({ id: 'settings.rename.success' })}
                >
                  <Text as="p">
                    {intl.formatMessage({
                      id: 'settings.rename.successDescription',
                    })}
                  </Text>
                </SectionMessage>
              ) : null}
            </FormSection>
          </form>
        )}
      </Form>

      <Form<PasswordChangeForm>
        isDisabled={operation !== undefined && operation !== 'password'}
        label={intl.formatMessage({ id: 'settings.passwordForm.label' })}
        onSubmit={async ({ oldPassword, newPassword }, form) => {
          setFeedback(undefined);
          setOperation('password');
          try {
            await onChangePassword({ oldPassword, newPassword });
            form.reset();
            setFeedback('password-success');
            return undefined;
          } catch (error) {
            if (
              error instanceof NoteraClientError &&
              error.code === 'WRONG_PASSWORD'
            ) {
              return { oldPassword: messages.wrongPassword };
            }
            setFeedback('error');
            return undefined;
          } finally {
            setOperation(undefined);
          }
        }}
      >
        {({ formProps, submitting }) => (
          <form {...formProps}>
            <FormSection
              title={intl.formatMessage({ id: 'settings.password.title' })}
            >
              <SectionMessage
                headingLevel="h4"
                title={intl.formatMessage({
                  id: 'profile.form.noticeTitle',
                })}
              >
                <Text as="p">
                  {intl.formatMessage({
                    id: 'profile.form.passwordRecovery',
                  })}
                </Text>
              </SectionMessage>
              <Field
                name="oldPassword"
                label={intl.formatMessage({
                  id: 'settings.password.currentLabel',
                })}
                defaultValue=""
                isRequired
                validate={(value) => validatePassword(value, messages)}
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
              <Field
                name="newPassword"
                label={intl.formatMessage({
                  id: 'settings.password.newLabel',
                })}
                defaultValue=""
                isRequired
                validate={(value) => validatePassword(value, messages)}
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
              <Field
                name="confirmPassword"
                label={intl.formatMessage({
                  id: 'settings.password.confirmLabel',
                })}
                defaultValue=""
                isRequired
                validate={(value, formState) => {
                  const passwordError = validatePassword(value, messages);
                  if (passwordError) return passwordError;
                  if (value !== (formState as PasswordChangeForm).newPassword) {
                    return intl.formatMessage({
                      id: 'settings.password.mismatch',
                    });
                  }
                  return undefined;
                }}
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
              <FormFooter align="start">
                <Button
                  appearance="primary"
                  iconBefore={LockUnlockedIcon}
                  type="submit"
                  isLoading={submitting}
                >
                  {intl.formatMessage({ id: 'settings.password.submit' })}
                </Button>
              </FormFooter>
              {feedback === 'password-success' ? (
                <SectionMessage
                  appearance="success"
                  headingLevel="h3"
                  title={intl.formatMessage({
                    id: 'settings.password.success',
                  })}
                >
                  <Text as="p">
                    {intl.formatMessage({
                      id: 'settings.password.successDescription',
                    })}
                  </Text>
                </SectionMessage>
              ) : null}
            </FormSection>
          </form>
        )}
      </Form>

      <FormSection
        title={intl.formatMessage({ id: 'settings.sections.danger' })}
      >
        <FormFooter align="start">
          <Button
            appearance="danger"
            iconBefore={DeleteIcon}
            type="button"
            isDisabled={operation !== undefined}
            isLoading={operation === 'remove'}
            onClick={() => void runOperation('remove', onRemove)}
          >
            {intl.formatMessage({ id: 'settings.removeFromDevice' })}
          </Button>
        </FormFooter>
      </FormSection>
    </Stack>
  );
}
