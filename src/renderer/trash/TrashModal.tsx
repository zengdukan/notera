import { useMemo, useState } from 'react';
import Button from '@atlaskit/button/new';
import { ModalBody } from '@atlaskit/modal-dialog';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { Box, Inline, Stack, Text } from '@atlaskit/primitives';
import { useIntl } from 'react-intl';

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
  const intl = useIntl();
  const trash = useTrashItems({ client, profileId });
  const items = useMemo(
    () => uniqueTrashItems(trash.data?.pages),
    [trash.data?.pages],
  );
  const [action, setAction] = useState<Action>();
  const [feedback, setFeedback] = useState<'missing' | 'failed'>();
  const [restoredName, setRestoredName] = useState<string>();
  const [deletedName, setDeletedName] = useState<string>();

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
        else
          setRestoredName(
            item.displayName || intl.formatMessage({ id: 'trash.untitled' }),
          );
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
      else
        setDeletedName(
          item.displayName || intl.formatMessage({ id: 'trash.untitled' }),
        );
    } catch {
      setFeedback('failed');
    }
  };

  if (trash.isPending) {
    return (
      <ModalBody>
        <Box paddingBlock="space.1000">
          <Inline alignBlock="center" alignInline="center">
            <Spinner
              label={intl.formatMessage({ id: 'trash.loadingLabel' })}
            />
          </Inline>
        </Box>
      </ModalBody>
    );
  }
  if (trash.isError) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <SectionMessage
            appearance="error"
            headingLevel="h2"
            title={intl.formatMessage({ id: 'trash.loadErrorTitle' })}
          >
            <Text as="p">
              {intl.formatMessage({ id: 'trash.loadErrorDescription' })}
            </Text>
          </SectionMessage>
        </Box>
      </ModalBody>
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
    <ModalBody>
      <Box paddingBlockEnd="space.300">
        <Stack space="space.200">
          {restoredName ? (
            <SectionMessage
              appearance="success"
              headingLevel="h2"
              title={intl.formatMessage(
                { id: 'trash.restoredTitle' },
                { name: restoredName },
              )}
            >
              <Text as="p">
                {intl.formatMessage({ id: 'trash.restoredDescription' })}
              </Text>
            </SectionMessage>
          ) : null}
          {deletedName ? (
            <SectionMessage
              appearance="success"
              headingLevel="h2"
              title={intl.formatMessage(
                { id: 'trash.deletedTitle' },
                { name: deletedName },
              )}
            >
              <Text as="p">
                {intl.formatMessage({
                  id: 'trash.deletedSuccessDescription',
                })}
              </Text>
            </SectionMessage>
          ) : null}
          {feedback === 'missing' ? (
            <SectionMessage
              appearance="information"
              headingLevel="h2"
              title={intl.formatMessage({ id: 'trash.missingTitle' })}
            >
              <Text as="p">
                {intl.formatMessage({ id: 'trash.missingDescription' })}
              </Text>
            </SectionMessage>
          ) : null}
          {feedback === 'failed' ? (
            <SectionMessage
              appearance="error"
              headingLevel="h2"
              title={intl.formatMessage({
                id: 'trash.operationFailedTitle',
              })}
            >
              <Text as="p">
                {intl.formatMessage({
                  id: 'trash.operationFailedDescription',
                })}
              </Text>
            </SectionMessage>
          ) : null}
          <TrashList
            items={items}
            onRestore={(item) => {
              setDeletedName(undefined);
              if (item.originalParentAvailable) void restore(item);
              else setAction({ kind: 'restore', item });
            }}
            onDelete={(item) => {
              setRestoredName(undefined);
              setAction({ kind: 'delete', item });
            }}
          />
          {trash.hasNextPage ? (
            <Inline alignInline="center">
              <Button
                isLoading={trash.isFetchingNextPage}
                onClick={() => void trash.fetchNextPage()}
              >
                {intl.formatMessage({ id: 'trash.loadMore' })}
              </Button>
            </Inline>
          ) : null}
        </Stack>
      </Box>
    </ModalBody>
  );
}
