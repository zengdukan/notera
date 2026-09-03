import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Form, { ErrorMessage, Field, MessageWrapper } from '@atlaskit/form';
import ModalDialog, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
} from '@atlaskit/modal-dialog';
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingProfileData, setPendingProfileData] = useState<{
    displayName: string;
    password: string;
  }>();
  const [creating, setCreating] = useState(false);
  const intl = useIntl();
  const messages = localizedProfileFormMessages(intl);

  const handleConfirmCreate = async () => {
    if (!pendingProfileData) return;
    setCreating(true);
    try {
      await onCreate(pendingProfileData);
    } catch (error) {
      const fieldError = fieldErrorForProfileOperation(error, messages);
      if (!fieldError) {
        setSystemError(
          systemErrorForProfileOperation(error, 'create', messages),
        );
      }
    } finally {
      setCreating(false);
      setShowConfirmModal(false);
      setPendingProfileData(undefined);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setPendingProfileData(undefined);
  };

  return (
    <>
      <Form<{ displayName: string; password: string; confirmPassword: string }>
        onSubmit={async ({ displayName, password, confirmPassword }) => {
          setSystemError(undefined);
          if (password !== confirmPassword) {
            return { confirmPassword: messages.passwordMismatch };
          }
          setPendingProfileData({
            displayName: displayName.trim(),
            password,
          });
          setShowConfirmModal(true);
          return undefined;
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
                isDisabled={submitting || isDisabled || creating}
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
                label={intl.formatMessage({
                  id: 'profile.form.passwordLabel',
                })}
                isRequired
                isDisabled={submitting || isDisabled || creating}
                defaultValue=""
                validate={(value) =>
                  validateNewProfilePassword(value, messages)
                }
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
                isDisabled={submitting || isDisabled || creating}
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
                isDisabled={isDisabled || creating}
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
      <ModalTransition>
        {showConfirmModal && (
          <ModalDialog
            testId="notera-modal-create-profile-confirm"
            onClose={handleCancelConfirm}
            shouldReturnFocus
          >
            <ModalHeader hasCloseButton>
              <ModalTitle appearance="warning">
                {intl.formatMessage({
                  id: 'profile.create.confirmTitle',
                })}
              </ModalTitle>
            </ModalHeader>
            <ModalBody>
              <SectionMessage appearance="warning">
                <Text as="p">
                  {intl.formatMessage({
                    id: 'profile.create.confirmMessage',
                  })}
                </Text>
              </SectionMessage>
            </ModalBody>
            <ModalFooter>
              <Button isDisabled={creating} onClick={handleCancelConfirm}>
                {intl.formatMessage({
                  id: 'profile.create.confirmCancel',
                })}
              </Button>
              <Button
                appearance="primary"
                isLoading={creating}
                onClick={() => void handleConfirmCreate()}
              >
                {intl.formatMessage({
                  id: 'profile.create.confirmOk',
                })}
              </Button>
            </ModalFooter>
          </ModalDialog>
        )}
      </ModalTransition>
    </>
  );
}
