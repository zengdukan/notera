import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';

import { FolderPicker, type FolderPickerItem } from './FolderPicker';

export function MoveContentModal({
  operation,
  rootFolderId,
  folders,
  disabledIds,
  onSubmit,
  onCancel,
}: {
  readonly operation: 'move' | 'copy';
  readonly rootFolderId: string;
  readonly folders: readonly FolderPickerItem[];
  readonly disabledIds: ReadonlySet<string>;
  readonly onSubmit: (folderId: string) => Promise<void> | void;
  readonly onCancel: () => void;
}) {
  const [target, setTarget] = useState(rootFolderId);
  return (
    <>
      <ModalBody>
        <FolderPicker
          rootFolderId={rootFolderId}
          folders={folders}
          disabledIds={disabledIds}
          value={target}
          onChange={setTarget}
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="primary" onClick={() => void onSubmit(target)}>
          {operation === 'move' ? 'Move' : 'Copy'}
        </Button>
      </ModalFooter>
    </>
  );
}
