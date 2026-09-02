import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Heading from '@atlaskit/heading';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import SectionMessage from '@atlaskit/section-message';
import { Stack, Text } from '@atlaskit/primitives';
import { useIntl } from 'react-intl';

export function DeleteTrashModal({
  name,
  onDelete,
  onCancel,
}: {
  readonly name: string;
  readonly onDelete: () => Promise<void> | void;
  readonly onCancel: () => void;
}) {
  const intl = useIntl();
  const displayName =
    name || intl.formatMessage({ id: 'trash.untitled' });
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };
  return (
    <>
      <ModalBody>
        <Stack space="space.200">
          <Heading size="small">
            {intl.formatMessage(
              { id: 'trash.deleteConfirmTitle' },
              { name: displayName },
            )}
          </Heading>
          <SectionMessage
            appearance="error"
            headingLevel="h3"
            title={intl.formatMessage({ id: 'trash.deleteWarningTitle' })}
          >
            <Text as="p">
              {intl.formatMessage({ id: 'trash.deleteWarningDescription' })}
            </Text>
          </SectionMessage>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button isDisabled={deleting} onClick={onCancel}>
          {intl.formatMessage({ id: 'trash.cancel' })}
        </Button>
        <Button
          appearance="danger"
          isLoading={deleting}
          onClick={() => void remove()}
        >
          {intl.formatMessage({ id: 'trash.deletePermanently' })}
        </Button>
      </ModalFooter>
    </>
  );
}
