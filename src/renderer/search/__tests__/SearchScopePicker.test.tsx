/** @jest-environment jsdom */

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

import { AppProviders } from '../../app/AppProviders';
import type { NoteraClient } from '../../platform/notera-client';
import { SearchScopePicker } from '../SearchScopePicker';

const profileId = '10000000-0000-4000-8000-000000000001';
const rootFolderId = '10000000-0000-4000-8000-000000000002';

describe('SearchScopePicker', () => {
  it('shows All notes after choosing the root folder', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const client = {
      request: jest.fn().mockResolvedValue({ items: [] }),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;

    function Picker() {
      const [value, setValue] = useState<
        { readonly id: string; readonly name: string } | undefined
      >({ id: profileId, name: 'Scoped' });
      return (
        <SearchScopePicker
          client={client}
          profileId={profileId}
          rootFolderId={rootFolderId}
          value={value}
          onChange={(nextValue) => {
            setValue(nextValue);
            onChange(nextValue);
          }}
        />
      );
    }

    render(
      <AppProviders locale="en" queryClient={new QueryClient()}>
        <Picker />
      </AppProviders>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Search scope: Scoped' }),
    );
    await user.click(await screen.findByRole('button', { name: '/' }));

    expect(onChange).toHaveBeenCalledWith({
      id: rootFolderId,
      name: 'All notes',
    });
    expect(
      screen.getByRole('button', { name: 'Search scope: All notes' }),
    ).toBeVisible();
  });
});
