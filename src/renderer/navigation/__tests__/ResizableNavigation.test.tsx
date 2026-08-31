/** @jest-environment jsdom */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

function renderNavigation() {
  const callbacks = {
    onFavorites: jest.fn(),
    onRecent: jest.fn(),
    onTrash: jest.fn(),
    onLock: jest.fn(),
    onSettings: jest.fn(),
  };
  const result = render(
    <ResizableNavigation
      profileName="Personal Notes"
      tree={<div>Content tree</div>}
      {...callbacks}
    >
      <div>Central workspace</div>
    </ResizableNavigation>,
  );
  return { ...result, callbacks };
}

describe('ResizableNavigation', () => {
  beforeEach(() => {
    desktopViewport = true;
    mediaQueryListeners.clear();
  });

  it('keeps the workspace when the side nav starts collapsed without rendering a top nav', () => {
    setDesktopViewport(false);

    renderNavigation();

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Notera quick navigation' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Central workspace')).toBeVisible();
  });

  it('removes the custom compact rail when the viewport crosses the ADS breakpoint', async () => {
    renderNavigation();
    expect(screen.getByText('Content tree')).toBeVisible();

    act(() => setDesktopViewport(false));

    expect(
      screen.queryByRole('navigation', {
        name: 'Notera quick navigation',
      }),
    ).not.toBeInTheDocument();
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

    expect(
      screen.queryByTestId('notera-expanded-side-nav'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Central workspace')).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Notera quick navigation' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Expand sidebar',
      }),
    );
    await waitFor(() => expect(screen.getByText('Content tree')).toBeVisible());
  });

  it('keeps ADS side-nav primary entries wired to their workspace actions', async () => {
    const user = userEvent.setup();
    const { callbacks } = renderNavigation();

    await user.click(screen.getByRole('button', { name: 'Favorites' }));
    await user.click(screen.getByRole('button', { name: 'Recent' }));
    await user.click(screen.getByRole('button', { name: 'Trash' }));

    expect(callbacks.onFavorites).toHaveBeenCalledTimes(1);
    expect(callbacks.onRecent).toHaveBeenCalledTimes(1);
    expect(callbacks.onTrash).toHaveBeenCalledTimes(1);
  });
});
