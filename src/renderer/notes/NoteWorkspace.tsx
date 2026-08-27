import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmptyState from '@atlaskit/empty-state';
import { Box, xcss } from '@atlaskit/primitives';
import Spinner from '@atlaskit/spinner';
import { useQueryClient } from '@tanstack/react-query';

import type { RequestData, NoteraClient } from '../platform/notera-client';
import {
  favoritesKey,
  folderPathKey,
  noteKey,
  recentKey,
  treeKey,
} from '../app/query-keys';
import { EditorSurface } from '../editor/EditorSurface';
import { RendererSurface } from '../editor/RendererSurface';
import { ResponsiveEditorToolbar } from '../editor/ResponsiveEditorToolbar';
import type { ToolbarExecutor } from '../editor/toolbar-actions';
import type { ContentEntry } from '../navigation/content-controller';
import { ActiveDocumentLifecycle } from './document-lifecycle';
import {
  createDocumentSession,
  documentSessionReducer,
  type DocumentSessionAction,
  type DocumentSessionState,
} from './document-session';
import { LatestNoteRequest } from './note-queries';
import { NoteWriteCoordinator } from './note-write-coordinator';
import {
  createSaveCoordinator,
  type SaveCoordinator,
} from './save-coordinator';
import { StickyNoteHeader, type NoteMoreAction } from './StickyNoteHeader';

type NoteEntry = Extract<ContentEntry, { kind: 'note' }>;
type LoadedNote = {
  readonly detail: RequestData<'note.get'>;
  readonly path: RequestData<'contentTree.getFolderPath'>['items'];
};

const workspaceStyles = xcss({
  height: '100vh',
  minWidth: '0',
  overflow: 'auto',
  backgroundColor: 'elevation.surface',
});
const toolbarStyles = xcss({
  position: 'sticky',
  top: 'space.0',
  zIndex: 'navigation',
  backgroundColor: 'elevation.surface',
  borderBlockEndColor: 'color.border',
  borderBlockEndStyle: 'solid',
  borderBlockEndWidth: 'border.width',
  paddingBlock: 'space.100',
  paddingInline: 'space.200',
});
const bodyStyles = xcss({
  maxWidth: '100%',
  paddingBlock: 'space.300',
  paddingInline: 'space.400',
});
const centeredStyles = xcss({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '60vh',
});

const noopToolbar: ToolbarExecutor = () => undefined;

export function NoteWorkspace({
  client,
  profileId,
  note,
  initiallyEditing = false,
  lifecycle,
  writeCoordinator,
  onMore,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly note?: NoteEntry;
  readonly initiallyEditing?: boolean;
  readonly lifecycle: ActiveDocumentLifecycle;
  readonly writeCoordinator: NoteWriteCoordinator;
  readonly onMore: (action: NoteMoreAction, note: NoteEntry) => void;
}) {
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState<LoadedNote>();
  const [session, setSession] = useState<DocumentSessionState>();
  const [loadError, setLoadError] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [executeToolbar, setExecuteToolbar] = useState<ToolbarExecutor>(
    () => noopToolbar,
  );
  const sessionRef = useRef<DocumentSessionState>();
  const coordinatorRef = useRef<SaveCoordinator>();

  const dispatchSession = useCallback((action: DocumentSessionAction) => {
    const { current } = sessionRef;
    if (!current) return;
    const next = documentSessionReducer(current, action);
    sessionRef.current = next;
    setSession(next);
  }, []);

  const loader = useMemo(
    () =>
      new LatestNoteRequest<LoadedNote>(
        async (noteId) => {
          const detail = await queryClient.fetchQuery({
            queryKey: noteKey(profileId, noteId),
            queryFn: () => client.request('note.get', { noteId }),
          });
          const path = await queryClient.fetchQuery({
            queryKey: folderPathKey(profileId, detail.folderId),
            queryFn: () =>
              client.request('contentTree.getFolderPath', {
                folderId: detail.folderId,
              }),
          });
          return { detail, path: path.items };
        },
        (_noteId, value) => {
          const next = createDocumentSession({
            noteId: value.detail.id,
            title: value.detail.title,
            document: value.detail.document,
            contentVersion: value.detail.contentVersion,
            savedAt: value.detail.updatedAt,
            mode: initiallyEditing ? 'edit' : 'preview',
          });
          sessionRef.current = next;
          setLoaded(value);
          setSession(next);
          setIsFavorite(value.detail.isFavorite);
          setLoadError(false);
        },
      ),
    [client, initiallyEditing, profileId, queryClient],
  );

  useEffect(() => {
    loader.cancel();
    setLoaded(undefined);
    setSession(undefined);
    sessionRef.current = undefined;
    setLoadError(false);
    if (!note) return undefined;
    void loader.load(note.id).catch(() => setLoadError(true));
    return () => loader.cancel();
  }, [loader, note]);

  useEffect(() => {
    if (!note) return undefined;
    const key = noteKey(profileId, note.id);
    const syncFavoriteFact = () => {
      const detail = queryClient.getQueryData<RequestData<'note.get'>>(key);
      if (detail !== undefined) setIsFavorite(detail.isFavorite);
    };
    syncFavoriteFact();
    return queryClient.getQueryCache().subscribe(syncFavoriteFact);
  }, [note, profileId, queryClient]);

  useEffect(() => {
    if (!sessionRef.current || !loaded) return undefined;
    const coordinator = createSaveCoordinator({
      getState: () => sessionRef.current as DocumentSessionState,
      dispatch: dispatchSession,
      save: async (draft) => {
        const result = await writeCoordinator.run(draft.noteId, () =>
          client.request('note.saveDraft', draft),
        );
        queryClient.setQueryData<RequestData<'note.get'>>(
          noteKey(profileId, draft.noteId),
          (current) =>
            current
              ? {
                  ...current,
                  title: draft.title,
                  document: draft.document,
                  contentVersion: result.contentVersion,
                  updatedAt: result.savedAt,
                }
              : current,
        );
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: treeKey(profileId, loaded.detail.folderId),
          }),
          queryClient.invalidateQueries({ queryKey: recentKey(profileId) }),
        ]);
        return result;
      },
    });
    coordinatorRef.current = coordinator;
    const detach = lifecycle.attach(coordinator);
    return () => {
      detach();
      if (coordinatorRef.current === coordinator)
        coordinatorRef.current = undefined;
    };
  }, [
    client,
    dispatchSession,
    lifecycle,
    loaded,
    profileId,
    queryClient,
    session?.noteId,
    writeCoordinator,
  ]);

  useEffect(() => {
    if (session?.mode !== 'edit') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void coordinatorRef.current?.flush().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session?.mode]);

  const change = (action: DocumentSessionAction) => {
    dispatchSession(action);
    coordinatorRef.current?.schedule();
  };

  const showPreview = async () => {
    try {
      await coordinatorRef.current?.flush();
      dispatchSession({ type: 'show-preview' });
    } catch {
      // The save coordinator already moved the session to the failed state.
    }
  };

  const toggleFavorite = async () => {
    if (!note) return;
    const next = !isFavorite;
    await client.request(next ? 'favorite.add' : 'favorite.remove', {
      noteId: note.id,
    });
    setIsFavorite(next);
    queryClient.setQueryData<RequestData<'note.get'>>(
      noteKey(profileId, note.id),
      (current) => (current ? { ...current, isFavorite: next } : current),
    );
    await queryClient.invalidateQueries({ queryKey: favoritesKey(profileId) });
  };

  const runMore = async (action: NoteMoreAction) => {
    if (!note) return;
    if (action !== 'history') {
      try {
        await coordinatorRef.current?.flush();
      } catch {
        return;
      }
    }
    onMore(action, note);
  };

  if (!note) {
    return (
      <Box xcss={[workspaceStyles, centeredStyles]}>
        <EmptyState
          header="Select a note"
          description="Choose a note from the content tree to preview it."
        />
      </Box>
    );
  }
  if (loadError) {
    return (
      <Box as="div" role="alert" xcss={[workspaceStyles, centeredStyles]}>
        Unable to load this note.
      </Box>
    );
  }
  if (!session || !loaded) {
    return (
      <Box as="div" role="status" xcss={[workspaceStyles, centeredStyles]}>
        <Spinner size="large" label="Loading note" />
      </Box>
    );
  }

  return (
    <Box xcss={workspaceStyles}>
      {session.mode === 'edit' ? (
        <Box xcss={toolbarStyles}>
          <ResponsiveEditorToolbar execute={executeToolbar} />
        </Box>
      ) : null}
      <StickyNoteHeader
        mode={session.mode}
        title={session.draft.title}
        path={loaded.path}
        saveState={session.saveState}
        isFavorite={isFavorite}
        autoFocusTitle={initiallyEditing}
        onTitleChange={(title) => change({ type: 'change-title', title })}
        onToggleFavorite={() => void toggleFavorite()}
        onEdit={() => dispatchSession({ type: 'begin-edit' })}
        onPreview={() => void showPreview()}
        onRetry={() =>
          void coordinatorRef.current?.retry().catch(() => undefined)
        }
        onMore={(action) => void runMore(action)}
      />
      <Box xcss={bodyStyles}>
        {session.mode === 'edit' ? (
          <EditorSurface
            key={session.noteId}
            noteId={session.noteId}
            document={session.draft.document}
            onChange={(document) =>
              change({ type: 'change-document', document })
            }
            onToolbarReady={(execute) => setExecuteToolbar(() => execute)}
            shouldFocus={initiallyEditing}
          />
        ) : (
          <RendererSurface
            noteId={session.noteId}
            document={session.draft.document}
          />
        )}
      </Box>
    </Box>
  );
}
