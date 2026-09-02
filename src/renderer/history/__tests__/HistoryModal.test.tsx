/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import type { NoteraClient } from '../../platform/notera-client';
import { ModalHost } from '../../shared-ui/ModalHost';
import type { HistoryController } from '../history-controller';
import { HistoryModal } from '../HistoryModal';

configureFeatureFlags();

jest.mock('../../editor/RendererSurface', () => ({
  RendererSurface: ({ document }: { document: unknown }) => (
    <output>{JSON.stringify(document)}</output>
  ),
}));

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

const userVersion = {
  versionId: 'version',
  noteId: 'note',
  kind: 'USER' as const,
  protectionReason: null,
  versionName: 'Milestone',
  displayTitle: 'Old',
  createdAt: 1,
};
const protection = {
  versionId: 'protection',
  noteId: 'note',
  kind: 'SYSTEM_PROTECTION' as const,
  protectionReason: 'BEFORE_HISTORY_RESTORE' as const,
  versionName: null,
  displayTitle: 'Protected',
  createdAt: 2,
};

describe('HistoryModal', () => {
  it('shows user and protected versions with read-only preview and immutable actions', async () => {
    const client = {
      request: jest.fn(async (key: string) => {
        if (key === 'history.list') return { items: [userVersion, protection] };
        if (key === 'history.get')
          return {
            ref: { source: 'VERSION', versionId: 'version' },
            noteId: 'note',
            title: 'Old',
            document: { type: 'doc', version: 1 },
            createdAt: 1,
          };
        throw new Error(`Unexpected ${key}`);
      }),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;
    const controller = {
      create: jest.fn(),
      compare: jest.fn(),
      copy: jest.fn(),
      restore: jest.fn(),
    } as unknown as HistoryController;

    render(
      <AppProviders locale="en" queryClient={new QueryClient()}>
        <ModalHost
          modal={{
            kind: 'history',
            title: 'History',
            content: (
              <HistoryModal
                client={client}
                profileId="profile"
                noteId="note"
                noteTitle="Current note"
                controller={controller}
                rootFolderId="root"
                folders={[]}
                onCopySuccess={jest.fn()}
              />
            ),
          }}
          onClose={jest.fn()}
        />
      </AppProviders>,
    );

    expect(await screen.findByText('Milestone')).toBeVisible();
    expect(screen.getByText('Protected before history restore')).toBeVisible();
    expect(
      screen.getByRole('navigation', { name: 'Saved versions' }),
    ).toBeVisible();
    expect(
      screen
        .getByTestId('history-version-version')
        .closest('[data-selected="true"]'),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: /Milestone/u })).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Version preview' }),
    ).toBeVisible();
    expect(await screen.findByText(/"type":"doc"/u)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /rename/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /delete/iu }),
    ).not.toBeInTheDocument();
    const footer = screen.getByTestId('notera-modal-history--footer');
    expect(
      within(footer).getByRole('button', { name: 'Compare' }),
    ).toBeVisible();
    expect(
      within(footer).getByRole('button', { name: 'Copy as new' }),
    ).toBeVisible();
    expect(
      within(footer).getByRole('button', { name: 'Restore version' }),
    ).toBeVisible();
  });

  it('copies the selected version with a trimmed name and destination', async () => {
    const user = userEvent.setup();
    const client = {
      request: jest.fn(async (key: string, input: { versionId?: string }) => {
        if (key === 'history.list') return { items: [userVersion, protection] };
        if (key === 'history.get')
          return {
            ref: { source: 'VERSION', versionId: input.versionId },
            noteId: 'note',
            title: 'Old',
            document: { type: 'doc', version: 1 },
            createdAt: 1,
          };
        throw new Error(`Unexpected ${key}`);
      }),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;
    const copy = jest.fn().mockResolvedValue(undefined);
    const onCopySuccess = jest.fn();
    const controller = {
      create: jest.fn(),
      compare: jest.fn(),
      copy,
      restore: jest.fn(),
    } as unknown as HistoryController;

    render(
      <AppProviders locale="en" queryClient={new QueryClient()}>
        <ModalHost
          modal={{
            kind: 'history',
            title: 'History',
            content: (
              <HistoryModal
                client={client}
                profileId="profile"
                noteId="note"
                noteTitle="Current note"
                controller={controller}
                rootFolderId="root"
                folders={[{ id: 'folder', name: 'Projects', depth: 0 }]}
                onCopySuccess={onCopySuccess}
              />
            ),
          }}
          onClose={jest.fn()}
        />
      </AppProviders>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Copy as new' }),
    );
    expect(
      screen.getByRole('form', { name: 'Copy history version as a new note' }),
    ).toBeVisible();
    const name = screen.getByRole('textbox', { name: /Note name/u });
    expect(name).toHaveValue('Current note');
    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await user.click(screen.getByTestId('history-version-protection'));
    await user.clear(name);
    await user.type(name, '  Copied note  ');
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() =>
      expect(copy).toHaveBeenCalledWith({
        noteId: 'note',
        versionId: 'protection',
        targetFolderId: 'folder',
        title: 'Copied note',
      }),
    );
    expect(onCopySuccess).toHaveBeenCalledWith('Copied note');
  });

  it('blocks invalid names and preserves the form after copy failure', async () => {
    const user = userEvent.setup();
    const client = {
      request: jest.fn(async (key: string) => {
        if (key === 'history.list') return { items: [userVersion] };
        if (key === 'history.get')
          return {
            ref: { source: 'VERSION', versionId: 'version' },
            noteId: 'note',
            title: 'Old',
            document: { type: 'doc', version: 1 },
            createdAt: 1,
          };
        throw new Error(`Unexpected ${key}`);
      }),
      subscribe: jest.fn(),
    } as unknown as NoteraClient;
    const copy = jest.fn().mockRejectedValue(new Error('failed'));
    const controller = {
      create: jest.fn(),
      compare: jest.fn(),
      copy,
      restore: jest.fn(),
    } as unknown as HistoryController;

    render(
      <AppProviders locale="en" queryClient={new QueryClient()}>
        <ModalHost
          modal={{
            kind: 'history',
            title: 'History',
            content: (
              <HistoryModal
                client={client}
                profileId="profile"
                noteId="note"
                noteTitle=""
                controller={controller}
                rootFolderId="root"
                onCopySuccess={jest.fn()}
              />
            ),
          }}
          onClose={jest.fn()}
        />
      </AppProviders>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Copy as new' }),
    );
    const name = screen.getByRole('textbox', { name: /Note name/u });
    const submit = screen.getByRole('button', { name: 'Copy' });
    expect(screen.getByText('Enter a note name.')).toBeVisible();
    expect(submit).toBeDisabled();

    fireEvent.change(name, { target: { value: 'x'.repeat(1001) } });
    expect(
      screen.getByText('Note name must be 1,000 characters or fewer.'),
    ).toBeVisible();
    expect(submit).toBeDisabled();

    await user.clear(name);
    await user.type(name, 'Retry copy');
    await user.click(submit);
    expect(await screen.findByText('Note was not copied')).toBeVisible();
    expect(name).toHaveValue('Retry copy');
    expect(copy).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(
      screen.queryByRole('form', {
        name: 'Copy history version as a new note',
      }),
    ).not.toBeInTheDocument();
  });
});
