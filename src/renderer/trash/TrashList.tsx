import Button from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import { Inline, Stack, Text } from '@atlaskit/primitives';

import { localVersionName } from '../history/local-version-name';
import type { TrashItem } from './trash-queries';

export function TrashList({
  items,
  onRestore,
  onDelete,
}: {
  readonly items: readonly TrashItem[];
  readonly onRestore: (item: TrashItem) => void;
  readonly onDelete: (item: TrashItem) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        header="Trash is empty"
        description="Deleted notes and folders will appear here."
      />
    );
  }
  return (
    <div aria-label="Deleted items" className="notera-trash-list" role="list">
      {items.map((item) => (
        <div
          className="notera-trash-list__item"
          key={item.trashEntryId}
          role="listitem"
        >
          <div className="notera-trash-list__details">
            <Stack space="space.025">
              <Text weight="semibold">{item.displayName || 'Untitled'}</Text>
              <Inline space="space.100" shouldWrap>
                <Text>{item.kind === 'note' ? 'Note' : 'Folder'}</Text>
                <Text color="color.text.subtle" size="small">
                  Deleted {localVersionName(new Date(item.deletedAt))}
                </Text>
                <Text color="color.text.subtle" size="small">
                  Expires {localVersionName(new Date(item.expiresAt))}
                </Text>
              </Inline>
            </Stack>
          </div>
          <div className="notera-trash-list__actions">
            <Button
              appearance="subtle"
              onClick={() => onRestore(item)}
              aria-label={`Restore ${item.displayName || 'Untitled'}`}
            >
              Restore
            </Button>
            <Button
              appearance="subtle"
              onClick={() => onDelete(item)}
              aria-label={`Delete ${item.displayName || 'Untitled'} permanently`}
            >
              <span className="notera-trash-action--danger">
                Delete permanently
              </span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
