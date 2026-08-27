/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

import { AppProviders } from '../../app/AppProviders';
import { noteKey } from '../../app/query-keys';
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

describe('FavoritesModal', () => {
  it('opens notes and removes a favorite while updating the current note fact', async () => {
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
    const onOpen = jest.fn().mockResolvedValue(true);
    const client = { request, subscribe: jest.fn() } as unknown as NoteraClient;

    render(
      <AppProviders locale="en" queryClient={queryClient}>
        <FavoritesModal client={client} profileId={profileId} onOpen={onOpen} />
      </AppProviders>,
    );

    await user.click(await screen.findByRole('button', { name: 'Open First' }));
    expect(onOpen).toHaveBeenCalledWith(note);
    await user.click(
      screen.getByRole('button', { name: 'Remove First from favorites' }),
    );
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('favorite.remove', {
        noteId: note.id,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Open First' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      queryClient.getQueryData<{ isFavorite: boolean }>(
        noteKey(profileId, note.id),
      )?.isFavorite,
    ).toBe(false);
  });
});
