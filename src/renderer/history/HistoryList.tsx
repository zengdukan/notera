import Button from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import { Stack, Text } from '@atlaskit/primitives';

import { localVersionName } from './local-version-name';
import type { HistoryItem } from './history-queries';

function itemLabel(item: HistoryItem): string {
  if (item.kind === 'USER')
    return item.versionName ?? localVersionName(new Date(item.createdAt));
  if (item.protectionReason === 'BEFORE_HISTORY_RESTORE')
    return 'Protected before history restore';
  return 'Protected before migration';
}

export function HistoryList({
  items,
  selectedId,
  onSelect,
}: {
  readonly items: readonly HistoryItem[];
  readonly selectedId?: string;
  readonly onSelect: (item: HistoryItem) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        header="No saved versions"
        description="Create a version from the note menu."
      />
    );
  }
  return (
    <div
      aria-label="Saved versions"
      className="notera-history-list"
      role="listbox"
    >
      {items.map((item) => (
        <div
          className={`notera-history-list__item${
            selectedId === item.versionId
              ? ' notera-history-list__item--selected'
              : ''
          }`}
          key={item.versionId}
        >
          <Button
            appearance="subtle"
            shouldFitContainer
            onClick={() => onSelect(item)}
            aria-label={`Preview ${itemLabel(item)}`}
            aria-selected={selectedId === item.versionId}
            role="option"
          >
            <Stack space="space.025">
              <Text weight="semibold">{itemLabel(item)}</Text>
              <Text color="color.text.subtle" size="small">
                {localVersionName(new Date(item.createdAt))}
              </Text>
            </Stack>
          </Button>
        </div>
      ))}
    </div>
  );
}
