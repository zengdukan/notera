/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { AppProviders } from '../AppProviders';
import { AppShell } from '../AppShell';
import { ModalHost } from '../../shared-ui/ModalHost';
import { GlobalFlagGroup } from '../../shared-ui/GlobalFlagGroup';
import type { NoteraClient } from '../../platform/notera-client';
import { NoteraClientError } from '../../platform/notera-client';

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../../navigation/NavigationWorkspace', () => ({
  NavigationWorkspace: () => <div>Note workspace</div>,
}));

function deferred<T>() {
  let resolveDeferred!: (value: T) => void;
  let rejectDeferred!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
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
    const client = {
      request,
      subscribe: jest.fn(() => () => undefined),
    } as unknown as NoteraClient;

    render(providers(<AppShell client={client} />));

    expect(screen.getByRole('status')).toHaveTextContent('Starting Notera');
    expect(request).toHaveBeenCalledTimes(2);
    profiles.resolve({ items: [], nextCursor: null });
    session.resolve({ state: 'LOCKED' });

    expect(await screen.findByText('Create your first Profile')).toBeVisible();
  });

  it('keeps the Profile access page mounted while unlocking', async () => {
    const user = userEvent.setup();
    const unlock = deferred<{
      state: 'UNLOCKED';
      localProfileId: string;
      displayName: string;
      rootFolderId: string;
    }>();
    const profile = {
      localProfileId: '10000000-0000-4000-8000-000000000001',
      displayName: 'Personal',
      lastUsedAt: 1,
      isCurrent: false,
    };
    const request = jest.fn((key: string) => {
      if (key === 'profile.list') {
        return Promise.resolve({ items: [profile], nextCursor: null });
      }
      if (key === 'profile.getSessionState') {
        return Promise.resolve({ state: 'LOCKED' });
      }
      if (key === 'profile.unlock') return unlock.promise;
      return Promise.resolve({});
    });
    const client = {
      request,
      subscribe: jest.fn(() => () => undefined),
    } as unknown as NoteraClient;

    render(providers(<AppShell client={client} />));

    const password = await screen.findByLabelText(/Master password/);
    await user.type(password, 'secret');
    const unlockButton = screen.getByRole('button', {
      name: 'Unlock Profile',
    });
    await user.click(unlockButton);

    expect(screen.getByText('Your notes stay on this device.')).toBeVisible();
    expect(unlockButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create new' })).toBeDisabled();

    unlock.resolve({
      state: 'UNLOCKED',
      localProfileId: profile.localProfileId,
      displayName: profile.displayName,
      rootFolderId: '20000000-0000-4000-8000-000000000001',
    });

    expect(await screen.findByText('Note workspace')).toBeVisible();
  });

  it('shows safe ADS feedback when local startup fails', async () => {
    const client = {
      request: jest
        .fn()
        .mockRejectedValue(new NoteraClientError('IPC_OPERATION_FAILED')),
      subscribe: jest.fn(() => () => undefined),
    } as unknown as NoteraClient;

    render(providers(<AppShell client={client} />));

    expect(await screen.findByText('Notera could not start.')).toBeVisible();
    expect(
      screen.getByText(
        'Notera could not access local Profile information. Restart the app and try again.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
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
