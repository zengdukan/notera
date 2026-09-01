import { Fragment } from 'react';
import Button, { IconButton } from '@atlaskit/button/new';
import EmptyState from '@atlaskit/empty-state';
import NoteIcon from '@atlaskit/icon/core/note';
import StarUnstarredIcon from '@atlaskit/icon/core/star-unstarred';
import { ModalBody } from '@atlaskit/modal-dialog';
import { Box, Inline, Stack, Text } from '@atlaskit/primitives';
import SectionMessage from '@atlaskit/section-message';
import { ButtonMenuItem } from '@atlaskit/side-nav-items/button-menu-item';
import { MenuList } from '@atlaskit/side-nav-items/menu-list';
import { SkeletonMenuItem } from '@atlaskit/side-nav-items/skeleton';
import Spinner from '@atlaskit/spinner';
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Divider } from '@atlaskit/side-nav-items/menu-section';

import { favoritesKey, noteKey } from '../app/query-keys';
import type { NoteraClient, RequestData } from '../platform/notera-client';
import { formatRecentTimestamp } from '../recent/recent-format';
import {
  uniqueFavorites,
  useFavorites,
  type FavoriteNote,
} from './favorite-queries';

type FavoritePages = InfiniteData<
  Omit<RequestData<'favorite.list'>, 'items'> & {
    readonly items: readonly FavoriteNote[];
  },
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

function FavoritesLoadingState() {
  const intl = useIntl();
  return (
    <Stack space="space.200">
      <MenuList>
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonMenuItem
            hasElemBefore
            key={index}
            testId="favorite-note-skeleton"
          />
        ))}
      </MenuList>
      <Inline alignBlock="center" alignInline="center" space="space.100">
        <Spinner
          label={intl.formatMessage({ id: 'favorites.loadingLabel' })}
          size="medium"
        />
        <Text color="color.text.subtle" size="small">
          {intl.formatMessage({ id: 'favorites.loadingDescription' })}
        </Text>
      </Inline>
    </Stack>
  );
}

function FavoritesEmptyState({ onClose }: { readonly onClose: () => void }) {
  const intl = useIntl();
  return (
    <EmptyState
      buttonGroupLabel={intl.formatMessage({
        id: 'favorites.emptyActionsLabel',
      })}
      description={intl.formatMessage({ id: 'favorites.emptyDescription' })}
      header={intl.formatMessage({ id: 'favorites.emptyTitle' })}
      headingLevel={2}
      headingSize="xsmall"
      primaryAction={
        <Button appearance="primary" onClick={onClose}>
          {intl.formatMessage({ id: 'favorites.returnToContent' })}
        </Button>
      }
      width="narrow"
    />
  );
}

function FavoritesErrorState({ onRetry }: { readonly onRetry: () => void }) {
  const intl = useIntl();
  return (
    <Stack space="space.300">
      <SectionMessage
        appearance="error"
        headingLevel="h2"
        title={intl.formatMessage({ id: 'favorites.loadErrorTitle' })}
      >
        <Text as="p">
          {intl.formatMessage({ id: 'favorites.loadErrorDescription' })}
        </Text>
        <Button appearance="danger" onClick={onRetry} spacing="compact">
          {intl.formatMessage({ id: 'favorites.retry' })}
        </Button>
      </SectionMessage>
      <Text as="p" color="color.text.subtle" size="small">
        {intl.formatMessage({ id: 'favorites.errorDisclosure' })}
      </Text>
    </Stack>
  );
}

export function FavoritesModal({
  client,
  profileId,
  onOpen,
  onClose,
}: {
  readonly client: NoteraClient;
  readonly profileId: string;
  readonly onOpen: (
    note: FavoriteNote,
  ) => Promise<boolean | void> | boolean | void;
  readonly onClose: () => void;
}) {
  const intl = useIntl();
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

  if (favorites.isPending) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <FavoritesLoadingState />
        </Box>
      </ModalBody>
    );
  }
  if (favorites.isError) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <FavoritesErrorState onRetry={() => void favorites.refetch()} />
        </Box>
      </ModalBody>
    );
  }
  if (items.length === 0) {
    return (
      <ModalBody>
        <Box paddingBlockEnd="space.300">
          <FavoritesEmptyState onClose={onClose} />
        </Box>
      </ModalBody>
    );
  }
  return (
    <ModalBody>
      <Box paddingBlockEnd="space.300">
        <Stack space="space.200">
          <Text as="p" color="color.text.subtle" size="small">
            {intl.formatMessage({ id: 'favorites.sortDescription' })}
          </Text>
          {mutation.isError ? (
            <SectionMessage
              appearance="error"
              headingLevel="h2"
              title={intl.formatMessage({ id: 'favorites.updateErrorTitle' })}
            >
              <Text as="p">
                {intl.formatMessage({
                  id: 'favorites.updateErrorDescription',
                })}
              </Text>
            </SectionMessage>
          ) : null}
          <MenuList>
            {items.map((note) => {
              const title =
                note.title || intl.formatMessage({ id: 'favorites.untitled' });
              return (
                <Fragment key={note.id}>
                  <ButtonMenuItem
                    description={`${note.folderPath.map((item) => item.name).join(' / ')} · ${formatRecentTimestamp(note.updatedAt)}`}
                    elemBefore={<NoteIcon label="" color="currentColor" />}
                    actionsOnHover={
                      <IconButton
                        label={intl.formatMessage(
                          { id: 'favorites.removeLabel' },
                          { title },
                        )}
                        icon={StarUnstarredIcon}
                        appearance="subtle"
                        spacing="compact"
                        isLoading={
                          mutation.isPending &&
                          mutation.variables?.id === note.id
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          mutation.mutate(note);
                        }}
                      />
                    }
                    onClick={() => void onOpen(note)}
                  >
                    {title}
                  </ButtonMenuItem>
                  <Divider />
                </Fragment>
              );
            })}
          </MenuList>
          {favorites.hasNextPage ? (
            <Inline alignInline="center">
              <Button
                isLoading={favorites.isFetchingNextPage}
                onClick={() => void favorites.fetchNextPage()}
              >
                {intl.formatMessage({ id: 'favorites.loadMore' })}
              </Button>
            </Inline>
          ) : null}
        </Stack>
      </Box>
    </ModalBody>
  );
}
