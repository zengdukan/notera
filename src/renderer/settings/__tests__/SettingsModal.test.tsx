/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '../../app/AppProviders';
import { SettingsModal } from '../SettingsModal';

describe('SettingsModal', () => {
  it('offers only supported themes, languages, and automatic lock values', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders locale="en">
        <SettingsModal
          device={{ theme: 'SYSTEM', language: 'en' }}
          profile={{ autoLockMinutes: 15 }}
          onUpdateDevice={jest.fn()}
          onUpdateProfile={jest.fn()}
          onRenameProfile={jest.fn()}
          onChangePassword={jest.fn()}
          onLock={jest.fn()}
          onRemove={jest.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Theme' }));
    expect(screen.getByRole('option', { name: 'System' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('combobox', { name: 'Language' }));
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('tab', { name: 'Profile and security' }));
    await user.click(screen.getByRole('combobox', { name: 'Automatic lock' }));
    expect(
      screen.getByRole('option', { name: '15 minutes' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Never')).not.toBeInTheDocument();
    expect(screen.queryByText('Switch profile')).not.toBeInTheDocument();
  });
});
