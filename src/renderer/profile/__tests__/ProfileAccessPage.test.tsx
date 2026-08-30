/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AppProviders } from '../../app/AppProviders';
import { NoteraClientError } from '../../platform/notera-client';
import { ProfileAccessPage } from '../ProfileAccessPage';

const profiles = [
  {
    localProfileId: '10000000-0000-4000-8000-000000000001',
    displayName: 'Personal',
    lastUsedAt: 1,
    isCurrent: false,
  },
];

function deferred<T>() {
  let resolveDeferred!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });
  return { promise, resolve: resolveDeferred };
}

describe('ProfileAccessPage', () => {
  it('switches between same-page unlock and create forms without cancel', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders locale="en">
        <ProfileAccessPage
          profiles={profiles}
          onCreate={jest.fn()}
          onUnlock={jest.fn()}
        />
      </AppProviders>,
    );
    expect(screen.getByLabelText(/Master password/)).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Unlock “Personal”' }),
    ).toBeVisible();
    expect(screen.getByText('This device · Encrypted')).toBeVisible();
    expect(screen.queryByText('Selected Profile')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create Profile' }));
    expect(screen.getByLabelText(/Profile name/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Personal/ }));
    expect(
      screen.getByRole('button', { name: 'Unlock Profile' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Supports autofill from your system or browser password manager.',
      ),
    ).toBeVisible();
  });

  it('shows the create form by default when no profiles exist', () => {
    render(
      <AppProviders locale="en">
        <ProfileAccessPage
          profiles={[]}
          onCreate={jest.fn()}
          onUnlock={jest.fn()}
        />
      </AppProviders>,
    );
    expect(screen.getByLabelText(/Profile name/)).toBeVisible();
    expect(
      screen.queryByRole('listbox', { name: 'Profiles on this device' }),
    ).not.toBeInTheDocument();
  });

  it('renders the approved Simplified Chinese first-profile experience', () => {
    render(
      <AppProviders locale="zh-CN">
        <ProfileAccessPage
          profiles={[]}
          onCreate={jest.fn()}
          onUnlock={jest.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText('你的笔记，留在这台设备。')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: '创建第一个 Profile' }),
    ).toBeVisible();
    expect(screen.getByLabelText(/Profile 名称/)).toBeVisible();
    expect(screen.getByLabelText(/主密码/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: '创建并进入工作区' }),
    ).toBeVisible();
  });

  it('renders the approved desktop messaging without the removed notices', () => {
    render(
      <AppProviders locale="en">
        <ProfileAccessPage
          profiles={profiles}
          onCreate={jest.fn()}
          onUnlock={jest.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText('Your notes stay on this device.')).toBeVisible();
    expect(screen.getByText('Encrypted by default')).toBeVisible();
  });

  it('validates Unicode lengths and trims a Profile name before creation', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn().mockResolvedValue(undefined);
    render(
      <AppProviders locale="en">
        <ProfileAccessPage
          profiles={[]}
          onCreate={onCreate}
          onUnlock={jest.fn()}
        />
      </AppProviders>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Create and enter workspace' }),
    );
    expect(screen.getByText('Enter a Profile name.')).toBeVisible();

    await user.type(
      screen.getByLabelText(/Profile name/),
      `  ${'😀'.repeat(100)}  `,
    );
    await user.type(screen.getByLabelText(/Master password/), 'secret');
    await user.click(
      screen.getByRole('button', { name: 'Create and enter workspace' }),
    );

    expect(onCreate).toHaveBeenCalledWith({
      displayName: '😀'.repeat(100),
      password: 'secret',
    });
  });

  it('shows a wrong master password next to the field', async () => {
    const user = userEvent.setup();
    const onUnlock = jest
      .fn()
      .mockRejectedValue(new NoteraClientError('WRONG_PASSWORD'));
    render(
      <AppProviders locale="en">
        <ProfileAccessPage
          profiles={profiles}
          onCreate={jest.fn()}
          onUnlock={onUnlock}
        />
      </AppProviders>,
    );

    await user.type(screen.getByLabelText(/Master password/), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Unlock Profile' }));

    expect(
      await screen.findByText('That master password is incorrect.'),
    ).toBeVisible();
  });

  it('disables the whole access panel and exposes progress while unlocking', async () => {
    const user = userEvent.setup();
    const unlock = deferred<void>();
    function Harness() {
      const [isBusy, setIsBusy] = useState(false);
      return (
        <ProfileAccessPage
          profiles={profiles}
          isBusy={isBusy}
          onCreate={jest.fn()}
          onUnlock={() => {
            setIsBusy(true);
            return unlock.promise;
          }}
        />
      );
    }
    render(
      <AppProviders locale="en">
        <Harness />
      </AppProviders>,
    );

    await user.type(screen.getByLabelText(/Master password/), 'secret');
    await user.click(screen.getByRole('button', { name: 'Unlock Profile' }));

    expect(
      screen.getByRole('button', { name: /^Unlocking Profile…/ }),
    ).toBeDisabled();
    expect(screen.getByRole('option', { name: /Personal/ })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Create Profile' }),
    ).toBeDisabled();
  });

  it('replaces the password form with retry guidance after a system error', async () => {
    const user = userEvent.setup();
    const onUnlock = jest
      .fn()
      .mockRejectedValue(new NoteraClientError('DISK_FULL'));
    render(
      <AppProviders locale="en">
        <ProfileAccessPage
          profiles={profiles}
          onCreate={jest.fn()}
          onUnlock={onUnlock}
        />
      </AppProviders>,
    );

    await user.type(screen.getByLabelText(/Master password/), 'secret');
    await user.click(screen.getByRole('button', { name: 'Unlock Profile' }));

    expect(
      await screen.findByText('Profile could not be unlocked'),
    ).toBeVisible();
    expect(screen.queryByLabelText(/Master password/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByLabelText(/Master password/)).toHaveValue('');
  });

  it('shows safe ADS feedback for system failures', async () => {
    const user = userEvent.setup();
    const onCreate = jest
      .fn()
      .mockRejectedValue(new NoteraClientError('DISK_FULL'));
    render(
      <AppProviders locale="en">
        <ProfileAccessPage
          profiles={[]}
          onCreate={onCreate}
          onUnlock={jest.fn()}
        />
      </AppProviders>,
    );

    await user.type(screen.getByLabelText(/Profile name/), 'Personal');
    await user.type(screen.getByLabelText(/Master password/), 'secret');
    await user.click(
      screen.getByRole('button', { name: 'Create and enter workspace' }),
    );

    expect(
      await screen.findByText('Profile could not be created'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'There is not enough free disk space. Free up space and try again.',
      ),
    ).toBeVisible();
  });
});
