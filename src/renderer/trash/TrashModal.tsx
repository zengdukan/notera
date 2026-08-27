import { useMemo, useState } from 'react';
import Button from '@atlaskit/button/new';
import Flag, { FlagGroup } from '@atlaskit/flag';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { Stack } from '@atlaskit/primitives';

import type { FolderPickerItem } from '../notes/FolderPicker';
import type { NoteraClient } from '../platform/notera-client';
import { DeleteTrashModal } from './DeleteTrashModal';
import { RestoreTrashModal } from './RestoreTrashModal';
import { TrashList } from './TrashList';
import type { TrashController } from './trash-controller';
import {
  uniqueTrashItems,
  useTrashItems,
  type TrashItem,
} from './trash-queries';

type Action =
  | { readonly kind: 'restore'; readonly item: TrashItem }
  | { readonly kind: 'delete'; readonly item: TrashItem };

export function TrashModal({
  client,
  profileId,
  rootFolderId,
  folders,
  controller,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly rootFolderId: string;
  readonly folders: readonly FolderPickerItem[];
  readonly controller: TrashController;
}) {
  const trash = useTrashItems({ client, profileId });
  const items = useMemo(() => uniqueTrashItems(trash.data?.pages), [trash.data?.pages]);
  const [action, setAction] = useState<Action>();
  const [feedback, setFeedback] = useState<'missing' | 'failed'>();
  const [deletedFlag, setDeletedFlag] = useState(false);

  const restore = async (item: TrashItem, targetFolderId?: string) => {
    setFeedback(undefined);
    try {
      const result = await controller.restore({
        trashEntryId: item.trashEntryId,
        ...(targetFolderId === undefined ? {} : { targetFolderId }),
      });
      if (result === 'target-required') {
        setAction({ kind: 'restore', item });
      } else {
        setAction(undefined);
        if (result === 'missing') setFeedback('missing');
      }
    } catch {
      setFeedback('failed');
    }
  };
  const remove = async (item: TrashItem) => {
    setFeedback(undefined);
    try {
      const result = await controller.deletePermanent(item.trashEntryId);
      setAction(undefined);
      if (result === 'missing') setFeedback('missing');
      else setDeletedFlag(true);
    } catch {
      setFeedback('failed');
    }
  };

  if (trash.isPending) return <Spinner label="Loading trash" />;
  if (trash.isError) {
    return (
      <SectionMessage appearance="error" title="Could not load trash">
        Close this dialog and try again.
      </SectionMessage>
    );
  }
  if (action?.kind === 'restore') {
    return (
      <RestoreTrashModal
        name={action.item.displayName}
        rootFolderId={rootFolderId}
        folders={folders}
        onCancel={() => setAction(undefined)}
        onRestore={(targetFolderId) => restore(action.item, targetFolderId)}
      />
    );
  }
  if (action?.kind === 'delete') {
    return (
      <DeleteTrashModal
        name={action.item.displayName}
        onCancel={() => setAction(undefined)}
        onDelete={() => remove(action.item)}
      />
    );
  }
  return (
    <Stack space="space.200">
      {feedback === 'missing' ? (
        <SectionMessage appearance="information" title="This item is no longer in trash">
          The trash list has been refreshed.
        </SectionMessage>
      ) : null}
      {feedback === 'failed' ? (
        <SectionMessage appearance="error" title="Trash operation failed">
          The item was not changed.
        </SectionMessage>
      ) : null}
      <TrashList
        items={items}
        onRestore={(item) => {
          if (item.originalParentAvailable) void restore(item);
          else setAction({ kind: 'restore', item });
        }}
        onDelete={(item) => setAction({ kind: 'delete', item })}
      />
      {trash.hasNextPage ? (
        <Button appearance="subtle" isLoading={trash.isFetchingNextPage} onClick={() => void trash.fetchNextPage()}>
          Load more
        </Button>
      ) : null}
      {deletedFlag ? (
        <FlagGroup label="Trash notifications" onDismissed={() => setDeletedFlag(false)}>
          <Flag id="trash-deleted" appearance="success" title="Permanently deleted" />
        </FlagGroup>
      ) : null}
    </Stack>
  );
}
