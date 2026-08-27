import { useInfiniteQuery } from '@tanstack/react-query';

import { favoritesKey } from '../app/query-keys';
import type { NoteraClient, RequestData } from '../platform/notera-client';

export type FavoriteNote = RequestData<'favorite.list'>['items'][number];

export function useFavorites(input: {
  readonly client: NoteraClient;
  readonly profileId: string;
}) {
  return useInfiniteQuery({
    queryKey: favoritesKey(input.profileId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => input.client.request('favorite.list', {
      limit: 30,
      ...(pageParam === undefined ? {} : { cursor: pageParam }),
    }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function uniqueFavorites(
  pages: readonly { readonly items: readonly FavoriteNote[] }[] | undefined,
): readonly FavoriteNote[] {
  const values = new Map<string, FavoriteNote>();
  pages?.forEach((page) => page.items.forEach((item) => values.set(item.id, item)));
  return [...values.values()];
}
