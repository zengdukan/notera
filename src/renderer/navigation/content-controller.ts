import type { QueryClient } from '@tanstack/react-query';

import {
  favoritesKey,
  folderPathsKey,
  noteKey,
  recentKey,
  searchesKey,
  treeKey,
  trashKey,
} from '../app/query-keys';
import type { NoteraClient } from '../platform/notera-client';
import type { NoteMutationGuard } from '../notes/note-mutation-guard';
import type { NoteWriteCoordinator } from '../notes/note-write-coordinator';
import { resolveCreationFolderId, type NavigationSelection } from './navigation-reducer';

export type ContentEntry =
  | {
      readonly kind: 'folder';
      readonly id: string;
      readonly name: string;
      readonly parentId: string;
      readonly updatedAt: number;
      readonly hasChildren: boolean;
    }
  | {
      readonly kind: 'note';
      readonly id: string;
      readonly title: string;
      readonly folderId: string;
      readonly contentVersion: number;
      readonly updatedAt: number;
    };

function noteSummary(value: Extract<ContentEntry, { kind: 'note' }> & Record<string, unknown>) {
  return {
    kind: 'note' as const,
    id: value.id,
    title: value.title,
    folderId: value.folderId,
    contentVersion: value.contentVersion,
    updatedAt: value.updatedAt,
  };
}

export function createContentController(input: {
  readonly client: NoteraClient;
  readonly queryClient: QueryClient;
  readonly profileId: string;
  readonly rootFolderId: string;
  readonly getSelection: () => NavigationSelection | ContentEntry | undefined;
  readonly guard: NoteMutationGuard;
  readonly writeCoordinator?: Pick<NoteWriteCoordinator, 'run'>;
  readonly select: (entry: ContentEntry | undefined) => void;
  readonly beginEditing: (noteId: string) => void;
}) {
  const invalidateTree = (folderId: string) =>
    input.queryClient.invalidateQueries({ queryKey: treeKey(input.profileId, folderId) });
  const guardsCurrentNote = (entry: ContentEntry) => {
    const selection = input.getSelection();
    return entry.kind === 'note' && selection?.kind === 'note' && selection.id === entry.id;
  };
  const isSelected = (entry: ContentEntry) => {
    const selection = input.getSelection();
    return selection?.kind === entry.kind && selection.id === entry.id;
  };
  const syncSelection = (previous: ContentEntry, next: ContentEntry) => {
    if (isSelected(previous)) input.select(next);
  };
  const invalidatePathsAndSearch = () => Promise.all([
    input.queryClient.invalidateQueries({ queryKey: folderPathsKey(input.profileId) }),
    input.queryClient.invalidateQueries({ queryKey: searchesKey(input.profileId) }),
  ]);
  const invalidateNoteViews = (noteId: string) => Promise.all([
    input.queryClient.invalidateQueries({ queryKey: noteKey(input.profileId, noteId) }),
    input.queryClient.invalidateQueries({ queryKey: recentKey(input.profileId) }),
    input.queryClient.invalidateQueries({ queryKey: favoritesKey(input.profileId) }),
    input.queryClient.invalidateQueries({ queryKey: searchesKey(input.profileId) }),
  ]);
  const ready = async (entry: ContentEntry, operation: 'move' | 'copy' | 'trash') =>
    guardsCurrentNote(entry) ? input.guard.flushBefore(operation) : 'ready';

  return Object.freeze({
    async createNote(parentFolderId?: string): Promise<void> {
      const folderId = parentFolderId ?? resolveCreationFolderId(
        input.rootFolderId,
        input.getSelection() as NavigationSelection | undefined,
      );
      const created = await input.client.request('note.create', { folderId, title: '' });
      await invalidateTree(folderId);
      const summary = noteSummary(created);
      input.select(summary);
      input.beginEditing(summary.id);
    },
    async createFolder(parentFolderId: string, name: string): Promise<void> {
      await input.client.request('contentTree.createFolder', { parentFolderId, name });
      await invalidateTree(parentFolderId);
    },
    async rename(entry: ContentEntry, name: string): Promise<void> {
      if (entry.kind === 'folder') {
        const renamed = await input.client.request('contentTree.renameFolder', {
          folderId: entry.id,
          name,
        });
        syncSelection(entry, renamed);
        await Promise.all([
          invalidateTree(entry.parentId),
          invalidatePathsAndSearch(),
        ]);
      } else {
        const rename = () => input.client.request('note.rename', {
          noteId: entry.id,
          title: name,
        });
        const renamed = input.writeCoordinator
          ? await input.writeCoordinator.run(entry.id, rename)
          : await rename();
        syncSelection(entry, renamed);
        await Promise.all([
          invalidateTree(entry.folderId),
          invalidateNoteViews(entry.id),
        ]);
      }
    },
    async move(entry: ContentEntry, targetFolderId: string): Promise<'ready' | 'blocked'> {
      if ((await ready(entry, 'move')) === 'blocked') return 'blocked';
      if (entry.kind === 'folder') {
        const moved = await input.client.request('contentTree.moveFolder', {
          folderId: entry.id,
          targetParentId: targetFolderId,
        });
        syncSelection(entry, moved);
        await Promise.all([
          invalidateTree(entry.parentId),
          invalidateTree(targetFolderId),
          invalidatePathsAndSearch(),
        ]);
      } else {
        const moved = await input.client.request('note.move', { noteId: entry.id, targetFolderId });
        syncSelection(entry, moved);
        await Promise.all([
          invalidateTree(entry.folderId),
          invalidateTree(targetFolderId),
          invalidatePathsAndSearch(),
          invalidateNoteViews(entry.id),
        ]);
      }
      return 'ready';
    },
    async copy(entry: ContentEntry, targetFolderId: string): Promise<'ready' | 'blocked'> {
      if ((await ready(entry, 'copy')) === 'blocked') return 'blocked';
      if (entry.kind === 'note') {
        await input.client.request('note.copy', { noteId: entry.id, targetFolderId });
      }
      await Promise.all([
        invalidateTree(targetFolderId),
        input.queryClient.invalidateQueries({ queryKey: searchesKey(input.profileId) }),
      ]);
      return 'ready';
    },
    async trash(entry: ContentEntry): Promise<'ready' | 'blocked'> {
      if ((await ready(entry, 'trash')) === 'blocked') return 'blocked';
      if (entry.kind === 'folder') {
        await input.client.request('contentTree.trashFolder', { folderId: entry.id });
        await Promise.all([invalidateTree(entry.parentId), invalidatePathsAndSearch()]);
      } else {
        await input.client.request('note.trash', { noteId: entry.id });
        await Promise.all([
          invalidateTree(entry.folderId),
          input.queryClient.invalidateQueries({ queryKey: searchesKey(input.profileId) }),
        ]);
        if (guardsCurrentNote(entry)) input.select(undefined);
      }
      await Promise.all([
        input.queryClient.invalidateQueries({ queryKey: trashKey(input.profileId) }),
        input.queryClient.invalidateQueries({ queryKey: recentKey(input.profileId) }),
        input.queryClient.invalidateQueries({ queryKey: favoritesKey(input.profileId) }),
        input.queryClient.removeQueries({ queryKey: noteKey(input.profileId, entry.id) }),
      ]);
      return 'ready';
    },
  });
}

export type ContentController = ReturnType<typeof createContentController>;
