import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { Stack, Text } from '@atlaskit/primitives';

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
        <div className="notera-trash-restore">
          <Stack space="space.200">
            <Text>Choose where to restore {name || 'Untitled'}.</Text>
            <FolderPicker
              rootFolderId={rootFolderId}
              folders={folders}
              disabledIds={new Set()}
              value={target}
              onChange={setTarget}
            />
          </Stack>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button isDisabled={restoring} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          appearance="primary"
          isLoading={restoring}
          onClick={() => void restore()}
        >
          Restore to selected folder
        </Button>
      </ModalFooter>
    </>
  );
}
