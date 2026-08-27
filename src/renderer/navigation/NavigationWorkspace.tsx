import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { Text } from '@atlaskit/primitives';
import { useQueryClient } from '@tanstack/react-query';

import {
  useSession,
  type SessionAction,
  type UnlockedSession,
} from '../app/session';
import type { NoteraClient } from '../platform/notera-client';
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
import { ModalHost, type HostedModal } from '../shared-ui/ModalHost';
import { createContentActions } from './content-actions';
import {
  createContentController,
  type ContentEntry,
} from './content-controller';
import { NavigationHeader } from './NavigationHeader';
import { ResizableNavigation } from './ResizableNavigation';
import { QueryContentTree } from './tree-queries';

type Overlay =
  | { readonly kind: 'message'; readonly title: string }
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
      readonly device: { theme: 'SYSTEM' | 'LIGHT' | 'DARK'; language: 'zh-CN' | 'en' };
      readonly profile: { autoLockMinutes: 1 | 5 | 15 | 30 | 60 };
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
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<ContentEntry>();
  const [editingNoteId, setEditingNoteId] = useState<string>();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [overlay, setOverlay] = useState<Overlay>();
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
    [client, lifecycle, profile.localProfileId, profile.rootFolderId, queryClient, selection, writeCoordinator],
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

  const modal = useMemo<HostedModal | null>(() => {
    if (overlay === undefined) return null;
    if (overlay.kind === 'message') {
      return { kind: overlay.kind, title: overlay.title, content: <Text>Available in this offline workspace.</Text> };
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
            initialName={overlay.entry.kind === 'folder' ? overlay.entry.name : overlay.entry.title}
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
        title: 'Move to trash',
        content: (
          <TrashContentModal
            name={overlay.entry.kind === 'folder' ? overlay.entry.name : overlay.entry.title || 'Untitled'}
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
              const result = overlay.operation === 'move'
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
      title: 'Settings',
      content: (
        <SettingsModal
          device={overlay.device}
          profile={overlay.profile}
          onUpdateDevice={async (value) => {
            const device = await client.request('settings.updateDevice', value);
            setOverlay({ ...overlay, device });
          }}
          onUpdateProfile={async (value) => {
            const nextProfile = await client.request('settings.updateProfile', value);
            setOverlay({ ...overlay, profile: nextProfile });
          }}
          onRenameProfile={async (displayName) => {
            const renamed = await client.request('profile.rename', { displayName });
            dispatch({ type: 'unlocked', profile: { ...profile, displayName: renamed.displayName } });
          }}
          onChangePassword={async (value) => {
            await client.request('profile.changePassword', value);
          }}
          onLock={async () => {
            await client.request('profile.lock', {});
            setOverlay(undefined);
          }}
          onRemove={async () => {
            await client.request('profile.removeFromDevice', { localProfileId: profile.localProfileId });
            setOverlay(undefined);
          }}
        />
      ),
    };
  }, [client, controller, dispatch, overlay, profile]);

  const openSettings = async () => {
    const [device, profileSettings] = await Promise.all([
      client.request('settings.getDevice', {}),
      client.request('settings.getProfile', {}),
    ]);
    setOverlay({ kind: 'settings', device, profile: profileSettings });
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

  const getActions = (entry: ContentEntry) => createContentActions(entry, {
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
    openTrash: (value) => setOverlay({ kind: 'trash', entry: value }),
  });

  const handleNoteMore = (action: NoteMoreAction, entry: Extract<ContentEntry, { kind: 'note' }>) => {
    if (action === 'move' || action === 'copy') {
      void openFolderOperation(action, entry);
      return;
    }
    if (action === 'trash') {
      setOverlay({ kind: 'trash', entry });
      return;
    }
    const titles: Record<Exclude<NoteMoreAction, 'move' | 'copy' | 'trash'>, string> = {
      'create-version': 'Create version',
      history: 'History',
      export: 'Export',
    };
    setOverlay({ kind: 'message', title: titles[action] });
  };

  return (
    <>
      <ResizableNavigation
        header={(
          <NavigationHeader
            profileName={profile.displayName}
            onLock={() => void client.request('profile.lock', {})}
            onSearch={() => setOverlay({ kind: 'message', title: 'Search' })}
            onCreateNote={() => void createNote()}
            onCreateFolder={() => setOverlay({ kind: 'create-folder', parentFolderId: selection?.kind === 'folder' ? selection.id : selection?.kind === 'note' ? selection.folderId : profile.rootFolderId })}
          />
        )}
        tree={(
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
                if (expanded) next.add(folderId); else next.delete(folderId);
                return next;
              })
            }
            onCreateNote={(entry) => void createNote(entry.id)}
            onCreateFolder={(entry) => setOverlay({ kind: 'create-folder', parentFolderId: entry.id })}
            getActions={getActions}
          />
        )}
        onFavorites={() => setOverlay({ kind: 'message', title: 'Favorites' })}
        onRecent={() => setOverlay({ kind: 'message', title: 'Recent' })}
        onTrash={() => setOverlay({ kind: 'message', title: 'Trash' })}
        onSettings={() => void openSettings()}
      >
        {children ?? (
          <NoteWorkspace
            client={client}
            profileId={profile.localProfileId}
            note={selection?.kind === 'note' ? selection : undefined}
            initiallyEditing={selection?.kind === 'note' && editingNoteId === selection.id}
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
