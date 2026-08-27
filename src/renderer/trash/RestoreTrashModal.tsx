import { useState } from 'react';
import Button from '@atlaskit/button/new';
import { Inline, Stack, Text } from '@atlaskit/primitives';

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
  return (
    <Stack space="space.200">
      <Text>Choose where to restore {name || 'Untitled'}.</Text>
      <FolderPicker
        rootFolderId={rootFolderId}
        folders={folders}
        disabledIds={new Set()}
        value={target}
        onChange={setTarget}
      />
      <Inline space="space.100">
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="primary" onClick={() => void onRestore(target)}>
          Restore to selected folder
        </Button>
      </Inline>
    </Stack>
  );
}
