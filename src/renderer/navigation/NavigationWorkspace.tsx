import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { ModalBody } from '@atlaskit/modal-dialog';
import { Box, Text } from '@atlaskit/primitives';
import { useQueryClient } from '@tanstack/react-query';
import { useIntl } from 'react-intl';

import {
  useSession,
  type SessionAction,
  type UnlockedSession,
} from '../app/session';
import { noteKey, recentKey, treeKey } from '../app/query-keys';
import { FavoritesModal } from '../favorites/FavoritesModal';
import { createExportController } from '../export/export-controller';
import { ExportModal } from '../export/ExportModal';
import { ExportOperationStore } from '../export/export-operation';
import { CreateVersionModal } from '../history/CreateVersionModal';
import { createHistoryController } from '../history/history-controller';
import { HistoryModal } from '../history/HistoryModal';
import { localVersionName } from '../history/local-version-name';
import type { NoteraClient } from '../platform/notera-client';
import { RecentModal } from '../recent/RecentModal';
import { SearchModal } from '../search/SearchModal';
import { createTrashController } from '../trash/trash-controller';
import { TrashModal } from '../trash/TrashModal';
import { ActiveDocumentLifecycle } from '../notes/document-lifecycle';
import { NoteWorkspace } from '../notes/NoteWorkspace';
import { NoteWriteCoordinator } from '../notes/note-write-coordinator';
import type { NoteMoreAction } from '../notes/StickyNoteHeader';
import { CreateFolderModal } from '../notes/CreateFolderModal';
import { MoveContentModal } from '../notes/MoveContentModal';
import { RenameContentModal } from '../notes/RenameContentModal';
import { TrashContentModal } from '../notes/TrashContentModal';
import {
  disabledFolderIdsFor,
  loadFolderPickerItems,
  type LoadedFolderPickerItem,
} from '../notes/folder-picker-data';
import { SettingsModal } from '../settings/SettingsModal';
import { deviceSettingsKey } from '../settings/settings-queries';
import { ModalHost, type HostedModal } from '../shared-ui/ModalHost';
import { createContentActions } from './content-actions';
import {
  createContentController,
  type ContentEntry,
} from './content-controller';
import { ResizableNavigation } from './ResizableNavigation';
import { QueryContentTree } from './tree-queries';

type Overlay =
  | { readonly kind: 'message'; readonly title: string }
  | { readonly kind: 'search' }
  | { readonly kind: 'favorites' }
  | { readonly kind: 'recent' }
  | {
      readonly kind: 'create-version';
      readonly note: Extract<ContentEntry, { kind: 'note' }>;
      readonly defaultName: string;
    }
  | {
      readonly kind: 'history';
      readonly note: Extract<ContentEntry, { kind: 'note' }>;
      readonly folders: readonly LoadedFolderPickerItem[];
    }
  | {
      readonly kind: 'trash-bin';
      readonly folders: readonly LoadedFolderPickerItem[];
    }
  | {
      readonly kind: 'export-note';
      readonly note: Extract<ContentEntry, { kind: 'note' }>;
    }
  | { readonly kind: 'create-folder'; readonly parentFolderId: string }
  | { readonly kind: 'rename'; readonly entry: ContentEntry }
  | { readonly kind: 'trash'; readonly entry: ContentEntry }
  | {
      readonly kind: 'folder-operation';
      readonly operation: 'move' | 'copy';
      readonly entry: ContentEntry;
      readonly folders: readonly LoadedFolderPickerItem[];
      readonly disabledIds: ReadonlySet<string>;
    }
  | {
      readonly kind: 'settings';
      readonly device: {
        theme: 'SYSTEM' | 'LIGHT' | 'DARK';
        language: 'zh-CN' | 'en';
      };
      readonly profile: {
        autoLockMinutes: 1 | 5 | 15 | 30 | 60;
        displayName: string;
      };
    };

export function NavigationWorkspace({
  client,
  children,
  lifecycle: providedLifecycle,
  writeCoordinator: providedWriteCoordinator,
}: {
  readonly client: NoteraClient;
  readonly children?: ReactNode;
  readonly lifecycle?: ActiveDocumentLifecycle;
  readonly writeCoordinator?: NoteWriteCoordinator;
}) {
  const lifecycle = useMemo(
    () => providedLifecycle ?? new ActiveDocumentLifecycle(),
    [providedLifecycle],
  );
  const writeCoordinator = useMemo(
    () => providedWriteCoordinator ?? new NoteWriteCoordinator(),
    [providedWriteCoordinator],
  );
  const { state, dispatch } = useSession();
  if (state.status !== 'unlocked') return null;
  return (
    <UnlockedNavigationWorkspace
      client={client}
      profile={state.profile}
      dispatch={dispatch}
      lifecycle={lifecycle}
      writeCoordinator={writeCoordinator}
    >
      {children}
    </UnlockedNavigationWorkspace>
  );
}

function UnlockedNavigationWorkspace({
  client,
  profile,
  dispatch,
  children,
  lifecycle,
  writeCoordinator,
}: {
  readonly client: NoteraClient;
  readonly profile: UnlockedSession;
  readonly dispatch: Dispatch<SessionAction>;
  readonly children: ReactNode;
  readonly lifecycle: ActiveDocumentLifecycle;
  readonly writeCoordinator: NoteWriteCoordinator;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<ContentEntry>();
  const [editingNoteId, setEditingNoteId] = useState<string>();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [overlay, setOverlay] = useState<Overlay>();
  const exportStore = useMemo(() => new ExportOperationStore(), []);
  const historyController = useMemo(
    () =>
      createHistoryController({
        client,
        queryClient,
        profileId: profile.localProfileId,
        lifecycle,
        writeCoordinator,
        onRestored: (detail) => {
          setEditingNoteId(undefined);
          setSelection(detail);
          setOverlay(undefined);
        },
        onMissing: (noteId) => {
          setSelection((current) =>
            current?.kind === 'note' && current.id === noteId
              ? undefined
              : current,
          );
          setOverlay(undefined);
          void queryClient.invalidateQueries({
            queryKey: treeKey(profile.localProfileId, profile.rootFolderId),
          });
        },
      }),
    [
      client,
      lifecycle,
      profile.localProfileId,
      profile.rootFolderId,
      queryClient,
      writeCoordinator,
    ],
  );
  const trashController = useMemo(
    () =>
      createTrashController({
        client,
        queryClient,
        profileId: profile.localProfileId,
      }),
    [client, profile.localProfileId, queryClient],
  );
  const exportController = useMemo(
    () =>
      createExportController({
        client,
        lifecycle,
        store: exportStore,
        getActiveNoteId: () =>
          selection?.kind === 'note' ? selection.id : undefined,
      }),
    [client, exportStore, lifecycle, selection],
  );

  useEffect(() => {
    const unsubscribeProgress = client.subscribe(
      'operation.progress',
      (payload) => exportStore.applyProgress(payload),
    );
    const unsubscribeCompleted = client.subscribe(
      'operation.completed',
      (payload) => exportStore.applyCompleted(payload),
    );
    return () => {
      unsubscribeProgress?.();
      unsubscribeCompleted?.();
      exportStore.clear();
    };
  }, [client, exportStore]);
  const controller = useMemo(
    () =>
      createContentController({
        client,
        queryClient,
        profileId: profile.localProfileId,
        rootFolderId: profile.rootFolderId,
        getSelection: () => selection,
        guard: lifecycle,
        writeCoordinator,
        select: setSelection,
        beginEditing: setEditingNoteId,
      }),
    [
      client,
      lifecycle,
      profile.localProfileId,
      profile.rootFolderId,
      queryClient,
      selection,
      writeCoordinator,
    ],
  );

  useEffect(() => () => lifecycle.clear(), [lifecycle]);

  const selectWithFlush = async (entry: ContentEntry) => {
    if (selection?.kind === 'note' && selection.id !== entry.id) {
      try {
        await lifecycle.flush();
      } catch {
        return;
      }
    }
    setEditingNoteId(undefined);
    setSelection(entry);
  };

  const createNote = async (folderId?: string) => {
    try {
      await lifecycle.flush();
    } catch {
      return;
    }
    await controller.createNote(folderId);
  };

  const openListedNote = useCallback(
    async (
      noteId: string,
      knownPath?: readonly { readonly id: string }[],
    ): Promise<boolean> => {
      if (selection?.kind === 'note' && selection.id !== noteId) {
        try {
          await lifecycle.flush();
        } catch {
          return false;
        }
      }
      try {
        const detail = await client.request('note.get', { noteId });
        const path =
          knownPath ??
          (
            await client.request('contentTree.getFolderPath', {
              folderId: detail.folderId,
            })
          ).items;
        queryClient.setQueryData(
          noteKey(profile.localProfileId, noteId),
          detail,
        );
        setExpandedIds(
          (current) => new Set([...current, ...path.map((item) => item.id)]),
        );
        setEditingNoteId(undefined);
        setSelection(detail);
        setOverlay(undefined);
        await queryClient.invalidateQueries({
          queryKey: recentKey(profile.localProfileId),
        });
        return true;
      } catch {
        return false;
      }
    },
    [client, lifecycle, profile.localProfileId, queryClient, selection],
  );

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setOverlay({ kind: 'search' });
      }
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, []);

  const modal = useMemo<HostedModal | null>(() => {
    if (overlay === undefined) return null;
    if (overlay.kind === 'search') {
      return {
        kind: overlay.kind,
        title: 'Search',
        width: 720,
        content: (
          <SearchModal
            client={client}
            profileId={profile.localProfileId}
            rootFolderId={profile.rootFolderId}
            onOpen={(result) =>
              openListedNote(result.noteId, result.folderPath)
            }
          />
        ),
      };
    }
    if (overlay.kind === 'favorites') {
      return {
        kind: overlay.kind,
        title: intl.formatMessage({ id: 'favorites.title' }),
        content: (
          <FavoritesModal
            client={client}
            profileId={profile.localProfileId}
            onOpen={(note) => openListedNote(note.id)}
            onClose={() => setOverlay(undefined)}
          />
        ),
      };
    }
    if (overlay.kind === 'recent') {
      return {
        kind: overlay.kind,
        title: '最近浏览',
        content: (
          <RecentModal
            client={client}
            profileId={profile.localProfileId}
            onOpen={(note) => openListedNote(note.id, note.folderPath)}
            onClose={() => setOverlay(undefined)}
          />
        ),
      };
    }
    if (overlay.kind === 'create-version') {
      return {
        kind: overlay.kind,
        title: intl.formatMessage({ id: 'history.create.title' }),
        width: 560,
        content: (
          <CreateVersionModal
            defaultName={overlay.defaultName}
            onCreate={async (versionName) => {
              await historyController.create({
                noteId: overlay.note.id,
                versionName,
              });
              setOverlay(undefined);
            }}
          />
        ),
      };
    }
    if (overlay.kind === 'history') {
      return {
        kind: overlay.kind,
        title: intl.formatMessage({ id: 'history.title' }),
        width: 1080,
        content: (
          <HistoryModal
            client={client}
            profileId={profile.localProfileId}
            noteId={overlay.note.id}
            noteTitle={overlay.note.title}
            controller={historyController}
            rootFolderId={profile.rootFolderId}
            folders={overlay.folders}
            onCopySuccess={() => setOverlay(undefined)}
          />
        ),
      };
    }
    if (overlay.kind === 'trash-bin') {
      return {
        kind: overlay.kind,
        title: intl.formatMessage({ id: 'trash.title' }),
        width: 840,
        content: (
          <TrashModal
            client={client}
            profileId={profile.localProfileId}
            rootFolderId={profile.rootFolderId}
            folders={overlay.folders}
            controller={trashController}
          />
        ),
      };
    }
    if (overlay.kind === 'export-note') {
      return {
        kind: overlay.kind,
        title: 'Export',
        width: 620,
        content: (
          <ExportModal
            noteId={overlay.note.id}
            controller={exportController}
            store={exportStore}
            onReturnToEdit={() => setOverlay(undefined)}
          />
        ),
      };
    }
    if (overlay.kind === 'message') {
      return {
        kind: overlay.kind,
        title: overlay.title,
        content: (
          <ModalBody>
            <Box paddingBlockEnd="space.300">
              <Text>Available in this offline workspace.</Text>
            </Box>
          </ModalBody>
        ),
      };
    }
    if (overlay.kind === 'create-folder') {
      return {
        kind: overlay.kind,
        title: 'Create folder',
        content: (
          <CreateFolderModal
            onCreate={async (name) => {
              await controller.createFolder(overlay.parentFolderId, name);
              setOverlay(undefined);
            }}
          />
        ),
      };
    }
    if (overlay.kind === 'rename') {
      return {
        kind: overlay.kind,
        title: 'Rename',
        content: (
          <RenameContentModal
            initialName={
              overlay.entry.kind === 'folder'
                ? overlay.entry.name
                : overlay.entry.title
            }
            allowBlank={overlay.entry.kind === 'note'}
            onRename={async (name) => {
              await controller.rename(overlay.entry, name);
              setOverlay(undefined);
            }}
          />
        ),
      };
    }
    if (overlay.kind === 'trash') {
      return {
        kind: overlay.kind,
        title: intl.formatMessage({ id: 'trash.moveTitle' }),
        content: (
          <TrashContentModal
            name={
              overlay.entry.kind === 'folder'
                ? overlay.entry.name
                : overlay.entry.title ||
                  intl.formatMessage({ id: 'trash.untitled' })
            }
            onCancel={() => setOverlay(undefined)}
            onConfirm={async () => {
              await controller.trash(overlay.entry);
              setOverlay(undefined);
            }}
          />
        ),
      };
    }
    if (overlay.kind === 'folder-operation') {
      return {
        kind: overlay.kind,
        title: overlay.operation === 'move' ? 'Move' : 'Copy',
        content: (
          <MoveContentModal
            operation={overlay.operation}
            rootFolderId={profile.rootFolderId}
            folders={overlay.folders}
            disabledIds={overlay.disabledIds}
            onCancel={() => setOverlay(undefined)}
            onSubmit={async (folderId) => {
              const result =
                overlay.operation === 'move'
                  ? await controller.move(overlay.entry, folderId)
                  : await controller.copy(overlay.entry, folderId);
              if (result === 'ready') setOverlay(undefined);
            }}
          />
        ),
      };
    }
    return {
      kind: overlay.kind,
      title: intl.formatMessage({ id: 'settings.title' }),
      width: 820,
      content: (
        <SettingsModal
          device={overlay.device}
          profile={overlay.profile}
          onUpdateDevice={async (value) => {
            const device = await client.request('settings.updateDevice', value);
            queryClient.setQueryData(deviceSettingsKey(), device);
            setOverlay({ ...overlay, device });
          }}
          onUpdateProfile={async (value) => {
            const nextProfile = await client.request(
              'settings.updateProfile',
              value,
            );
            setOverlay({
              ...overlay,
              profile: { ...overlay.profile, ...nextProfile },
            });
          }}
          onRenameProfile={async (displayName) => {
            const renamed = await client.request('profile.rename', {
              displayName,
            });
            dispatch({
              type: 'unlocked',
              profile: { ...profile, displayName: renamed.displayName },
            });
            setOverlay({
              ...overlay,
              profile: {
                ...overlay.profile,
                displayName: renamed.displayName,
              },
            });
            return renamed.displayName;
          }}
          onChangePassword={async (value) => {
            await client.request('profile.changePassword', value);
          }}
          onLock={async () => {
            await client.request('profile.lock', {});
            setOverlay(undefined);
          }}
          onRemove={async () => {
            const result = await client.request('profile.removeFromDevice', {
              localProfileId: profile.localProfileId,
            });
            if (result.status === 'removed') setOverlay(undefined);
            return result.status;
          }}
        />
      ),
    };
  }, [
    client,
    controller,
    dispatch,
    exportController,
    exportStore,
    historyController,
    intl,
    openListedNote,
    overlay,
    profile,
    queryClient,
    trashController,
  ]);

  const openSettings = async () => {
    const [device, profileSettings] = await Promise.all([
      client.request('settings.getDevice', {}),
      client.request('settings.getProfile', {}),
    ]);
    queryClient.setQueryData(deviceSettingsKey(), device);
    setOverlay({
      kind: 'settings',
      device,
      profile: { ...profileSettings, displayName: profile.displayName },
    });
  };

  const openFolderOperation = async (
    operation: 'move' | 'copy',
    entry: ContentEntry,
  ) => {
    const folders = await loadFolderPickerItems(client, profile.rootFolderId);
    setOverlay({
      kind: 'folder-operation',
      operation,
      entry,
      folders,
      disabledIds: disabledFolderIdsFor(entry, folders),
    });
  };

  const openTrash = async () => {
    const folders = await loadFolderPickerItems(client, profile.rootFolderId);
    setOverlay({ kind: 'trash-bin', folders });
  };

  const getActions = (entry: ContentEntry) =>
    createContentActions(entry, {
      open: (value) => void selectWithFlush(value),
      createNote: (folderId) => void createNote(folderId),
      openCreateFolder: (folder) => {
        if (folder.kind === 'folder') {
          setOverlay({ kind: 'create-folder', parentFolderId: folder.id });
        }
      },
      rename: (value) => setOverlay({ kind: 'rename', entry: value }),
      openMove: (value) => void openFolderOperation('move', value),
      openCopy: (value) => void openFolderOperation('copy', value),
      toggleFavorite: (value) => void controller.toggleFavorite(value),
      export: (value) => {
        if (value.kind === 'note') {
          if (exportStore.getSnapshot()?.state !== 'RUNNING')
            exportStore.clear();
          setOverlay({ kind: 'export-note', note: value });
        }
      },
      openTrash: (value) => setOverlay({ kind: 'trash', entry: value }),
    });

  const handleNoteMore = async (
    action: NoteMoreAction,
    entry: Extract<ContentEntry, { kind: 'note' }>,
  ) => {
    if (action === 'move' || action === 'copy') {
      void openFolderOperation(action, entry);
      return;
    }
    if (action === 'trash') {
      setOverlay({ kind: 'trash', entry });
      return;
    }
    if (action === 'create-version') {
      setOverlay({
        kind: 'create-version',
        note: entry,
        defaultName: localVersionName(new Date()),
      });
      return;
    }
    if (action === 'history') {
      const folders = await loadFolderPickerItems(client, profile.rootFolderId);
      setOverlay({ kind: 'history', note: entry, folders });
      return;
    }
    if (exportStore.getSnapshot()?.state !== 'RUNNING') exportStore.clear();
    setOverlay({ kind: 'export-note', note: entry });
  };
  let createFolderParentId = profile.rootFolderId;
  if (selection?.kind === 'folder') {
    createFolderParentId = selection.id;
  } else if (selection?.kind === 'note') {
    createFolderParentId = selection.folderId;
  }

  return (
    <>
      <ResizableNavigation
        profileName={profile.displayName}
        onLock={() => void client.request('profile.lock', {})}
        onSettings={() => void openSettings()}
        tree={
          <QueryContentTree
            client={client}
            profileId={profile.localProfileId}
            rootFolderId={profile.rootFolderId}
            expandedIds={expandedIds}
            selected={selection}
            onOpen={(entry) => void selectWithFlush(entry)}
            onToggle={(folderId, expanded) =>
              setExpandedIds((current) => {
                const next = new Set(current);
                if (expanded) next.add(folderId);
                else next.delete(folderId);
                return next;
              })
            }
            onCreateNote={(entry) => void createNote(entry.id)}
            onCreateFolder={(entry) =>
              setOverlay({ kind: 'create-folder', parentFolderId: entry.id })
            }
            getActions={getActions}
          />
        }
        onFavorites={() => setOverlay({ kind: 'favorites' })}
        onSearch={() => setOverlay({ kind: 'search' })}
        onRecent={() => setOverlay({ kind: 'recent' })}
        onTrash={() => void openTrash()}
        onCreateNote={() => void createNote()}
        onCreateFolder={() =>
          setOverlay({
            kind: 'create-folder',
            parentFolderId: createFolderParentId,
          })
        }
      >
        {children ?? (
          <NoteWorkspace
            client={client}
            profileId={profile.localProfileId}
            note={selection?.kind === 'note' ? selection : undefined}
            initiallyEditing={
              selection?.kind === 'note' && editingNoteId === selection.id
            }
            lifecycle={lifecycle}
            writeCoordinator={writeCoordinator}
            onMore={handleNoteMore}
          />
        )}
      </ResizableNavigation>
      <ModalHost modal={modal} onClose={() => setOverlay(undefined)} />
    </>
  );
}
