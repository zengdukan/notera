/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '../../app/AppProviders';
import { ModalHost } from '../../shared-ui/ModalHost';
import { SettingsModal } from '../SettingsModal';

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

function renderSettingsModal(content: ReactNode) {
  render(
    <AppProviders locale="en">
      <ModalHost
        modal={{ kind: 'settings', title: 'Settings', content }}
        onClose={jest.fn()}
      />
    </AppProviders>,
  );
}

describe('SettingsModal', () => {
  it('offers only supported themes, languages, and automatic lock values', async () => {
    const user = userEvent.setup();
    const onUpdateDevice = jest.fn();
    renderSettingsModal(
      <SettingsModal
        device={{ theme: 'SYSTEM', language: 'en' }}
        profile={{ autoLockMinutes: 15 }}
        onUpdateDevice={onUpdateDevice}
        onUpdateProfile={jest.fn()}
        onRenameProfile={jest.fn()}
        onChangePassword={jest.fn()}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    const themeGroup = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(themeGroup).toBeVisible();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(onUpdateDevice).toHaveBeenCalledWith({ theme: 'LIGHT' });
    await user.click(screen.getByRole('combobox', { name: 'Language' }));
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'English' }));
    await user.click(screen.getByRole('tab', { name: 'Profile and security' }));
    await user.click(screen.getByRole('combobox', { name: 'Automatic lock' }));
    expect(
      screen.getByRole('option', { name: '15 minutes' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Never')).not.toBeInTheDocument();
    expect(screen.queryByText('Switch profile')).not.toBeInTheDocument();
  });

  it('keeps the selected theme and shows inline feedback when updating fails', async () => {
    const user = userEvent.setup();
    renderSettingsModal(
      <SettingsModal
        device={{ theme: 'DARK', language: 'en' }}
        profile={{ autoLockMinutes: 15 }}
        onUpdateDevice={jest.fn().mockRejectedValue(new Error('failed'))}
        onUpdateProfile={jest.fn()}
        onRenameProfile={jest.fn()}
        onChangePassword={jest.fn()}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(await screen.findByText('Settings were not updated')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('disables general controls while a device setting is being updated', async () => {
    const user = userEvent.setup();
    let finishUpdate: (() => void) | undefined;
    const update = new Promise<void>((resolve) => {
      finishUpdate = resolve;
    });
    renderSettingsModal(
      <SettingsModal
        device={{ theme: 'SYSTEM', language: 'en' }}
        profile={{ autoLockMinutes: 15 }}
        onUpdateDevice={() => update}
        onUpdateProfile={jest.fn()}
        onRenameProfile={jest.fn()}
        onChangePassword={jest.fn()}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('radio', { name: 'System' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeDisabled();

    finishUpdate?.();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'System' })).toBeEnabled(),
    );
  });

  it('shows inline feedback when a profile preference update fails', async () => {
    const user = userEvent.setup();
    renderSettingsModal(
      <SettingsModal
        device={{ theme: 'SYSTEM', language: 'en' }}
        profile={{ autoLockMinutes: 15 }}
        onUpdateDevice={jest.fn()}
        onUpdateProfile={jest.fn().mockRejectedValue(new Error('failed'))}
        onRenameProfile={jest.fn()}
        onChangePassword={jest.fn()}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Profile and security' }));
    await user.click(screen.getByRole('combobox', { name: 'Automatic lock' }));
    await user.click(screen.getByRole('option', { name: '30 minutes' }));

    expect(
      await screen.findByText('Profile settings were not updated'),
    ).toBeVisible();
  });
});
