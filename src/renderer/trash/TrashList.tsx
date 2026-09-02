import { Fragment, type ComponentProps } from 'react';
import { IconButton } from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import DeleteIcon from '@atlaskit/icon/core/delete';
import FolderClosedIcon from '@atlaskit/icon/core/folder-closed';
import NoteIcon from '@atlaskit/icon/core/note';
import UndoIcon from '@atlaskit/icon/core/undo';
import { Inline } from '@atlaskit/primitives';
import { ButtonMenuItem } from '@atlaskit/side-nav-items/button-menu-item';
import { MenuList } from '@atlaskit/side-nav-items/menu-list';
import { Divider } from '@atlaskit/side-nav-items/menu-section';
import { token } from '@atlaskit/tokens';

import { localVersionName } from '../history/local-version-name';
import type { TrashItem } from './trash-queries';

function DangerDeleteIcon(props: ComponentProps<typeof DeleteIcon>) {
  return <DeleteIcon {...props} color={token('color.icon.danger')} />;
}

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
    <MenuList>
      {items.map((item) => {
        const title = item.displayName || 'Untitled';
        const ItemIcon = item.kind === 'note' ? NoteIcon : FolderClosedIcon;
        return (
          <Fragment key={item.trashEntryId}>
            <ButtonMenuItem
              actionsOnHover={
                <Inline alignBlock="center" space="space.025">
                  <IconButton
                    appearance="subtle"
                    icon={UndoIcon}
                    isTooltipDisabled={false}
                    label={`Restore ${title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRestore(item);
                    }}
                    spacing="compact"
                  />
                  <IconButton
                    appearance="subtle"
                    icon={DangerDeleteIcon}
                    isTooltipDisabled={false}
                    label={`Delete ${title} permanently`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(item);
                    }}
                    spacing="compact"
                  />
                </Inline>
              }
              description={`Deleted ${localVersionName(new Date(item.deletedAt))}`}
              elemBefore={
                <ItemIcon
                  color="currentColor"
                  label=""
                  testId={`trash-${item.kind}-icon`}
                />
              }
            >
              {title}
            </ButtonMenuItem>
            <Divider />
          </Fragment>
        );
      })}
    </MenuList>
  );
}
