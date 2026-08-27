import { useInfiniteQuery } from '@tanstack/react-query';

import { searchKey } from '../app/query-keys';
import type {
  NoteraClient,
  RequestData,
} from '../platform/notera-client';

export type SearchResult = RequestData<'search.query'>['items'][number];

export function useSearchResults(input: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly query: string;
  readonly folderId?: string;
}) {
  const normalizedQuery = input.query.trim();
  return useInfiniteQuery({
    queryKey: searchKey(input.profileId, normalizedQuery, input.folderId),
    enabled: normalizedQuery.length > 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => input.client.request('search.query', {
      query: normalizedQuery,
      limit: 30,
      ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
      ...(pageParam === undefined ? {} : { cursor: pageParam }),
    }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function uniqueSearchResults(
  pages: readonly { readonly items: readonly SearchResult[] }[] | undefined,
): readonly SearchResult[] {
  const values = new Map<string, SearchResult>();
  pages?.forEach((page) => page.items.forEach((item) => values.set(item.noteId, item)));
  return [...values.values()];
}
