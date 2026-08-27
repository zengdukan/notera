/** @jest-environment jsdom */

import { QueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { AppProviders } from '../../app/AppProviders';
import type { NoteraClient } from '../../platform/notera-client';
import type { HistoryController } from '../history-controller';
import { HistoryModal } from '../HistoryModal';

jest.mock('../../editor/RendererSurface', () => ({
  RendererSurface: ({ document }: { document: unknown }) => (
    <output>{JSON.stringify(document)}</output>
  ),
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
        <HistoryModal
          client={client}
          profileId="profile"
          noteId="note"
          controller={controller}
        />
      </AppProviders>,
    );

    expect(await screen.findByText('Milestone')).toBeVisible();
    expect(screen.getByText('Protected before history restore')).toBeVisible();
    expect(await screen.findByText(/"type":"doc"/u)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /rename/iu }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /delete/iu }),
    ).not.toBeInTheDocument();
  });
});
