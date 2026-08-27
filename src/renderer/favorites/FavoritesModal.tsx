import Button, { IconButton } from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import StarUnstarredIcon from '@atlaskit/icon/core/star-unstarred';
import SectionMessage from '@atlaskit/section-message';
import Spinner from '@atlaskit/spinner';
import { Inline, Stack } from '@atlaskit/primitives';
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { favoritesKey, noteKey } from '../app/query-keys';
import type { NoteraClient, RequestData } from '../platform/notera-client';
import {
  uniqueFavorites,
  useFavorites,
  type FavoriteNote,
} from './favorite-queries';

type FavoritePages = InfiniteData<
  RequestData<'favorite.list'>,
  string | undefined
>;

function withoutFavorite(data: FavoritePages | undefined, noteId: string) {
  if (data === undefined) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== noteId),
    })),
  };
}

export function FavoritesModal({
  client,
  profileId,
  onOpen,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly onOpen: (
    note: FavoriteNote,
  ) => Promise<boolean | void> | boolean | void;
}) {
  const queryClient = useQueryClient();
  const favorites = useFavorites({ client, profileId });
  const mutation = useMutation({
    mutationFn: (note: FavoriteNote) =>
      client.request('favorite.remove', { noteId: note.id }),
    onMutate: async (note) => {
      const listKey = favoritesKey(profileId);
      const detailKey = noteKey(profileId, note.id);
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousList = queryClient.getQueryData<FavoritePages>(listKey);
      const previousDetail = queryClient.getQueryData(detailKey);
      queryClient.setQueryData<FavoritePages>(listKey, (current) =>
        withoutFavorite(current, note.id),
      );
      queryClient.setQueryData<Record<string, unknown>>(detailKey, (current) =>
        current === undefined ? current : { ...current, isFavorite: false },
      );
      return { previousList, previousDetail, detailKey, listKey };
    },
    onError: (_error, _note, context) => {
      if (context?.previousList !== undefined) {
        queryClient.setQueryData(context.listKey, context.previousList);
      }
      if (context?.previousDetail !== undefined) {
        queryClient.setQueryData(context.detailKey, context.previousDetail);
      }
    },
    onSettled: async (_data, _error, note) => {
      await queryClient.invalidateQueries({
        queryKey: favoritesKey(profileId),
      });
      await queryClient.invalidateQueries({
        queryKey: noteKey(profileId, note.id),
      });
    },
  });
  const items = uniqueFavorites(favorites.data?.pages);

  if (favorites.isPending) return <Spinner label="Loading favorites" />;
  if (favorites.isError) {
    return (
      <SectionMessage appearance="error" title="Could not load favorites">
        Close this dialog and try again.
      </SectionMessage>
    );
  }
  if (items.length === 0)
    return (
      <EmptyState
        header="No favorites yet"
        description="Favorite a note to find it here."
      />
    );
  return (
    <Stack space="space.100">
      {mutation.isError ? (
        <SectionMessage appearance="error" title="Could not update favorite">
          The previous favorite state was restored.
        </SectionMessage>
      ) : null}
      {items.map((note) => (
        <Inline key={note.id} alignBlock="center" spread="space-between">
          <Button
            appearance="subtle"
            onClick={() => void onOpen(note)}
            aria-label={`Open ${note.title || 'Untitled'}`}
          >
            {note.title || 'Untitled'}
          </Button>
          <IconButton
            label={`Remove ${note.title || 'Untitled'} from favorites`}
            icon={StarUnstarredIcon}
            appearance="subtle"
            onClick={() => mutation.mutate(note)}
          />
        </Inline>
      ))}
      {favorites.hasNextPage ? (
        <Button
          appearance="subtle"
          isLoading={favorites.isFetchingNextPage}
          onClick={() => void favorites.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </Stack>
  );
}
