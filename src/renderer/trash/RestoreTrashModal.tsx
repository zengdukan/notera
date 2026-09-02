import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { Stack, Text } from '@atlaskit/primitives';
import { useIntl } from 'react-intl';

import { FolderPicker, type FolderPickerItem } from '../notes/FolderPicker';

export function RestoreTrashModal({
  name,
  rootFolderId,
  folders,
  onRestore,
  onCancel,
}: {
  readonly name: string;
  readonly rootFolderId: string;
  readonly folders: readonly FolderPickerItem[];
  readonly onRestore: (targetFolderId: string) => Promise<void> | void;
  readonly onCancel: () => void;
}) {
  const intl = useIntl();
  const [target, setTarget] = useState(rootFolderId);
  const [restoring, setRestoring] = useState(false);
  const restore = async () => {
    setRestoring(true);
    try {
      await onRestore(target);
    } finally {
      setRestoring(false);
    }
  };
  return (
    <>
      <ModalBody>
        <Stack space="space.200">
          <Text as="p">
            {intl.formatMessage(
              { id: 'trash.restorePickerDescription' },
              {
                name:
                  name || intl.formatMessage({ id: 'trash.untitled' }),
              },
            )}
          </Text>
          <FolderPicker
            rootFolderId={rootFolderId}
            folders={folders}
            disabledIds={new Set()}
            value={target}
            onChange={setTarget}
          />
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button isDisabled={restoring} onClick={onCancel}>
          {intl.formatMessage({ id: 'trash.cancel' })}
        </Button>
        <Button
          appearance="primary"
          isLoading={restoring}
          onClick={() => void restore()}
        >
          {intl.formatMessage({ id: 'trash.restoreToSelectedFolder' })}
        </Button>
      </ModalFooter>
    </>
  );
}
