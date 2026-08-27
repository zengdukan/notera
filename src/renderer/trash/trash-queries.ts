import { useInfiniteQuery } from '@tanstack/react-query';

import { trashKey } from '../app/query-keys';
import type { NoteraClient, RequestData } from '../platform/notera-client';

export type TrashItem = RequestData<'trash.list'>['items'][number];

export function useTrashItems(input: {
  readonly client: NoteraClient;
  readonly profileId: string;
}) {
  return useInfiniteQuery({
    queryKey: trashKey(input.profileId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      input.client.request('trash.list', {
        limit: 30,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function uniqueTrashItems(
  pages: readonly { readonly items: readonly TrashItem[] }[] | undefined,
): readonly TrashItem[] {
  const items = new Map<string, TrashItem>();
  pages?.forEach((page) =>
    page.items.forEach((item) => items.set(item.trashEntryId, item)),
  );
  return [...items.values()];
}
