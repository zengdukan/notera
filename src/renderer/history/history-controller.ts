import type { QueryClient } from '@tanstack/react-query';

import { historyKey, noteKey, recentKey, treeKey } from '../app/query-keys';
import type { ActiveDocumentLifecycle } from '../notes/document-lifecycle';
import type { NoteWriteCoordinator } from '../notes/note-write-coordinator';
import {
  NoteraClientError,
  type NoteraClient,
  type RequestData,
} from '../platform/notera-client';

export interface HistoryController {
  create(input: {
    readonly noteId: string;
    readonly versionName: string;
  }): Promise<void>;
  compare(input: {
    readonly noteId: string;
    readonly versionId: string;
  }): Promise<RequestData<'history.compare'>>;
  copy(input: {
    readonly noteId: string;
    readonly versionId: string;
    readonly targetFolderId: string;
  }): Promise<void>;
  restore(input: {
    readonly noteId: string;
    readonly versionId: string;
  }): Promise<void>;
}

export function createHistoryController(input: {
  readonly client: NoteraClient;
  readonly queryClient: QueryClient;
  readonly profileId: string;
  readonly lifecycle: ActiveDocumentLifecycle;
  readonly writeCoordinator: NoteWriteCoordinator;
  readonly onRestored: (detail: RequestData<'note.get'>) => void;
  readonly onMissing?: (noteId: string) => void;
}): HistoryController {
  return {
    async create(value) {
      await input.lifecycle.flush();
      await input.writeCoordinator.run(value.noteId, () =>
        input.client.request('history.createPermanent', value),
      );
      await input.queryClient.invalidateQueries({
        queryKey: historyKey(input.profileId, value.noteId),
      });
    },
    compare(value) {
      return input.client.request('history.compare', {
        noteId: value.noteId,
        left: { source: 'CURRENT' },
        right: { source: 'VERSION', versionId: value.versionId },
      });
    },
    async copy(value) {
      await input.client.request('history.copy', value);
      await input.queryClient.invalidateQueries({
        queryKey: treeKey(input.profileId, value.targetFolderId),
      });
    },
    async restore(value) {
      try {
        await input.lifecycle.flush();
        const restored = await input.writeCoordinator.run(
          value.noteId,
          async () => {
            const current = await input.client.request('note.get', {
              noteId: value.noteId,
            });
            await input.client.request('history.restore', {
              ...value,
              expectedContentVersion: current.contentVersion,
            });
            return input.client.request('note.get', { noteId: value.noteId });
          },
        );
        input.queryClient.setQueryData(
          noteKey(input.profileId, value.noteId),
          restored,
        );
        await Promise.all([
          input.queryClient.invalidateQueries({
            queryKey: historyKey(input.profileId, value.noteId),
          }),
          input.queryClient.invalidateQueries({
            queryKey: treeKey(input.profileId, restored.folderId),
          }),
          input.queryClient.invalidateQueries({
            queryKey: recentKey(input.profileId),
          }),
        ]);
        input.onRestored(restored);
      } catch (error) {
        if (
          error instanceof NoteraClientError &&
          error.code === 'ENTITY_NOT_FOUND'
        ) {
          await input.queryClient.invalidateQueries({
            queryKey: historyKey(input.profileId, value.noteId),
          });
          input.onMissing?.(value.noteId);
        }
        throw error;
      }
    },
  };
}
