/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '../../app/AppProviders';
import { NoteraClientError } from '../../platform/notera-client';
import { ModalHost } from '../../shared-ui/ModalHost';
import { SettingsModal } from '../SettingsModal';

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

function renderSettingsModal(
  content: ReactNode,
  locale: 'en' | 'zh-CN' = 'en',
) {
  render(
    <AppProviders locale={locale}>
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
        profile={{ autoLockMinutes: 15, displayName: 'Personal' }}
        onUpdateDevice={onUpdateDevice}
        onUpdateProfile={jest.fn()}
        onRenameProfile={jest.fn()}
        onChangePassword={jest.fn()}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Language' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Security' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Rename profile' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Change password' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeVisible();
    expect(
      screen.getByRole('form', {
        name: 'Appearance and language settings',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('form', { name: 'Security settings' }),
    ).toBeVisible();
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
        profile={{ autoLockMinutes: 15, displayName: 'Personal' }}
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
        profile={{ autoLockMinutes: 15, displayName: 'Personal' }}
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
        profile={{ autoLockMinutes: 15, displayName: 'Personal' }}
        onUpdateDevice={jest.fn()}
        onUpdateProfile={jest.fn().mockRejectedValue(new Error('failed'))}
        onRenameProfile={jest.fn()}
        onChangePassword={jest.fn()}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Automatic lock' }));
    await user.click(screen.getByRole('option', { name: '30 minutes' }));

    expect(
      await screen.findByText('Profile settings were not updated'),
    ).toBeVisible();
  });

  it('localizes the ADS settings controls in Chinese', async () => {
    renderSettingsModal(
      <SettingsModal
        device={{ theme: 'SYSTEM', language: 'zh-CN' }}
        profile={{ autoLockMinutes: 15, displayName: '个人笔记' }}
        onUpdateDevice={jest.fn()}
        onUpdateProfile={jest.fn()}
        onRenameProfile={jest.fn()}
        onChangePassword={jest.fn()}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
      'zh-CN',
    );

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '外观' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '语言' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '安全' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '危险操作' })).toBeVisible();
    expect(screen.getByRole('radio', { name: '跟随系统' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: '语言' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '自动锁定' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '立即锁定' }),
    ).not.toBeInTheDocument();
  });

  it('toggles password visibility independently for each field', async () => {
    const user = userEvent.setup();
    renderSettingsModal(
      <SettingsModal
        device={{ theme: 'SYSTEM', language: 'en' }}
        profile={{ autoLockMinutes: 15, displayName: 'Personal' }}
        onUpdateDevice={jest.fn()}
        onUpdateProfile={jest.fn()}
        onRenameProfile={jest.fn()}
        onChangePassword={jest.fn()}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    const currentPassword = screen.getByLabelText(/^Current password/);
    const newPassword = screen.getByLabelText(/^New password/);
    const confirmPassword = screen.getByLabelText(/^Confirm new password/);
    const showPasswordButtons = screen.getAllByRole('button', {
      name: 'Show password',
    });
    expect(showPasswordButtons).toHaveLength(3);
    expect(currentPassword).toHaveAttribute('type', 'password');
    expect(newPassword).toHaveAttribute('type', 'password');
    expect(confirmPassword).toHaveAttribute('type', 'password');

    await user.click(showPasswordButtons[0]);
    expect(currentPassword).toHaveAttribute('type', 'text');
    expect(newPassword).toHaveAttribute('type', 'password');
    expect(confirmPassword).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(currentPassword).toHaveAttribute('type', 'password');
  });

  it('validates and completes rename and password forms', async () => {
    const user = userEvent.setup();
    const onRenameProfile = jest.fn(async () => 'Renamed');
    const onChangePassword = jest.fn(async () => undefined);
    renderSettingsModal(
      <SettingsModal
        device={{ theme: 'SYSTEM', language: 'en' }}
        profile={{ autoLockMinutes: 15, displayName: 'Personal' }}
        onUpdateDevice={jest.fn()}
        onUpdateProfile={jest.fn()}
        onRenameProfile={onRenameProfile}
        onChangePassword={onChangePassword}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'Profile name' });
    expect(name).toHaveValue('Personal');
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(await screen.findByText('Enter a Profile name.')).toBeVisible();
    expect(onRenameProfile).not.toHaveBeenCalled();

    await user.type(name, '  Renamed  ');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onRenameProfile).toHaveBeenCalledWith('Renamed');
    expect(await screen.findByText('Profile renamed')).toBeVisible();

    const currentPassword = screen.getByLabelText(/^Current password/);
    const newPassword = screen.getByLabelText(/^New password/);
    const confirmPassword = screen.getByLabelText(/^Confirm new password/);
    expect(
      screen.getByText('Notera cannot recover or reset your master password.'),
    ).toBeVisible();
    await user.type(currentPassword, 'old-secret');
    await user.type(newPassword, 'new-secret');
    await user.type(confirmPassword, 'different-secret');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(
      await screen.findByText('The new passwords do not match.'),
    ).toBeVisible();
    expect(onChangePassword).not.toHaveBeenCalled();

    await user.clear(confirmPassword);
    await user.type(confirmPassword, 'new-secret');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(onChangePassword).toHaveBeenCalledWith({
      oldPassword: 'old-secret',
      newPassword: 'new-secret',
    });
    expect(await screen.findByText('Password changed')).toBeVisible();
    expect(currentPassword).toHaveValue('');
    expect(newPassword).toHaveValue('');
    expect(confirmPassword).toHaveValue('');
  });

  it('shows a field error for an incorrect current password', async () => {
    const user = userEvent.setup();
    renderSettingsModal(
      <SettingsModal
        device={{ theme: 'SYSTEM', language: 'en' }}
        profile={{ autoLockMinutes: 15, displayName: 'Personal' }}
        onUpdateDevice={jest.fn()}
        onUpdateProfile={jest.fn()}
        onRenameProfile={jest.fn()}
        onChangePassword={jest
          .fn()
          .mockRejectedValue(new NoteraClientError('WRONG_PASSWORD'))}
        onLock={jest.fn()}
        onRemove={jest.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/^Current password/), 'incorrect');
    await user.type(screen.getByLabelText(/^New password/), 'new-secret');
    await user.type(
      screen.getByLabelText(/^Confirm new password/),
      'new-secret',
    );
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(
      await screen.findByText('That master password is incorrect.'),
    ).toBeVisible();
    expect(
      screen.queryByText('Profile settings were not updated'),
    ).not.toBeInTheDocument();
  });

  it('omits immediate lock and invokes the removal security action', async () => {
    const user = userEvent.setup();
    const onLock = jest.fn(async () => undefined);
    const onRemove = jest.fn(async () => 'cancelled' as const);
    renderSettingsModal(
      <SettingsModal
        device={{ theme: 'SYSTEM', language: 'en' }}
        profile={{ autoLockMinutes: 15, displayName: 'Personal' }}
        onUpdateDevice={jest.fn()}
        onUpdateProfile={jest.fn()}
        onRenameProfile={jest.fn()}
        onChangePassword={jest.fn()}
        onLock={onLock}
        onRemove={onRemove}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Lock now' }),
    ).not.toBeInTheDocument();
    expect(onLock).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Remove from device' }),
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
