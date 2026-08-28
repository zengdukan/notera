/** @jest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from '@atlaskit/button/new';

import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import { ResizableNavigation } from '../ResizableNavigation';

configureFeatureFlags();

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: jest.fn((query: string) => ({
    matches: query === '(min-width: 64rem)',
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

function renderNavigation() {
  const callbacks = {
    onFavorites: jest.fn(),
    onRecent: jest.fn(),
    onTrash: jest.fn(),
    onSettings: jest.fn(),
  };
  render(
    <ResizableNavigation
      header={<div>Profile and search</div>}
      collapsedHeader={<Button>Compact profile actions</Button>}
      tree={<div>Content tree</div>}
      {...callbacks}
    >
      <div>Central workspace</div>
    </ResizableNavigation>,
  );
  return callbacks;
}

describe('ResizableNavigation', () => {
  it('keeps the two-pane desktop layout and replaces a collapsed tree with primary icon entries', async () => {
    const user = userEvent.setup();
    renderNavigation();

    expect(
      screen.getByRole('navigation', { name: 'Notera navigation' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Content tree')).toBeVisible();
    expect(screen.getByText('Central workspace')).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Collapse navigation' }),
    );

    const quickNavigation = await screen.findByRole('navigation', {
      name: 'Notera quick navigation',
    });
    expect(screen.queryByText('Content tree')).not.toBeInTheDocument();
    expect(screen.getByText('Central workspace')).toBeVisible();
    expect(
      within(quickNavigation).getByRole('button', {
        name: 'Compact profile actions',
      }),
    ).toBeVisible();
    expect(
      within(quickNavigation).getByRole('button', {
        name: 'Expand navigation',
      }),
    ).toBeVisible();
    for (const name of ['Favorites', 'Recent', 'Trash', 'Settings']) {
      expect(
        within(quickNavigation).getByRole('button', { name }),
      ).toBeVisible();
    }

    await user.click(
      within(quickNavigation).getByRole('button', {
        name: 'Expand navigation',
      }),
    );
    await waitFor(() => expect(screen.getByText('Content tree')).toBeVisible());
  });

  it('keeps collapsed primary entries wired to their workspace actions', async () => {
    const user = userEvent.setup();
    const callbacks = renderNavigation();
    await user.click(
      screen.getByRole('button', { name: 'Collapse navigation' }),
    );
    const quickNavigation = await screen.findByRole('navigation', {
      name: 'Notera quick navigation',
    });

    await user.click(
      within(quickNavigation).getByRole('button', { name: 'Favorites' }),
    );
    await user.click(
      within(quickNavigation).getByRole('button', { name: 'Recent' }),
    );
    await user.click(
      within(quickNavigation).getByRole('button', { name: 'Trash' }),
    );
    await user.click(
      within(quickNavigation).getByRole('button', { name: 'Settings' }),
    );

    expect(callbacks.onFavorites).toHaveBeenCalledTimes(1);
    expect(callbacks.onRecent).toHaveBeenCalledTimes(1);
    expect(callbacks.onTrash).toHaveBeenCalledTimes(1);
    expect(callbacks.onSettings).toHaveBeenCalledTimes(1);
  });
});
