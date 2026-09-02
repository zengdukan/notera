import Button from '@atlaskit/button/new';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import SectionMessage from '@atlaskit/section-message';
import { Text } from '@atlaskit/primitives';
import { useIntl } from 'react-intl';

export function TrashContentModal({
  name,
  onConfirm,
  onCancel,
}: {
  readonly name: string;
  readonly onConfirm: () => Promise<void> | void;
  readonly onCancel: () => void;
}) {
  const intl = useIntl();
  return (
    <>
      <ModalBody>
        <SectionMessage
          appearance="warning"
          title={intl.formatMessage({ id: 'trash.moveConfirmTitle' })}
        >
          <Text as="p">
            {intl.formatMessage(
              { id: 'trash.moveDescription' },
              { name },
            )}
          </Text>
        </SectionMessage>
      </ModalBody>
      <ModalFooter>
        <Button onClick={onCancel}>
          {intl.formatMessage({ id: 'trash.cancel' })}
        </Button>
        <Button appearance="danger" onClick={() => void onConfirm()}>
          {intl.formatMessage({ id: 'trash.moveAction' })}
        </Button>
      </ModalFooter>
    </>
  );
}
