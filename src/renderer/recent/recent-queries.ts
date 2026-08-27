import { useInfiniteQuery } from '@tanstack/react-query';

import { recentKey } from '../app/query-keys';
import type { NoteraClient, RequestData } from '../platform/notera-client';

export type RecentNote = RequestData<'note.listRecent'>['items'][number];

export function useRecentNotes(input: {
  readonly client: NoteraClient;
  readonly profileId: string;
}) {
  return useInfiniteQuery({
    queryKey: recentKey(input.profileId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => input.client.request('note.listRecent', {
      limit: 30,
      ...(pageParam === undefined ? {} : { cursor: pageParam }),
    }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function uniqueRecentNotes(
  pages: readonly { readonly items: readonly RecentNote[] }[] | undefined,
): readonly RecentNote[] {
  const values = new Map<string, RecentNote>();
  pages?.forEach((page) => page.items.forEach((item) => values.set(item.id, item)));
  return [...values.values()];
}
