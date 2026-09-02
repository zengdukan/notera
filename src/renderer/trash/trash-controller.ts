import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import {
  folderPathsKey,
  searchesKey,
  trashKey,
  treeKey,
  treesKey,
} from '../app/query-keys';
import {
  NoteraClientError,
  type NoteraClient,
  type RequestData,
} from '../platform/notera-client';

type TrashPages = InfiniteData<RequestData<'trash.list'>, string | undefined>;
export type RestoreTrashResult = 'restored' | 'target-required' | 'missing';

export interface TrashController {
  restore(input: {
    readonly trashEntryId: string;
    readonly targetFolderId?: string;
  }): Promise<RestoreTrashResult>;
  deletePermanent(trashEntryId: string): Promise<'deleted' | 'missing'>;
}

function withoutEntry(data: TrashPages | undefined, trashEntryId: string) {
  if (data === undefined) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.trashEntryId !== trashEntryId),
    })),
  };
}

export function createTrashController(input: {
  readonly client: NoteraClient;
  readonly queryClient: QueryClient;
  readonly profileId: string;
}): TrashController {
  const remove = (trashEntryId: string) => {
    input.queryClient.setQueryData<TrashPages>(
      trashKey(input.profileId),
      (current) => withoutEntry(current, trashEntryId),
    );
  };
  const refreshMissing = async () => {
    await input.queryClient.invalidateQueries({
      queryKey: trashKey(input.profileId),
    });
  };
  const missingCode = (error: unknown) =>
    error instanceof NoteraClientError &&
    (error.code === 'ENTITY_NOT_FOUND' || error.code === 'TRASH_ENTRY_EXPIRED');
  return {
    async restore(value) {
      try {
        await input.client.request('trash.restore', value);
        remove(value.trashEntryId);
        await Promise.all([
          input.queryClient.invalidateQueries({
            queryKey:
              value.targetFolderId === undefined
                ? treesKey(input.profileId)
                : treeKey(input.profileId, value.targetFolderId),
          }),
          input.queryClient.invalidateQueries({
            queryKey: folderPathsKey(input.profileId),
          }),
          input.queryClient.invalidateQueries({
            queryKey: searchesKey(input.profileId),
          }),
        ]);
        return 'restored';
      } catch (error) {
        if (
          error instanceof NoteraClientError &&
          error.code === 'TRASH_TARGET_REQUIRED'
        ) {
          return 'target-required';
        }
        if (missingCode(error)) {
          await refreshMissing();
          return 'missing';
        }
        throw error;
      }
    },
    async deletePermanent(trashEntryId) {
      try {
        await input.client.request('trash.deletePermanent', { trashEntryId });
        remove(trashEntryId);
        return 'deleted';
      } catch (error) {
        if (missingCode(error)) {
          await refreshMissing();
          return 'missing';
        }
        throw error;
      }
    },
  };
}
