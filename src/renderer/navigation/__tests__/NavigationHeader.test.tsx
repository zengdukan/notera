/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Main, Root, TopNav } from '@atlaskit/navigation-system';

import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import { NavigationHeader } from '../NavigationHeader';

configureFeatureFlags();

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: jest.fn((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('NavigationHeader', () => {
  const renderHeader = (
    overrides: {
      onLock?: () => void;
      onSearch?: () => void;
      onCreateNote?: () => void;
      onCreateFolder?: () => void;
      onSettings?: () => void;
    } = {},
  ) => {
    const callbacks = {
      onLock: jest.fn(),
      onSearch: jest.fn(),
      onCreateNote: jest.fn(),
      onCreateFolder: jest.fn(),
      onSettings: jest.fn(),
      ...overrides,
    };
    render(
      <Root>
        <TopNav>
          <NavigationHeader profileName="Profile" {...callbacks} />
        </TopNav>
        <Main>Workspace</Main>
      </Root>,
    );
    return callbacks;
  };

  it('shows the search shortcut and opens search from the ADS trigger', async () => {
    const user = userEvent.setup();
    const callbacks = renderHeader();

    expect(screen.getByText('Notera')).toBeVisible();
    expect(screen.getByText('Profile')).toBeVisible();
    expect(screen.getByText('Ctrl + J')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(callbacks.onSearch).toHaveBeenCalledTimes(1);
  });

  it('keeps create, settings, and lock actions in the persistent top navigation', async () => {
    const user = userEvent.setup();
    const callbacks = renderHeader();

    await user.click(screen.getByRole('button', { name: 'Lock profile' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await user.click(screen.getByRole('menuitem', { name: 'New note' }));

    expect(callbacks.onLock).toHaveBeenCalledTimes(1);
    expect(callbacks.onSettings).toHaveBeenCalledTimes(1);
    expect(callbacks.onCreateNote).toHaveBeenCalledTimes(1);
  });
});
