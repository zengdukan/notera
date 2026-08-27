/** @jest-environment jsdom */

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { AppProviders } from '../AppProviders';
import { AppShell } from '../AppShell';
import { ModalHost } from '../../shared-ui/ModalHost';
import { GlobalFlagGroup } from '../../shared-ui/GlobalFlagGroup';
import type { NoteraClient } from '../../platform/notera-client';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function providers(children: ReactNode) {
  return <AppProviders locale="en">{children}</AppProviders>;
}

describe('application shell', () => {
  it('loads the profile list and session state concurrently while preserving the shell', async () => {
    const profiles = deferred<{
      items: readonly unknown[];
      nextCursor: string | null;
    }>();
    const session = deferred<{ state: 'LOCKED' }>();
    const request = jest.fn((key: string) =>
      key === 'profile.list' ? profiles.promise : session.promise,
    );
    const client = { request } as unknown as NoteraClient;

    render(providers(<AppShell client={client} />));

    expect(screen.getByRole('status')).toHaveTextContent('Starting Notera');
    expect(request).toHaveBeenCalledTimes(2);
    profiles.resolve({ items: [], nextCursor: null });
    session.resolve({ state: 'LOCKED' });

    expect(await screen.findByText('Choose a profile to continue.')).toBeVisible();
  });

  it('renders only one primary modal and restores focus when it closes', async () => {
    const user = userEvent.setup();
    function Harness() {
      return (
        <>
          <button type="button">Open settings</button>
          <ModalHost
            modal={{
              kind: 'settings',
              title: 'Settings',
              content: <p>Settings content</p>,
            }}
            onClose={jest.fn()}
          />
        </>
      );
    }

    render(providers(<Harness />));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renders cross-page feedback in one ADS flag group', () => {
    render(
      providers(
        <GlobalFlagGroup
          flags={[
            {
              id: 'saved',
              title: 'Export completed',
              appearance: 'success',
            },
          ]}
          label="Notifications"
          onDismissed={jest.fn()}
        />,
      ),
    );

    expect(screen.getByText('Export completed')).toBeVisible();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });
});
