/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import { NavigationHeader } from '../NavigationHeader';

configureFeatureFlags();

describe('NavigationHeader', () => {
  it('shows the search shortcut and opens search from the ADS trigger', async () => {
    const user = userEvent.setup();
    const onSearch = jest.fn();
    render(
      <NavigationHeader
        profileName="Profile"
        onLock={jest.fn()}
        onSearch={onSearch}
        onCreateNote={jest.fn()}
        onCreateFolder={jest.fn()}
      />,
    );

    expect(screen.getByText('Ctrl + J')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('keeps lock, search, and create available in the collapsed icon layout', async () => {
    const user = userEvent.setup();
    const onLock = jest.fn();
    const onSearch = jest.fn();
    const onCreateNote = jest.fn();
    render(
      <NavigationHeader
        compact
        profileName="Profile"
        onLock={onLock}
        onSearch={onSearch}
        onCreateNote={onCreateNote}
        onCreateFolder={jest.fn()}
      />,
    );

    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lock profile' }));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await user.click(screen.getByRole('menuitem', { name: 'New note' }));

    expect(onLock).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onCreateNote).toHaveBeenCalledTimes(1);
  });
});
