import { useEffect, useMemo, useState } from 'react';
import Button from '@atlaskit/button/new';
import Form, { ErrorMessage, Field, MessageWrapper } from '@atlaskit/form';
import Heading from '@atlaskit/heading';
import ArrowLeftIcon from '@atlaskit/icon/core/arrow-left';
import ChangesIcon from '@atlaskit/icon/core/changes';
import CopyIcon from '@atlaskit/icon/core/copy';
import UndoIcon from '@atlaskit/icon/core/undo';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { Box, Inline, Stack, Text, xcss } from '@atlaskit/primitives';
import { media } from '@atlaskit/primitives/responsive';
import Textfield from '@atlaskit/textfield';
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

const COPY_FORM_ID = 'notera-history-copy-form';
type HistoryView = 'preview' | 'compare' | 'copy';

export function HistoryModal({
  client,
  profileId,
  noteId,
  noteTitle,
  controller,
  rootFolderId,
  folders = [],
  onCopySuccess,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly noteId: string;
  readonly noteTitle: string;
  readonly controller: HistoryController;
  readonly rootFolderId?: string;
  readonly folders?: readonly FolderPickerItem[];
  readonly onCopySuccess: (title: string) => void;
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
  const [view, setView] = useState<HistoryView>('preview');
  const [copyTitle, setCopyTitle] = useState(noteTitle);
  const [targetFolderId, setTargetFolderId] = useState(rootFolderId);
  const [operationFailed, setOperationFailed] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const normalizedCopyTitle = copyTitle.trim();
  let copyTitleError: string | undefined;
  if (normalizedCopyTitle.length === 0) {
    copyTitleError = intl.formatMessage({ id: 'history.copy.nameRequired' });
  } else if ([...normalizedCopyTitle].length > 1_000) {
    copyTitleError = intl.formatMessage({ id: 'history.copy.nameTooLong' });
  }

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
            headingLevel="h2"
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
    <Form<{ title: string }>
      onSubmit={async () => {
        if (
          view !== 'copy' ||
          selected === undefined ||
          targetFolderId === undefined ||
          copyTitleError !== undefined
        ) {
          return;
        }
        setCopyFailed(false);
        try {
          await controller.copy({
            noteId,
            versionId: selected.versionId,
            targetFolderId,
            title: normalizedCopyTitle,
          });
          onCopySuccess(normalizedCopyTitle);
        } catch {
          setCopyFailed(true);
        }
      }}
    >
      {({ formProps, submitting }) => (
        <>
          <ModalBody>
            <Box xcss={modalStyles}>
              {operationFailed ? (
                <SectionMessage
                  appearance="error"
                  headingLevel="h2"
                  title={intl.formatMessage({
                    id: 'history.operationError.title',
                  })}
                >
                  <Text as="p">
                    {intl.formatMessage({
                      id: 'history.operationError.description',
                    })}
                  </Text>
                </SectionMessage>
              ) : null}
              {view === 'compare' && comparison ? (
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
                          if (view === 'compare') setView('preview');
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
                    aria-label={intl.formatMessage({
                      id: 'history.preview.region',
                    })}
                    xcss={previewPanelStyles}
                  >
                    {view === 'copy' && rootFolderId !== undefined ? (
                      <form
                        {...formProps}
                        id={COPY_FORM_ID}
                        aria-label={intl.formatMessage({
                          id: 'history.copy.formLabel',
                        })}
                      >
                        <Stack space="space.200">
                          <Stack space="space.050">
                            <Heading as="h2" size="small">
                              {intl.formatMessage({
                                id: 'history.copy.heading',
                              })}
                            </Heading>
                            <Text color="color.text.subtle">
                              {intl.formatMessage({
                                id: 'history.copy.description',
                              })}
                            </Text>
                          </Stack>
                          <Field
                            name="title"
                            label={intl.formatMessage({
                              id: 'history.copy.nameLabel',
                            })}
                            defaultValue={noteTitle}
                            isRequired
                          >
                            {({ fieldProps }) => (
                              <>
                                <Textfield
                                  {...fieldProps}
                                  autoFocus
                                  isInvalid={copyTitleError !== undefined}
                                  value={copyTitle}
                                  onChange={(event) => {
                                    fieldProps.onChange(event);
                                    setCopyTitle(event.currentTarget.value);
                                  }}
                                />
                                {copyTitleError ? (
                                  <MessageWrapper>
                                    <ErrorMessage>
                                      {copyTitleError}
                                    </ErrorMessage>
                                  </MessageWrapper>
                                ) : null}
                              </>
                            )}
                          </Field>
                          <Stack space="space.100">
                            <Text weight="semibold">
                              {intl.formatMessage({
                                id: 'history.copy.destinationLabel',
                              })}
                            </Text>
                            <FolderPicker
                              rootFolderId={rootFolderId}
                              folders={folders}
                              disabledIds={new Set()}
                              value={targetFolderId ?? rootFolderId}
                              onChange={setTargetFolderId}
                            />
                          </Stack>
                          {copyFailed ? (
                            <SectionMessage
                              appearance="error"
                              headingLevel="h3"
                              title={intl.formatMessage({
                                id: 'history.copy.failureTitle',
                              })}
                            >
                              <Text as="p">
                                {intl.formatMessage({
                                  id: 'history.copy.failureDescription',
                                })}
                              </Text>
                            </SectionMessage>
                          ) : null}
                        </Stack>
                      </form>
                    ) : (
                      <HistoryPreview
                        noteId={noteId}
                        snapshot={snapshot.data}
                        loading={snapshot.isPending && selected !== undefined}
                      />
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          </ModalBody>
          {selected ? (
            <ModalFooter>
              {view === 'copy' ? (
                <>
                  <Button
                    iconBefore={ArrowLeftIcon}
                    isDisabled={submitting}
                    onClick={() => {
                      setCopyFailed(false);
                      setView('preview');
                    }}
                  >
                    {intl.formatMessage({ id: 'history.copy.back' })}
                  </Button>
                  <Button
                    appearance="primary"
                    iconBefore={CopyIcon}
                    type="submit"
                    form={COPY_FORM_ID}
                    isLoading={submitting}
                    isDisabled={
                      copyTitleError !== undefined ||
                      targetFolderId === undefined
                    }
                  >
                    {intl.formatMessage({ id: 'history.copy.submit' })}
                  </Button>
                </>
              ) : null}
              {view === 'compare' ? (
                <Button
                  iconBefore={ArrowLeftIcon}
                  onClick={() => {
                    setComparison(undefined);
                    setView('preview');
                  }}
                >
                  {intl.formatMessage({ id: 'history.compare.back' })}
                </Button>
              ) : null}
              {view === 'preview' ? (
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
                      setView('compare');
                    })
                  }
                >
                  {intl.formatMessage({ id: 'history.compare.action' })}
                </Button>
              ) : null}
              {view !== 'copy' && targetFolderId !== undefined ? (
                <Button
                  iconBefore={CopyIcon}
                  isDisabled={working}
                  onClick={() => {
                    setOperationFailed(false);
                    setCopyFailed(false);
                    setView('copy');
                  }}
                >
                  {intl.formatMessage({ id: 'history.copy.action' })}
                </Button>
              ) : null}
              {view !== 'copy' ? (
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
              ) : null}
            </ModalFooter>
          ) : null}
        </>
      )}
    </Form>
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
