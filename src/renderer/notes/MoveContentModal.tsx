import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { ButtonGroup } from '@atlaskit/button';
import { Stack } from '@atlaskit/primitives';

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
    <Stack space="space.200">
      <FolderPicker
        rootFolderId={rootFolderId}
        folders={folders}
        disabledIds={disabledIds}
        value={target}
        onChange={setTarget}
      />
      <ButtonGroup
        label={`${operation === 'move' ? 'Move' : 'Copy'} content actions`}
      >
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="primary" onClick={() => void onSubmit(target)}>
          {operation === 'move' ? 'Move' : 'Copy'}
        </Button>
      </ButtonGroup>
    </Stack>
  );
}
