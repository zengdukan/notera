/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

import { AppProviders } from '../../app/AppProviders';
import type { NoteraClient } from '../../platform/notera-client';
import { SearchModal } from '../SearchModal';

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

const ids = {
  profile: '10000000-0000-4000-8000-000000000001',
  root: '10000000-0000-4000-8000-000000000002',
  folder: '10000000-0000-4000-8000-000000000003',
  note: '10000000-0000-4000-8000-000000000004',
};

const result = {
  noteId: ids.note,
  title: '😀 Needle',
  excerpt: 'A matching excerpt',
  folderPath: [
    { id: ids.root, name: '' },
    { id: ids.folder, name: 'Scoped' },
  ],
  updatedAt: 1,
  highlights: [{ field: 'title' as const, start: 2, end: 8 }],
};

describe('SearchModal', () => {
  it('searches all notes, changes to a folder subtree, and opens a result', async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn().mockResolvedValue(true);
    const request = jest.fn(async (key: string) => {
      if (key === 'contentTree.listChildren') {
        return {
          items: [
            {
              kind: 'folder',
              id: ids.folder,
              name: 'Scoped',
              parentId: ids.root,
              updatedAt: 1,
              hasChildren: false,
            },
          ],
        };
      }
      return { items: [result] };
    });
    const client = { request, subscribe: jest.fn() } as unknown as NoteraClient;

    render(
      <AppProviders locale="en" queryClient={new QueryClient()}>
        <SearchModal
          client={client}
          profileId={ids.profile}
          rootFolderId={ids.root}
          onOpen={onOpen}
        />
      </AppProviders>,
    );

    const input = screen.getByRole('searchbox', { name: 'Search notes' });
    expect(input).toHaveFocus();
    await user.type(input, 'needle');
    expect(
      await screen.findByRole('button', { name: 'Open 😀 Needle' }),
    ).toBeVisible();
    expect(screen.getByText('Needle', { selector: 'mark' })).toBeVisible();
    expect(screen.getByText('Root / Scoped')).toBeVisible();
    expect(request).toHaveBeenCalledWith(
      'search.query',
      expect.objectContaining({
        query: 'needle',
        limit: 30,
      }),
    );

    await user.click(
      screen.getByRole('button', { name: 'Search scope: All notes' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Choose Scoped' }),
    );
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'search.query',
        expect.objectContaining({
          query: 'needle',
          folderId: ids.folder,
          limit: 30,
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Open 😀 Needle' }));
    expect(onOpen).toHaveBeenCalledWith(result);
  });
});
