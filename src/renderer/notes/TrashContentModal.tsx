import Button from '@atlaskit/button/new';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import SectionMessage from '@atlaskit/section-message';
import { Text } from '@atlaskit/primitives';

export function TrashContentModal({
  name,
  onConfirm,
  onCancel,
}: {
  readonly name: string;
  readonly onConfirm: () => Promise<void> | void;
  readonly onCancel: () => void;
}) {
  return (
    <>
      <ModalBody>
        <SectionMessage appearance="warning" title="Move content to trash?">
          <Text as="p">
            {name} can be restored from the trash until it expires.
          </Text>
        </SectionMessage>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="danger" onClick={() => void onConfirm()}>
          Move to trash
        </Button>
      </ModalFooter>
    </>
  );
}
