import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Heading from '@atlaskit/heading';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import SectionMessage from '@atlaskit/section-message';
import { Stack } from '@atlaskit/primitives';

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
        <div className="notera-trash-confirm">
          <Stack space="space.200">
            <Heading size="small">
              Permanently delete {name || 'Untitled'}?
            </Heading>
            <SectionMessage appearance="error" title="This cannot be undone.">
              Notera will remove this item and any data only referenced by it.
            </SectionMessage>
          </Stack>
        </div>
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
