import { useEffect, useMemo, useState } from 'react';
import Button from '@atlaskit/button/new';
import ArrowLeftIcon from '@atlaskit/icon/core/arrow-left';
import ChangesIcon from '@atlaskit/icon/core/changes';
import CopyIcon from '@atlaskit/icon/core/copy';
import UndoIcon from '@atlaskit/icon/core/undo';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';
import { media } from '@atlaskit/primitives/responsive';
import { useIntl } from 'react-intl';

import { FolderPicker, type FolderPickerItem } from '../notes/FolderPicker';
import type { NoteraClient, RequestData } from '../platform/notera-client';
import { HistoryCompare } from './HistoryCompare';
import type { HistoryController } from './history-controller';
import { HistoryList } from './HistoryList';
import { HistoryPreview } from './HistoryPreview';
import {
  uniqueHistoryItems,
  useHistoryList,
  useHistorySnapshot,
  type HistoryItem,
} from './history-queries';

export function HistoryModal({
  client,
  profileId,
  noteId,
  controller,
  rootFolderId,
  folders = [],
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly noteId: string;
  readonly controller: HistoryController;
  readonly rootFolderId?: string;
  readonly folders?: readonly FolderPickerItem[];
}) {
  const intl = useIntl();
  const history = useHistoryList({ client, profileId, noteId });
  const items = useMemo(
    () => uniqueHistoryItems(history.data?.pages),
    [history.data?.pages],
  );
  const [selected, setSelected] = useState<HistoryItem>();
  const [comparison, setComparison] =
    useState<RequestData<'history.compare'>>();
  const [targetFolderId, setTargetFolderId] = useState(rootFolderId);
  const [operationFailed, setOperationFailed] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (selected === undefined && items.length > 0) setSelected(items[0]);
  }, [items, selected]);
  const snapshot = useHistorySnapshot({
    client,
    profileId,
    noteId,
    versionId: selected?.versionId,
  });
  const run = async (operation: () => Promise<void>) => {
    setWorking(true);
    setOperationFailed(false);
    try {
      await operation();
    } catch {
      setOperationFailed(true);
    } finally {
      setWorking(false);
    }
  };

  if (history.isPending) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300" xcss={stateStyles}>
          <Spinner
            label={intl.formatMessage({ id: 'history.loading.label' })}
          />
        </Box>
      </ModalBody>
    );
  }
  if (history.isError) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <SectionMessage
            appearance="error"
            title={intl.formatMessage({ id: 'history.loadError.title' })}
          >
            <Text as="p">
              {intl.formatMessage({ id: 'history.loadError.description' })}
            </Text>
          </SectionMessage>
        </Box>
      </ModalBody>
    );
  }
  return (
    <>
      <ModalBody>
        <Box xcss={modalStyles}>
          {operationFailed ? (
            <SectionMessage
              appearance="error"
              title={intl.formatMessage({ id: 'history.operationError.title' })}
            >
              <Text as="p">
                {intl.formatMessage({
                  id: 'history.operationError.description',
                })}
              </Text>
            </SectionMessage>
          ) : null}
          {comparison ? (
            <HistoryCompare noteId={noteId} comparison={comparison} />
          ) : (
            <Box xcss={workspaceStyles}>
              <Box
                as="aside"
                aria-label={intl.formatMessage({
                  id: 'history.versionList.region',
                })}
                xcss={listPanelStyles}
              >
                <Stack space="space.150">
                  <HistoryList
                    items={items}
                    selectedId={selected?.versionId}
                    onSelect={(item) => {
                      setSelected(item);
                      setComparison(undefined);
                    }}
                  />
                  {history.hasNextPage ? (
                    <Inline alignInline="center">
                      <Button
                        appearance="subtle"
                        isLoading={history.isFetchingNextPage}
                        onClick={() => void history.fetchNextPage()}
                      >
                        {intl.formatMessage({ id: 'history.loadMore' })}
                      </Button>
                    </Inline>
                  ) : null}
                </Stack>
              </Box>
              <Box
                as="section"
                aria-label={intl.formatMessage({ id: 'history.preview.region' })}
                xcss={previewPanelStyles}
              >
                <Stack space="space.150">
                  <HistoryPreview
                    noteId={noteId}
                    snapshot={snapshot.data}
                    loading={snapshot.isPending && selected !== undefined}
                  />
                  {rootFolderId !== undefined &&
                  targetFolderId !== undefined ? (
                    <FolderPicker
                      rootFolderId={rootFolderId}
                      folders={folders}
                      disabledIds={new Set()}
                      value={targetFolderId}
                      onChange={setTargetFolderId}
                    />
                  ) : null}
                </Stack>
              </Box>
            </Box>
          )}
        </Box>
      </ModalBody>
      {selected ? (
        <ModalFooter>
          {comparison ? (
            <Button
              iconBefore={ArrowLeftIcon}
              onClick={() => setComparison(undefined)}
            >
              {intl.formatMessage({ id: 'history.compare.back' })}
            </Button>
          ) : (
            <Button
              iconBefore={ChangesIcon}
              isDisabled={working}
              onClick={() =>
                void run(async () => {
                  setComparison(
                    await controller.compare({
                      noteId,
                      versionId: selected.versionId,
                    }),
                  );
                })
              }
            >
              {intl.formatMessage({ id: 'history.compare.action' })}
            </Button>
          )}
          {targetFolderId !== undefined ? (
            <Button
              iconBefore={CopyIcon}
              isDisabled={working}
              onClick={() =>
                void run(() =>
                  controller.copy({
                    noteId,
                    versionId: selected.versionId,
                    targetFolderId,
                    title: selected.displayTitle,
                  }),
                )
              }
            >
              {intl.formatMessage({ id: 'history.copy.action' })}
            </Button>
          ) : null}
          <Button
            appearance="danger"
            iconBefore={UndoIcon}
            isDisabled={working}
            onClick={() =>
              void run(() =>
                controller.restore({
                  noteId,
                  versionId: selected.versionId,
                }),
              )
            }
          >
            {intl.formatMessage({ id: 'history.restore.action' })}
          </Button>
        </ModalFooter>
      ) : null}
    </>
  );
}

const modalStyles = xcss({
  display: 'flex',
  flexDirection: 'column',
  gap: 'space.200',
  minHeight: '0',
  [media.above.sm]: { minHeight: '500px' },
});
const stateStyles = xcss({
  display: 'grid',
  minHeight: '280px',
  placeItems: 'center',
});
const workspaceStyles = xcss({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  minHeight: '0',
  flexGrow: 1,
  [media.above.sm]: {
    gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)',
  },
});
const listPanelStyles = xcss({
  minWidth: '0',
  maxHeight: '180px',
  overflow: 'auto',
  paddingBlockEnd: 'space.200',
  borderBlockEndColor: 'color.border',
  borderBlockEndStyle: 'solid',
  borderBlockEndWidth: 'border.width',
  [media.above.sm]: {
    maxHeight: 'none',
    paddingBlockEnd: 'space.0',
    paddingInlineEnd: 'space.200',
    borderBlockEndWidth: '0',
    borderInlineEndColor: 'color.border',
    borderInlineEndStyle: 'solid',
    borderInlineEndWidth: 'border.width',
  },
});
const previewPanelStyles = xcss({
  minWidth: '0',
  overflow: 'auto',
  paddingBlockStart: 'space.200',
  [media.above.sm]: {
    paddingBlockStart: 'space.0',
    paddingInlineStart: 'space.300',
  },
});
