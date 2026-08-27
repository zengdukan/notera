/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '../../app/AppProviders';
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
    expect(screen.getByLabelText(/Password/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create profile' }));
    expect(screen.getByLabelText(/Profile name/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Personal' }));
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeVisible();
  });

  it('shows the create form by default when no profiles exist', () => {
    render(
      <AppProviders locale="en">
        <ProfileAccessPage profiles={[]} onCreate={jest.fn()} onUnlock={jest.fn()} />
      </AppProviders>,
    );
    expect(screen.getByLabelText(/Profile name/)).toBeVisible();
  });
});
