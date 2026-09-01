/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

import { AppProviders } from '../../app/AppProviders';
import { createAppQueryClient } from '../../app/query-client';
import { noteKey } from '../../app/query-keys';
import type { AppLocale } from '../../app/i18n';
import type { NoteraClient } from '../../platform/notera-client';
import { FavoritesModal } from '../FavoritesModal';

const profileId = '10000000-0000-4000-8000-000000000001';
const note = {
  kind: 'note' as const,
  id: '10000000-0000-4000-8000-000000000004',
  title: 'First',
  folderId: '10000000-0000-4000-8000-000000000003',
  contentVersion: 1,
  updatedAt: 1,
  favoriteSortOrder: 0,
};
const secondNote = {
  ...note,
  id: '10000000-0000-4000-8000-000000000005',
  title: 'Second',
  favoriteSortOrder: 1,
};

function renderFavorites({
  client,
  locale = 'en',
  onClose = jest.fn(),
  onOpen = jest.fn().mockResolvedValue(true),
  queryClient = createAppQueryClient(),
}: {
  readonly client: NoteraClient;
  readonly locale?: AppLocale;
  readonly onClose?: jest.Mock;
  readonly onOpen?: jest.Mock;
  readonly queryClient?: QueryClient;
}) {
  render(
    <AppProviders locale={locale} queryClient={queryClient}>
      <FavoritesModal
        client={client}
        profileId={profileId}
        onOpen={onOpen}
        onClose={onClose}
      />
    </AppProviders>,
  );
  return { onClose, onOpen, queryClient };
}

describe('FavoritesModal', () => {
  it('opens favorites from an ADS menu list and loads the next page', async () => {
    const user = userEvent.setup();
    let pageIndex = 0;
    const pages = [
      { items: [note], nextCursor: 'next' },
      { items: [secondNote] },
    ];
    const request = jest.fn(async () => {
      const page = pages[Math.min(pageIndex, pages.length - 1)];
      pageIndex += 1;
      return page;
    });
    const client = { request, subscribe: jest.fn() } as unknown as NoteraClient;
    const { onOpen } = renderFavorites({ client, locale: 'zh-CN' });

    expect(await screen.findByText('按收藏顺序排列')).toBeVisible();
    expect(screen.getByRole('list')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'First' }));
    expect(onOpen).toHaveBeenCalledWith(note);

    await user.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByRole('button', { name: 'Second' })).toBeVisible();
    expect(
      screen.getByText('仅显示当前本地 Profile 中仍然可用的收藏笔记'),
    ).toBeVisible();
    expect(request).toHaveBeenCalledWith('favorite.list', {
      cursor: 'next',
      limit: 30,
    });
  });

  it('removes a favorite from actionsOnHover without opening the note', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    queryClient.setQueryData(noteKey(profileId, note.id), {
      ...note,
      document: { type: 'doc', version: 1 },
      createdAt: 1,
      isFavorite: true,
      tags: [],
    });
    let removed = false;
    const request = jest.fn(async (key: string) => {
      if (key === 'favorite.list') return { items: removed ? [] : [note] };
      if (key === 'favorite.remove') removed = true;
      return {};
    });
    const client = { request, subscribe: jest.fn() } as unknown as NoteraClient;
    const { onOpen } = renderFavorites({ client, queryClient });

    const item = await screen.findByRole('button', { name: 'First' });
    await user.hover(item);
    const remove = screen.getByRole('button', {
      name: 'Remove First from favorites',
    });
    item.focus();
    await user.tab();
    expect(remove).toHaveFocus();

    await user.click(remove);
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('favorite.remove', {
        noteId: note.id,
      }),
    );
    expect(onOpen).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'First' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      queryClient.getQueryData<{ isFavorite: boolean }>(
        noteKey(profileId, note.id),
      )?.isFavorite,
    ).toBe(false);
  });

  it('shows ADS skeleton menu items and a localized loading announcement', () => {
    const request = jest.fn(
      () =>
        new Promise(() => {
          // Keep the request pending to exercise the loading state.
        }),
    );
    renderFavorites({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
      locale: 'zh-CN',
    });

    expect(screen.getAllByTestId('favorite-note-skeleton')).toHaveLength(3);
    expect(screen.getByLabelText('正在加载收藏')).toBeVisible();
    expect(screen.getByText('正在加载收藏…')).toBeVisible();
  });

  it('returns to the content tree from the empty state', async () => {
    const user = userEvent.setup();
    const client = {
      request: jest.fn(async () => ({ items: [] })),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;
    const { onClose } = renderFavorites({ client, locale: 'zh-CN' });

    expect(await screen.findByText('暂无收藏笔记')).toBeVisible();
    expect(screen.getByText('收藏的笔记会显示在这里。')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '返回内容目录' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('retries a failed favorites request in place', async () => {
    const user = userEvent.setup();
    const request = jest
      .fn()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce({ items: [] });
    renderFavorites({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
      locale: 'zh-CN',
    });

    expect(await screen.findByText('无法加载收藏')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('暂无收藏笔记')).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('restores optimistic favorite state when removal fails', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    queryClient.setQueryData(noteKey(profileId, note.id), {
      ...note,
      document: { type: 'doc', version: 1 },
      createdAt: 1,
      isFavorite: true,
      tags: [],
    });
    const request = jest.fn(async (key: string) => {
      if (key === 'favorite.list') return { items: [note] };
      if (key === 'favorite.remove') throw new Error('remove failed');
      return {};
    });
    renderFavorites({
      client: { request, subscribe: jest.fn() } as unknown as NoteraClient,
      queryClient,
    });

    await user.click(
      await screen.findByRole('button', {
        name: 'Remove First from favorites',
      }),
    );
    expect(await screen.findByText('Could not update favorite')).toBeVisible();
    expect(screen.getByRole('button', { name: 'First' })).toBeVisible();
    expect(
      queryClient.getQueryData<{ isFavorite: boolean }>(
        noteKey(profileId, note.id),
      )?.isFavorite,
    ).toBe(true);
  });
});
