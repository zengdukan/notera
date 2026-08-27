/** @jest-environment jsdom */

import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionProvider, useSession } from '../../app/session';
import type { NoteraClient } from '../../platform/notera-client';
import { ActiveDocumentLifecycle } from '../../notes/document-lifecycle';
import { NoteWriteCoordinator } from '../../notes/note-write-coordinator';

const firstNote = { kind: 'note' as const, id: 'first', title: 'First', folderId: 'root', contentVersion: 1, updatedAt: 1 };
const secondNote = { ...firstNote, id: 'second', title: 'Second' };
const mockFlush = jest.fn(async () => undefined);

jest.mock('../ResizableNavigation', () => ({
  ResizableNavigation: ({ header, tree, children, onFavorites, onRecent }: {
    header: ReactNode; tree: ReactNode; children: ReactNode;
    onFavorites(): void; onRecent(): void;
  }) => (
    <div>
      {header}
      <button type="button" onClick={onFavorites}>Favorites</button>
      <button type="button" onClick={onRecent}>Recent</button>
      {tree}<main>{children}</main>
    </div>
  ),
}));
jest.mock('../NavigationHeader', () => ({
  NavigationHeader: ({ onSearch }: { onSearch(): void }) => (
    <button type="button" onClick={onSearch}>Search</button>
  ),
}));
jest.mock('../tree-queries', () => ({
  QueryContentTree: ({ onOpen }: { onOpen(entry: typeof firstNote): void }) => (
    <div>
      <button type="button" onClick={() => onOpen(firstNote)}>Open first</button>
      <button type="button" onClick={() => onOpen(secondNote)}>Open second</button>
    </div>
  ),
}));
jest.mock('../../notes/NoteWorkspace', () => ({
  NoteWorkspace: ({ note, lifecycle }: { note?: typeof firstNote; lifecycle: ActiveDocumentLifecycle }) => {
    useEffect(() => {
      if (!note) return undefined;
      return lifecycle.attach({ isDirty: () => true, flush: mockFlush, stop: jest.fn() });
    }, [lifecycle, note]);
    return <div>{note ? `Workspace ${note.title}` : 'No note selected'}</div>;
  },
}));
jest.mock('../../search/SearchModal', () => ({
  SearchModal: ({ onOpen }: { onOpen(result: unknown): void }) => (
    <button type="button" onClick={() => onOpen({
      noteId: 'search-note',
      title: 'Search result',
      excerpt: '',
      folderPath: [
        { id: 'root', name: '' },
        { id: 'scoped', name: 'Scoped' },
      ],
      updatedAt: 1,
      highlights: [],
    })}>
      Open search result
    </button>
  ),
}));
jest.mock('../../favorites/FavoritesModal', () => ({ FavoritesModal: () => <div>Favorite notes</div> }));
jest.mock('../../recent/RecentModal', () => ({ RecentModal: () => <div>Recent notes</div> }));
jest.mock('../../shared-ui/ModalHost', () => ({
  ModalHost: ({ modal }: { modal: { title: string; content: ReactNode } | null }) => (
    modal === null ? null : <div role="dialog" aria-label={modal.title}>{modal.content}</div>
  ),
}));

import { NavigationWorkspace } from '../NavigationWorkspace';

function Unlock({ children }: { children: ReactNode }) {
  const { dispatch } = useSession();
  useEffect(() => {
    dispatch({
      type: 'unlocked',
      profile: {
        state: 'UNLOCKED',
        localProfileId: '11111111-1111-4111-8111-111111111111',
        displayName: 'Profile',
        rootFolderId: '22222222-2222-4222-8222-222222222222',
      },
    });
  }, [dispatch]);
  return <>{children}</>;
}

describe('NavigationWorkspace', () => {
  it('shares tree selection with the central note workspace', async () => {
    const user = userEvent.setup();
    const client = { request: jest.fn(), subscribe: jest.fn() } as unknown as NoteraClient;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider>
          <Unlock>
            <NavigationWorkspace
              client={client}
              lifecycle={new ActiveDocumentLifecycle()}
              writeCoordinator={new NoteWriteCoordinator()}
            />
          </Unlock>
        </SessionProvider>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Open first' }));
    expect(screen.getByText('Workspace First')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open second' }));
    expect(await screen.findByText('Workspace Second')).toBeVisible();
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it('opens search from Ctrl+J and selects a validated search result', async () => {
    const user = userEvent.setup();
    const detail = {
      kind: 'note' as const,
      id: 'search-note',
      title: 'Search result',
      folderId: 'scoped',
      contentVersion: 1,
      updatedAt: 1,
      createdAt: 1,
      document: { type: 'doc' as const, version: 1 as const },
      isFavorite: false,
      tags: [],
    };
    const request = jest.fn(async (key: string) => {
      if (key === 'note.get') return detail;
      return {};
    });
    const client = { request, subscribe: jest.fn() } as unknown as NoteraClient;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider>
          <Unlock>
            <NavigationWorkspace client={client} />
          </Unlock>
        </SessionProvider>
      </QueryClientProvider>,
    );

    await user.keyboard('{Control>}j{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open search result' }));
    expect(await screen.findByText('Workspace Search result')).toBeVisible();
    expect(request).toHaveBeenCalledWith('note.get', { noteId: 'search-note' });
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
  });

  it('opens favorites and recent product modals from the navigation', async () => {
    const user = userEvent.setup();
    const client = { request: jest.fn(), subscribe: jest.fn() } as unknown as NoteraClient;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider>
          <Unlock>
            <NavigationWorkspace client={client} />
          </Unlock>
        </SessionProvider>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Favorites' }));
    expect(screen.getByText('Favorite notes')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Recent' }));
    expect(screen.getByText('Recent notes')).toBeVisible();
  });
});
