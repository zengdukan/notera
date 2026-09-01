import { useEffect, useMemo, useState } from 'react';
import Button from '@atlaskit/button/new';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { Box, Stack } from '@atlaskit/primitives';

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
        <Box paddingBlockEnd="space.300">
          <div className="notera-history-state">
            <Spinner label="Loading history" />
          </div>
        </Box>
      </ModalBody>
    );
  }
  if (history.isError) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <SectionMessage appearance="error" title="Could not load history">
            Close this dialog and try again.
          </SectionMessage>
        </Box>
      </ModalBody>
    );
  }
  return (
    <>
      <ModalBody>
        <div className="notera-history-modal">
          {operationFailed ? (
            <SectionMessage appearance="error" title="History operation failed">
              The current note was not changed.
            </SectionMessage>
          ) : null}
          {comparison ? (
            <HistoryCompare noteId={noteId} comparison={comparison} />
          ) : (
            <div className="notera-history-workspace">
              <aside
                aria-label="Version list"
                className="notera-history-workspace__list"
              >
                <HistoryList
                  items={items}
                  selectedId={selected?.versionId}
                  onSelect={(item) => {
                    setSelected(item);
                    setComparison(undefined);
                  }}
                />
                {history.hasNextPage ? (
                  <Button
                    appearance="subtle"
                    isLoading={history.isFetchingNextPage}
                    onClick={() => void history.fetchNextPage()}
                  >
                    Load more
                  </Button>
                ) : null}
              </aside>
              <section
                aria-label="Version preview"
                className="notera-history-workspace__preview"
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
              </section>
            </div>
          )}
        </div>
      </ModalBody>
      {selected ? (
        <ModalFooter>
          {comparison ? (
            <Button onClick={() => setComparison(undefined)}>
              Back to preview
            </Button>
          ) : (
            <Button
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
              Compare
            </Button>
          )}
          {targetFolderId !== undefined ? (
            <Button
              isDisabled={working}
              onClick={() =>
                void run(() =>
                  controller.copy({
                    noteId,
                    versionId: selected.versionId,
                    targetFolderId,
                  }),
                )
              }
            >
              Copy as note
            </Button>
          ) : null}
          <Button
            appearance="danger"
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
            Restore version
          </Button>
        </ModalFooter>
      ) : null}
    </>
  );
}
