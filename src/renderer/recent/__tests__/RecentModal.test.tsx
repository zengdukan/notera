/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';

import { AppProviders } from '../../app/AppProviders';
import type { NoteraClient } from '../../platform/notera-client';
import { RecentModal } from '../RecentModal';

const note = {
  kind: 'note' as const,
  id: '10000000-0000-4000-8000-000000000004',
  title: 'Recent note',
  folderId: '10000000-0000-4000-8000-000000000003',
  contentVersion: 1,
  updatedAt: 1,
};

describe('RecentModal', () => {
  it('lists recent notes and opens one without batch controls', async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn().mockResolvedValue(true);
    const client = {
      request: jest.fn().mockResolvedValue({ items: [note] }),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;

    render(
      <AppProviders locale="en" queryClient={new QueryClient()}>
        <RecentModal client={client} profileId="profile" onOpen={onOpen} />
      </AppProviders>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Open Recent note' }),
    );
    expect(onOpen).toHaveBeenCalledWith(note);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
