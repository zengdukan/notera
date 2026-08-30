/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    await user.click(screen.getByRole('button', { name: 'Create new' }));
    expect(screen.getByLabelText(/Profile name/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Personal' }));
    expect(
      screen.getByRole('button', { name: 'Unlock Profile' }),
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
      screen.queryByText('Profiles on this device'),
    ).not.toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Create Profile' }));
    expect(screen.getByText('Enter a Profile name.')).toBeVisible();

    await user.type(
      screen.getByLabelText(/Profile name/),
      `  ${'😀'.repeat(100)}  `,
    );
    await user.type(screen.getByLabelText(/Master password/), 'secret');
    await user.click(screen.getByRole('button', { name: 'Create Profile' }));

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
    await user.click(screen.getByRole('button', { name: 'Create Profile' }));

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
