/** @jest-environment jsdom */

import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionProvider, useSession } from '../../app/session';
import type { NoteraClient } from '../../platform/notera-client';
import { ActiveDocumentLifecycle } from '../../notes/document-lifecycle';
import { NoteWriteCoordinator } from '../../notes/note-write-coordinator';

const firstNote = { kind: 'note' as const, id: 'first', title: 'First', folderId: 'root', contentVersion: 1, updatedAt: 1 };
const secondNote = { ...firstNote, id: 'second', title: 'Second' };
const mockFlush = jest.fn(async () => undefined);

jest.mock('../ResizableNavigation', () => ({
  ResizableNavigation: ({ header, tree, children }: { header: ReactNode; tree: ReactNode; children: ReactNode }) => (
    <div>{header}{tree}<main>{children}</main></div>
  ),
}));
jest.mock('../NavigationHeader', () => ({
  NavigationHeader: () => <div>Navigation header</div>,
}));
jest.mock('../tree-queries', () => ({
  QueryContentTree: ({ onOpen }: { onOpen(entry: typeof firstNote): void }) => (
    <div>
      <button type="button" onClick={() => onOpen(firstNote)}>Open first</button>
      <button type="button" onClick={() => onOpen(secondNote)}>Open second</button>
    </div>
  ),
}));
jest.mock('../../notes/NoteWorkspace', () => ({
  NoteWorkspace: ({ note, lifecycle }: { note?: typeof firstNote; lifecycle: ActiveDocumentLifecycle }) => {
    useEffect(() => {
      if (!note) return undefined;
      return lifecycle.attach({ isDirty: () => true, flush: mockFlush, stop: jest.fn() });
    }, [lifecycle, note]);
    return <div>{note ? `Workspace ${note.title}` : 'No note selected'}</div>;
  },
}));
jest.mock('../../shared-ui/ModalHost', () => ({ ModalHost: () => null }));

import { NavigationWorkspace } from '../NavigationWorkspace';

function Unlock({ children }: { children: ReactNode }) {
  const { dispatch } = useSession();
  useEffect(() => {
    dispatch({
      type: 'unlocked',
      profile: {
        state: 'UNLOCKED',
        localProfileId: '11111111-1111-4111-8111-111111111111',
        displayName: 'Profile',
        rootFolderId: '22222222-2222-4222-8222-222222222222',
      },
    });
  }, [dispatch]);
  return <>{children}</>;
}

describe('NavigationWorkspace', () => {
  it('shares tree selection with the central note workspace', async () => {
    const user = userEvent.setup();
    const client = { request: jest.fn(), subscribe: jest.fn() } as unknown as NoteraClient;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider>
          <Unlock>
            <NavigationWorkspace
              client={client}
              lifecycle={new ActiveDocumentLifecycle()}
              writeCoordinator={new NoteWriteCoordinator()}
            />
          </Unlock>
        </SessionProvider>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Open first' }));
    expect(screen.getByText('Workspace First')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open second' }));
    expect(await screen.findByText('Workspace Second')).toBeVisible();
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });
});
