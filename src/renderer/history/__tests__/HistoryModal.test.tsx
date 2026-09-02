/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';

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
                controller={controller}
                rootFolderId="root"
                folders={[]}
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
});
