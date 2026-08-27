import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { historyKey, historySnapshotKey } from '../app/query-keys';
import type { NoteraClient, RequestData } from '../platform/notera-client';

export type HistoryItem = RequestData<'history.list'>['items'][number];
export type HistorySnapshot = RequestData<'history.get'>;

export function useHistoryList(input: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly noteId: string;
}) {
  return useInfiniteQuery({
    queryKey: historyKey(input.profileId, input.noteId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => input.client.request('history.list', {
      noteId: input.noteId,
      limit: 30,
      ...(pageParam === undefined ? {} : { cursor: pageParam }),
    }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useHistorySnapshot(input: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly noteId: string;
  readonly versionId?: string;
}) {
  return useQuery({
    queryKey: historySnapshotKey(input.profileId, input.noteId, input.versionId ?? 'none'),
    enabled: input.versionId !== undefined,
    queryFn: () => input.client.request('history.get', {
      noteId: input.noteId,
      versionId: input.versionId as string,
    }),
  });
}

export function uniqueHistoryItems(
  pages: readonly { readonly items: readonly HistoryItem[] }[] | undefined,
): readonly HistoryItem[] {
  const items = new Map<string, HistoryItem>();
  pages?.forEach((page) => page.items.forEach((item) => items.set(item.versionId, item)));
  return [...items.values()];
}
