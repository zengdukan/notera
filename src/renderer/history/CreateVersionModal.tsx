import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { Field } from '@atlaskit/form';
import SectionMessage from '@atlaskit/section-message';
import Textfield from '@atlaskit/textfield';
import { Stack, Text } from '@atlaskit/primitives';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { useIntl } from 'react-intl';

const CREATE_VERSION_FORM_ID = 'notera-create-version-form';

export function CreateVersionModal({
  defaultName,
  onCreate,
}: {
  readonly defaultName: string;
  readonly onCreate: (versionName: string) => Promise<void> | void;
}) {
  const intl = useIntl();
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const create = async () => {
    setSubmitting(true);
    setFailed(false);
    try {
      await onCreate(name.trim());
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <>
      <ModalBody>
        <form
          id={CREATE_VERSION_FORM_ID}
          aria-label={intl.formatMessage({ id: 'history.create.formLabel' })}
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length > 0 && !submitting) void create();
          }}
        >
          <Stack space="space.200">
            <Field
              name="versionName"
              label={intl.formatMessage({ id: 'history.create.nameLabel' })}
            >
              {({ fieldProps }) => (
                <Textfield
                  {...fieldProps}
                  aria-label={intl.formatMessage({
                    id: 'history.create.nameLabel',
                  })}
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              )}
            </Field>
            {failed ? (
              <SectionMessage
                appearance="error"
                headingLevel="h2"
                title={intl.formatMessage({
                  id: 'history.create.failureTitle',
                })}
              >
                <Text as="p">
                  {intl.formatMessage({
                    id: 'history.create.failureDescription',
                  })}
                </Text>
              </SectionMessage>
            ) : null}
          </Stack>
        </form>
      </ModalBody>
      <ModalFooter>
        <Button
          appearance="primary"
          type="submit"
          form={CREATE_VERSION_FORM_ID}
          isLoading={submitting}
          isDisabled={name.trim().length === 0}
        >
          {intl.formatMessage({ id: 'history.create.submit' })}
        </Button>
      </ModalFooter>
    </>
  );
}
