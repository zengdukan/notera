/** @jest-environment jsdom */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { type AppLocale, messagesFor } from '../../app/i18n';
import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import { ResizableNavigation } from '../ResizableNavigation';

configureFeatureFlags();

let desktopViewport = true;
const mediaQueryListeners = new Set<(event: MediaQueryListEvent) => void>();

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: jest.fn((query: string) => ({
    get matches() {
      return query === '(min-width: 64rem)' && desktopViewport;
    },
    media: query,
    onchange: null,
    addEventListener: jest.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        mediaQueryListeners.add(listener),
    ),
    removeEventListener: jest.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        mediaQueryListeners.delete(listener),
    ),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

function setDesktopViewport(matches: boolean) {
  desktopViewport = matches;
  const event = { matches, media: '(min-width: 64rem)' } as MediaQueryListEvent;
  for (const listener of mediaQueryListeners) listener(event);
}

function renderNavigation(locale: AppLocale = 'en') {
  const callbacks = {
    onFavorites: jest.fn(),
    onRecent: jest.fn(),
    onTrash: jest.fn(),
    onSearch: jest.fn(),
    onCreateNote: jest.fn(),
    onCreateFolder: jest.fn(),
    onLock: jest.fn(),
    onSettings: jest.fn(),
  };
  const result = render(
    <IntlProvider locale={locale} messages={messagesFor(locale)}>
      <ResizableNavigation
        profileName="Personal Notes"
        tree={<div>Content tree</div>}
        {...callbacks}
      >
        <div>Central workspace</div>
      </ResizableNavigation>
    </IntlProvider>,
  );
  return { ...result, callbacks };
}

describe('ResizableNavigation', () => {
  beforeEach(() => {
    desktopViewport = true;
    mediaQueryListeners.clear();
  });

  it('localizes the trash navigation action', () => {
    renderNavigation('zh-CN');

    expect(screen.getByRole('button', { name: '回收站' })).toBeVisible();
  });

  it('renders the compact navigation for the ADS narrow viewport layout', () => {
    setDesktopViewport(false);

    renderNavigation();

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('notera-quick-navigation')).toBeInTheDocument();
    expect(screen.getByText('Content tree')).toBeInTheDocument();
    expect(screen.getByText('Central workspace')).toBeVisible();
  });

  it('keeps side nav content mounted for the ADS responsive overlay', async () => {
    renderNavigation();
    expect(screen.getByText('Content tree')).toBeVisible();

    act(() => setDesktopViewport(false));

    expect(
      within(
        screen.getByRole('navigation', { name: 'Notera navigation' }),
      ).getByText('Content tree'),
    ).toBeInTheDocument();
  });

  it('opens profile settings from the current profile menu', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderNavigation();

    const sideNav = screen.getByRole('navigation', {
      name: 'Notera navigation',
    });
    const profileMenu = within(sideNav).getByRole('button', {
      name: 'Open Personal Notes profile menu',
    });
    expect(window.getComputedStyle(profileMenu).overflowY).toBe('visible');
    expect(within(profileMenu).getByText('P')).toBeVisible();
    expect(
      within(profileMenu)
        .getAllByText('Personal Notes')
        .some((element) => !element.hidden),
    ).toBe(true);
    expect(screen.queryByRole('menuitem', { name: 'Settings' })).toBeNull();

    await user.click(profileMenu);
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }));

    expect(callbacks.onSettings).toHaveBeenCalledTimes(1);
  });

  it('locks the current profile from the profile menu', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderNavigation();

    await user.click(
      screen.getByRole('button', {
        name: 'Open Personal Notes profile menu',
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Lock profile' }));

    expect(callbacks.onLock).toHaveBeenCalledTimes(1);
  });

  it('uses ADS side-nav menu items in the two-pane desktop layout', async () => {
    const user = userEvent.setup();
    renderNavigation();

    const sideNav = screen.getByRole('navigation', {
      name: 'Notera navigation',
    });
    expect(sideNav).toBeInTheDocument();
    expect(screen.getByTestId('notera-expanded-side-nav')).toBeInTheDocument();
    expect(within(sideNav).getByRole('list')).toBeVisible();
    expect(screen.getByText('Content tree')).toBeVisible();
    expect(screen.getByText('Central workspace')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    const quickNavigation = await screen.findByRole('navigation', {
      name: 'Notera quick navigation',
    });
    expect(
      screen.queryByTestId('notera-expanded-side-nav'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Content tree')).toBeInTheDocument();
    expect(screen.getByText('Central workspace')).toBeVisible();
    for (const name of [
      'Expand sidebar',
      'Open Personal Notes profile menu',
      'Search',
      'Favorites',
      'Recent',
      'Trash',
    ]) {
      expect(
        within(quickNavigation).getByRole('button', { name }),
      ).toBeVisible();
    }

    await user.click(
      within(quickNavigation).getByRole('button', {
        name: 'Expand sidebar',
      }),
    );
    await waitFor(() => expect(screen.getByText('Content tree')).toBeVisible());
  });

  it('keeps expanded side-nav entries wired to their workspace actions', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderNavigation();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(screen.getByRole('button', { name: 'Favorites' }));
    await user.click(screen.getByRole('button', { name: 'Recent' }));
    await user.click(screen.getByRole('button', { name: 'Trash' }));

    expect(callbacks.onSearch).toHaveBeenCalledTimes(1);
    expect(callbacks.onFavorites).toHaveBeenCalledTimes(1);
    expect(callbacks.onRecent).toHaveBeenCalledTimes(1);
    expect(callbacks.onTrash).toHaveBeenCalledTimes(1);
  });

  it('creates notes and folders from the Notes heading menu', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderNavigation();

    await user.click(
      screen.getByRole('button', { name: 'Create note or folder' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'New note' }));

    expect(callbacks.onCreateNote).toHaveBeenCalledTimes(1);
    expect(callbacks.onCreateFolder).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Create note or folder' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'New folder' }));

    expect(callbacks.onCreateFolder).toHaveBeenCalledTimes(1);
  });

  it('keeps the Notes tree in its own vertical scroll region', () => {
    renderNavigation();

    const notesAreaStyles = window.getComputedStyle(
      screen.getByTestId('notera-notes-area'),
    );
    expect(notesAreaStyles.display).toBe('flex');
    expect(notesAreaStyles.flexDirection).toBe('column');
    expect(notesAreaStyles.height).toBe('100%');
    expect(
      window.getComputedStyle(
        screen.getByTestId('notera-note-tree-scroll-container'),
      ).overflowY,
    ).toBe('auto');
  });

  it('keeps compact navigation entries wired to their workspace actions', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderNavigation();

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    const quickNavigation = await screen.findByRole('navigation', {
      name: 'Notera quick navigation',
    });
    for (const name of ['Search', 'Favorites', 'Recent', 'Trash']) {
      await user.click(within(quickNavigation).getByRole('button', { name }));
    }

    expect(callbacks.onSearch).toHaveBeenCalledTimes(1);
    expect(callbacks.onFavorites).toHaveBeenCalledTimes(1);
    expect(callbacks.onRecent).toHaveBeenCalledTimes(1);
    expect(callbacks.onTrash).toHaveBeenCalledTimes(1);
  });

  it('uses the ADS side-nav splitter to collapse on double click', async () => {
    const user = userEvent.setup();
    renderNavigation();

    await user.dblClick(
      screen.getByRole('slider', { name: 'Resize navigation' }),
    );

    expect(
      await screen.findByRole('navigation', {
        name: 'Notera quick navigation',
      }),
    ).toBeVisible();
  });
});
