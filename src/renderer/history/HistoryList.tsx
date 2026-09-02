import EmptyState from '@atlaskit/empty-state';
import ClockIcon from '@atlaskit/icon/core/clock';
import { Box } from '@atlaskit/primitives';
import { ButtonMenuItem } from '@atlaskit/side-nav-items/button-menu-item';
import { MenuList } from '@atlaskit/side-nav-items/menu-list';
import { useIntl, type IntlShape } from 'react-intl';

import type { HistoryItem } from './history-queries';

function itemLabel(item: HistoryItem, intl: IntlShape): string {
  if (item.kind === 'USER')
    return (
      item.versionName ??
      intl.formatDate(item.createdAt, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  if (item.protectionReason === 'BEFORE_HISTORY_RESTORE')
    return intl.formatMessage({ id: 'history.protected.beforeRestore' });
  return intl.formatMessage({ id: 'history.protected.beforeMigration' });
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
  const intl = useIntl();
  if (items.length === 0) {
    return (
      <EmptyState
        header={intl.formatMessage({ id: 'history.empty.title' })}
        description={intl.formatMessage({ id: 'history.empty.description' })}
      />
    );
  }
  return (
    <Box
      as="nav"
      aria-label={intl.formatMessage({ id: 'history.versionList.label' })}
    >
      <MenuList>
        {items.map((item) => {
          const label = itemLabel(item, intl);
          return (
            <ButtonMenuItem
              description={intl.formatDate(item.createdAt, {
                dateStyle: 'medium',
                timeStyle: 'medium',
              })}
              elemBefore={<ClockIcon label="" color="currentColor" />}
              isSelected={selectedId === item.versionId}
              key={item.versionId}
              testId={`history-version-${item.versionId}`}
              onClick={() => onSelect(item)}
            >
              {label}
            </ButtonMenuItem>
          );
        })}
      </MenuList>
    </Box>
  );
}
