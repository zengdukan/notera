import { useInfiniteQuery } from '@tanstack/react-query';

import { favoritesKey } from '../app/query-keys';
import type { NoteraClient, RequestData } from '../platform/notera-client';

type FavoriteNoteSummary = RequestData<'favorite.list'>['items'][number];
type FolderPath = RequestData<'contentTree.getFolderPath'>['items'];

export type FavoriteNote = FavoriteNoteSummary & {
  readonly folderPath: FolderPath;
};

export function useFavorites(input: {
  readonly client: NoteraClient;
  readonly profileId: string;
}) {
  return useInfiniteQuery({
    queryKey: favoritesKey(input.profileId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await input.client.request('favorite.list', {
        limit: 30,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      });
      const paths = new Map<string, Promise<{ readonly items: FolderPath }>>();
      const pathFor = (folderId: string) => {
        const current = paths.get(folderId);
        if (current !== undefined) return current;
        const request = input.client.request('contentTree.getFolderPath', {
          folderId,
        });
        paths.set(folderId, request);
        return request;
      };
      return {
        ...page,
        items: await Promise.all(
          page.items.map(async (note) => ({
            ...note,
            folderPath: (await pathFor(note.folderId)).items,
          })),
        ),
      };
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function uniqueFavorites(
  pages: readonly { readonly items: readonly FavoriteNote[] }[] | undefined,
): readonly FavoriteNote[] {
  const values = new Map<string, FavoriteNote>();
  pages?.forEach((page) =>
    page.items.forEach((item) => values.set(item.id, item)),
  );
  return [...values.values()];
}
