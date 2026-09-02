import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Heading from '@atlaskit/heading';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import SectionMessage from '@atlaskit/section-message';
import { Stack, Text } from '@atlaskit/primitives';

export function DeleteTrashModal({
  name,
  onDelete,
  onCancel,
}: {
  readonly name: string;
  readonly onDelete: () => Promise<void> | void;
  readonly onCancel: () => void;
}) {
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
            Permanently delete {name || 'Untitled'}?
          </Heading>
          <SectionMessage
            appearance="error"
            headingLevel="h3"
            title="This cannot be undone."
          >
            <Text as="p">
              Notera will remove this item and any data only referenced by it.
            </Text>
          </SectionMessage>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button isDisabled={deleting} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          appearance="danger"
          isLoading={deleting}
          onClick={() => void remove()}
        >
          Delete permanently
        </Button>
      </ModalFooter>
    </>
  );
}
