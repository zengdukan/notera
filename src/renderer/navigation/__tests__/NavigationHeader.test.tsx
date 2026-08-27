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
});
