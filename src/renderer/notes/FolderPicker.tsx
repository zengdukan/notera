import { RadioGroup } from '@atlaskit/radio';
import type { ChangeEvent } from 'react';

export interface FolderPickerItem {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
}

export function FolderPicker({
  rootFolderId,
  folders,
  disabledIds,
  value,
  onChange,
}: {
  readonly rootFolderId: string;
  readonly folders: readonly FolderPickerItem[];
  readonly disabledIds: ReadonlySet<string>;
  readonly value: string;
  readonly onChange: (folderId: string) => void;
}) {
  const options = [
    { name: 'folder-target', value: rootFolderId, label: 'Root' },
    ...folders.map((folder) => ({
      name: 'folder-target',
      value: folder.id,
      label: folder.name,
      isDisabled: disabledIds.has(folder.id),
    })),
  ];
  return (
    <RadioGroup
      name="folder-target"
      value={value}
      options={options}
      onChange={(event: ChangeEvent<HTMLInputElement>) =>
        onChange(event.currentTarget.value)
      }
    />
  );
}
