/** @jest-environment jsdom */

import { useEffect, type ReactNode } from 'react';
import Button from '@atlaskit/button/new';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render as testingRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { messagesFor, type AppLocale } from '../../app/i18n';
import { SessionProvider, useSession } from '../../app/session';
import type { NoteraClient } from '../../platform/notera-client';
import { deviceSettingsKey } from '../../settings/settings-queries';
import { ActiveDocumentLifecycle } from '../../notes/document-lifecycle';
import { NoteWriteCoordinator } from '../../notes/note-write-coordinator';

import type { ContentAction } from '../content-actions';
import { NavigationWorkspace } from '../NavigationWorkspace';

const firstNote = {
  kind: 'note' as const,
  id: 'first',
  title: 'First',
  folderId: 'root',
  contentVersion: 1,
  updatedAt: 1,
  isFavorite: false,
};
const secondNote = {
  ...firstNote,
  id: 'second',
  title: 'Second',
  isFavorite: true,
};
const mockFlush = jest.fn(async () => undefined);
let mockSettingsModalProps:
  | {
      readonly profile: { autoLockMinutes: number; displayName: string };
      readonly onUpdateDevice: (value: {
        theme: 'SYSTEM' | 'LIGHT' | 'DARK';
      }) => Promise<void>;
      readonly onRenameProfile: (displayName: string) => Promise<string>;
      readonly onRemove: () => Promise<'removed' | 'cancelled'>;
    }
  | undefined;

function settingsModalProps() {
  if (mockSettingsModalProps === undefined) {
    throw new Error('Settings modal props are unavailable.');
  }
  return mockSettingsModalProps;
}

jest.mock('../ResizableNavigation', () => ({
  ResizableNavigation: ({
    profileName,
    tree,
    children,
    onFavorites,
    onRecent,
    onTrash,
    onSearch,
    onLock,
    onSettings,
  }: {
    profileName: string;
    tree: ReactNode;
    children: ReactNode;
    onFavorites(): void;
    onRecent(): void;
    onTrash(): void;
    onSearch(): void;
    onLock(): void;
    onSettings(): void;
  }) => (
    <div>
      <button type="button" onClick={onSettings}>
        Open {profileName} settings
      </button>
      <button type="button" onClick={onLock}>
        Lock profile
      </button>
      <button type="button" onClick={onSearch}>
        Search
      </button>
      <button type="button" onClick={onFavorites}>
        Favorites
      </button>
      <button type="button" onClick={onRecent}>
        Recent
      </button>
      <button type="button" onClick={onTrash}>
        Trash
      </button>
      {tree}
      <main>{children}</main>
    </div>
  ),
}));
jest.mock('../tree-queries', () => ({
  QueryContentTree: ({
    onOpen,
    getActions,
  }: {
    onOpen(entry: typeof firstNote): void;
    getActions(entry: typeof firstNote): readonly ContentAction[];
  }) => {
    const favoriteActions = [firstNote, secondNote].map((note) => ({
      noteId: note.id,
      action: getActions(note).find(
        (candidate) => candidate.id === 'toggle-favorite',
      ),
    }));
    return (
      <div>
        <button type="button" onClick={() => onOpen(firstNote)}>
          Open first
        </button>
        <button type="button" onClick={() => onOpen(secondNote)}>
          Open second
        </button>
        {favoriteActions.map(({ noteId, action }) => (
          <button
            key={noteId}
            type="button"
            disabled={action?.isDisabled}
            onClick={() => action?.run()}
          >
            {action?.label}
          </button>
        ))}
      </div>
    );
  },
}));
jest.mock('../../notes/NoteWorkspace', () => ({
  NoteWorkspace: ({
    note,
    lifecycle,
    onMore,
  }: {
    note?: typeof firstNote;
    lifecycle: ActiveDocumentLifecycle;
    onMore(
      action: 'create-version' | 'history' | 'export',
      note: typeof firstNote,
    ): void;
  }) => {
    useEffect(() => {
      if (!note) return undefined;
      return lifecycle.attach({
        isDirty: () => true,
        flush: mockFlush,
        stop: jest.fn(),
      });
    }, [lifecycle, note]);
    return (
      <div>
        {note ? `Workspace ${note.title}` : 'No note selected'}
        {note ? (
          <>
            <button
              type="button"
              onClick={() => onMore('create-version', note)}
            >
              Create version
            </button>
            <button type="button" onClick={() => onMore('history', note)}>
              History
            </button>
            <button type="button" onClick={() => onMore('export', note)}>
              Export
            </button>
          </>
        ) : null}
      </div>
    );
  },
}));
jest.mock('../../search/SearchModal', () => ({
  SearchModal: ({ onOpen }: { onOpen(result: unknown): void }) => (
    <button
      type="button"
      onClick={() =>
        onOpen({
          noteId: 'search-note',
          title: 'Search result',
          excerpt: '',
          folderPath: [
            { id: 'root', name: '' },
            { id: 'scoped', name: 'Scoped' },
          ],
          updatedAt: 1,
          highlights: [],
        })
      }
    >
      Open search result
    </button>
  ),
}));
jest.mock('../../favorites/FavoritesModal', () => ({
  FavoritesModal: ({ onClose }: { onClose(): void }) => (
    <div>
      Favorite notes
      <Button onClick={onClose}>Return from favorites</Button>
    </div>
  ),
}));
jest.mock('../../recent/RecentModal', () => ({
  RecentModal: ({ onClose }: { onClose(): void }) => (
    <div>
      Recent notes
      <button type="button" onClick={onClose}>
        Return from recent
      </button>
    </div>
  ),
}));
jest.mock('../../history/CreateVersionModal', () => ({
  CreateVersionModal: () => <div>Create version form</div>,
}));
jest.mock('../../history/HistoryModal', () => ({
  HistoryModal: () => <div>History workspace</div>,
}));
jest.mock('../../trash/TrashModal', () => ({
  TrashModal: () => <div>Trash workspace</div>,
}));
jest.mock('../../export/ExportModal', () => ({
  ExportModal: () => <div>Export workspace</div>,
}));
jest.mock('../../settings/SettingsModal', () => ({
  SettingsModal: (props: typeof mockSettingsModalProps) => {
    mockSettingsModalProps = props;
    return <div>Profile settings</div>;
  },
}));
jest.mock('../../shared-ui/ModalHost', () => ({
  ModalHost: ({
    modal,
  }: {
    modal: { title: string; content: ReactNode; width?: number } | null;
  }) =>
    modal === null ? null : (
      <div
        role="dialog"
        aria-label={modal.title}
        data-modal-width={modal.width}
      >
        {modal.content}
      </div>
    ),
}));

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
  return children;
}

function render(ui: ReactNode, locale: AppLocale = 'en') {
  return testingRender(
    <IntlProvider locale={locale} messages={messagesFor(locale)}>
      {ui}
    </IntlProvider>,
  );
}

describe('NavigationWorkspace', () => {
  it('toggles tree note favorites from their content menus', async () => {
    const user = userEvent.setup();
    const request = jest.fn(async () => ({}));
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

    const addFavorite = await screen.findByRole('button', {
      name: 'Add to favorites',
    });
    expect(addFavorite).toBeEnabled();
    await user.click(addFavorite);

    expect(request).toHaveBeenCalledWith('favorite.add', {
      noteId: firstNote.id,
    });

    const removeFavorite = screen.getByRole('button', {
      name: 'Remove from favorites',
    });
    expect(removeFavorite).toBeEnabled();
    await user.click(removeFavorite);

    expect(request).toHaveBeenCalledWith('favorite.remove', {
      noteId: secondNote.id,
    });
  });

  it('shares tree selection with the central note workspace', async () => {
    const user = userEvent.setup();
    const client = {
      request: jest.fn(),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;
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
    await user.click(
      screen.getByRole('button', { name: 'Open search result' }),
    );
    expect(await screen.findByText('Workspace Search result')).toBeVisible();
    expect(request).toHaveBeenCalledWith('note.get', { noteId: 'search-note' });
    expect(
      screen.queryByRole('dialog', { name: 'Search' }),
    ).not.toBeInTheDocument();
  });

  it('opens search from the side navigation action', async () => {
    const user = userEvent.setup();
    const client = {
      request: jest.fn(),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider>
          <Unlock>
            <NavigationWorkspace client={client} />
          </Unlock>
        </SessionProvider>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeVisible();
  });

  it('opens settings from the current profile app logo action', async () => {
    mockSettingsModalProps = undefined;
    const user = userEvent.setup();
    const request = jest.fn(async (key: string) => {
      if (key === 'settings.getDevice') {
        return { theme: 'SYSTEM', language: 'en' };
      }
      if (key === 'settings.getProfile') return { autoLockMinutes: 15 };
      if (key === 'settings.updateDevice') {
        return { theme: 'DARK', language: 'en' };
      }
      return {};
    });
    const client = { request, subscribe: jest.fn() } as unknown as NoteraClient;
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Unlock>
            <NavigationWorkspace client={client} />
          </Unlock>
        </SessionProvider>
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole('button', {
        name: 'Open Profile settings',
      }),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Settings' }),
    ).toBeVisible();
    expect(request).toHaveBeenCalledWith('settings.getDevice', {});
    expect(request).toHaveBeenCalledWith('settings.getProfile', {});
    expect(queryClient.getQueryData(deviceSettingsKey())).toEqual({
      theme: 'SYSTEM',
      language: 'en',
    });
    expect(settingsModalProps().profile).toEqual({
      autoLockMinutes: 15,
      displayName: 'Profile',
    });
    await act(async () => {
      await settingsModalProps().onUpdateDevice({ theme: 'DARK' });
    });
    expect(queryClient.getQueryData(deviceSettingsKey())).toEqual({
      theme: 'DARK',
      language: 'en',
    });
  });

  it('localizes the settings modal title', async () => {
    const user = userEvent.setup();
    mockSettingsModalProps = undefined;
    const request = jest.fn(async (key: string) => {
      if (key === 'settings.getDevice') {
        return { theme: 'SYSTEM', language: 'zh-CN' };
      }
      if (key === 'settings.getProfile') return { autoLockMinutes: 15 };
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
      'zh-CN',
    );

    await user.click(
      await screen.findByRole('button', { name: 'Open Profile settings' }),
    );
    expect(await screen.findByRole('dialog', { name: '设置' })).toBeVisible();
  });

  it('keeps settings open after cancelled removal and closes after removal', async () => {
    const user = userEvent.setup();
    mockSettingsModalProps = undefined;
    let removalStatus: 'removed' | 'cancelled' = 'cancelled';
    const request = jest.fn(async (key: string) => {
      if (key === 'settings.getDevice') {
        return { theme: 'SYSTEM', language: 'en' };
      }
      if (key === 'settings.getProfile') return { autoLockMinutes: 15 };
      if (key === 'profile.removeFromDevice') {
        return { status: removalStatus };
      }
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

    await user.click(
      await screen.findByRole('button', { name: 'Open Profile settings' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Settings' }),
    ).toBeVisible();

    await act(async () => {
      await settingsModalProps().onRemove();
    });
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    removalStatus = 'removed';
    await act(async () => {
      await settingsModalProps().onRemove();
    });
    expect(
      screen.queryByRole('dialog', { name: 'Settings' }),
    ).not.toBeInTheDocument();
  });

  it('synchronizes a renamed profile with the session and settings state', async () => {
    const user = userEvent.setup();
    mockSettingsModalProps = undefined;
    const request = jest.fn(async (key: string) => {
      if (key === 'settings.getDevice') {
        return { theme: 'SYSTEM', language: 'en' };
      }
      if (key === 'settings.getProfile') return { autoLockMinutes: 15 };
      if (key === 'profile.rename') return { displayName: 'Renamed' };
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

    await user.click(
      await screen.findByRole('button', { name: 'Open Profile settings' }),
    );
    let renamed: string | undefined;
    await act(async () => {
      renamed = await settingsModalProps().onRenameProfile('Renamed');
    });

    expect(renamed).toBe('Renamed');
    expect(request).toHaveBeenCalledWith('profile.rename', {
      displayName: 'Renamed',
    });
    expect(settingsModalProps().profile.displayName).toBe('Renamed');
    expect(
      screen.getByRole('button', { name: 'Open Renamed settings' }),
    ).toBeVisible();
  });

  it('locks the current profile from the side nav header action', async () => {
    const user = userEvent.setup();
    const request = jest.fn(async () => ({}));
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

    await user.click(
      await screen.findByRole('button', { name: 'Lock profile' }),
    );

    expect(request).toHaveBeenCalledWith('profile.lock', {});
  });

  it('opens favorites, recent, and trash product modals from the navigation', async () => {
    const user = userEvent.setup();
    const client = {
      request: jest.fn(async (key: string) =>
        key === 'contentTree.listChildren' ? { items: [] } : {},
      ),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider>
          <Unlock>
            <NavigationWorkspace client={client} />
          </Unlock>
        </SessionProvider>
      </QueryClientProvider>,
      'zh-CN',
    );

    await user.click(await screen.findByRole('button', { name: 'Favorites' }));
    const favoritesDialog = screen.getByRole('dialog', { name: '收藏' });
    expect(screen.getByText('Favorite notes')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Return from favorites' }),
    );
    expect(favoritesDialog).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recent' }));
    const recentDialog = screen.getByRole('dialog', { name: '最近浏览' });
    expect(screen.getByText('Recent notes')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Return from recent' }),
    );
    expect(recentDialog).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trash' }));
    expect(await screen.findByText('Trash workspace')).toBeVisible();
  });

  it('opens create-version and history product modals from the note menu', async () => {
    const user = userEvent.setup();
    const request = jest.fn(async (key: string) => {
      if (key === 'contentTree.listChildren') return { items: [] };
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

    await user.click(await screen.findByRole('button', { name: 'Open first' }));
    await user.click(screen.getByRole('button', { name: 'Create version' }));
    expect(screen.getByText('Create version form')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('History workspace')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByText('Export workspace')).toBeVisible();
  });
});
