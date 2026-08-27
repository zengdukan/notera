/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NoteraClient } from '../../platform/notera-client';
import { noteKey } from '../../app/query-keys';
import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import { ActiveDocumentLifecycle } from '../document-lifecycle';
import { NoteWriteCoordinator } from '../note-write-coordinator';

import { NoteWorkspace } from '../NoteWorkspace';

configureFeatureFlags();
jest.mock('../../editor/EditorSurface', () => ({
  EditorSurface: ({
    document,
    onChange,
  }: {
    document: unknown;
    onChange(value: unknown): void;
  }) => (
    <div aria-label="Editor surface">
      {JSON.stringify(document)}
      <button
        type="button"
        onClick={() =>
          onChange({
            version: 1,
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Changed' }],
              },
            ],
          })
        }
      >
        Change document
      </button>
    </div>
  ),
}));
jest.mock('../../editor/RendererSurface', () => ({
  RendererSurface: ({ document }: { document: unknown }) => (
    <output aria-label="Renderer surface">{JSON.stringify(document)}</output>
  ),
}));
jest.mock('../../editor/ResponsiveEditorToolbar', () => ({
  ResponsiveEditorToolbar: () => (
    <div role="toolbar" aria-label="Editor formatting" />
  ),
}));

const noteEntry = {
  kind: 'note' as const,
  id: '11111111-1111-4111-8111-111111111111',
  folderId: '22222222-2222-4222-8222-222222222222',
  title: 'Architecture',
  contentVersion: 3,
  updatedAt: 100,
};
const document = {
  version: 1 as const,
  type: 'doc' as const,
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Preview' }] },
  ],
};

function setup(
  options: { saveRejects?: boolean; initiallyEditing?: boolean } = {},
) {
  const request = jest.fn(async (key: string) => {
    if (key === 'note.get') {
      return {
        ...noteEntry,
        document,
        createdAt: 50,
        isFavorite: false,
        tags: [],
      };
    }
    if (key === 'contentTree.getFolderPath') {
      return { items: [{ id: noteEntry.folderId, name: 'Projects' }] };
    }
    if (key === 'note.saveDraft') {
      if (options.saveRejects) throw new Error('save failed');
      return { noteId: noteEntry.id, contentVersion: 4, savedAt: 200 };
    }
    if (key === 'favorite.add' || key === 'favorite.remove') return {};
    throw new Error(`Unexpected ${key}`);
  });
  const client = { request, subscribe: jest.fn() } as unknown as NoteraClient;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const lifecycle = new ActiveDocumentLifecycle();
  const props = {
    client,
    profileId: 'profile',
    note: noteEntry,
    initiallyEditing: options.initiallyEditing,
    lifecycle,
    writeCoordinator: new NoteWriteCoordinator(),
    onMore: jest.fn(),
  };
  render(
    <QueryClientProvider client={queryClient}>
      <NoteWorkspace {...props} />
    </QueryClientProvider>,
  );
  return { request, lifecycle, props, queryClient };
}

describe('NoteWorkspace', () => {
  it('opens an existing note in preview and switches to the chromeless editor on demand', async () => {
    const user = userEvent.setup();
    setup();

    expect(await screen.findByLabelText('Renderer surface')).toHaveTextContent(
      'Preview',
    );
    expect(
      screen.queryByRole('toolbar', { name: 'Editor formatting' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Editor surface')).toBeVisible();
    expect(
      screen.getByRole('toolbar', { name: 'Editor formatting' }),
    ).toBeVisible();
  });

  it('flushes the latest title and ADF before previewing', async () => {
    const user = userEvent.setup();
    const { request } = setup({ initiallyEditing: true });
    await screen.findByLabelText('Editor surface');

    await user.type(screen.getByRole('textbox', { name: 'Note title' }), ' v2');
    await user.click(screen.getByRole('button', { name: 'Change document' }));
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Renderer surface')).toHaveTextContent(
        'Changed',
      ),
    );
    expect(request).toHaveBeenCalledWith(
      'note.saveDraft',
      expect.objectContaining({
        noteId: noteEntry.id,
        title: 'Architecture v2',
        document: expect.objectContaining({ type: 'doc' }),
      }),
    );
  });

  it('keeps the draft in edit mode when preview flush fails', async () => {
    const user = userEvent.setup();
    setup({ saveRejects: true, initiallyEditing: true });
    await screen.findByLabelText('Editor surface');

    await user.click(screen.getByRole('button', { name: 'Change document' }));
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Not saved'),
    );
    expect(screen.getByLabelText('Editor surface')).toBeVisible();
  });

  it('saves immediately on Ctrl+S and toggles favorites through Main', async () => {
    const user = userEvent.setup();
    const { request } = setup({ initiallyEditing: true });
    await screen.findByLabelText('Editor surface');
    await user.click(screen.getByRole('button', { name: 'Change document' }));

    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'note.saveDraft',
        expect.any(Object),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Add to favorites' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('favorite.add', {
        noteId: noteEntry.id,
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Remove from favorites' }),
    ).toBeVisible();
  });

  it('reflects favorite facts changed by another product surface', async () => {
    const { queryClient } = setup();
    expect(
      await screen.findByRole('button', { name: 'Add to favorites' }),
    ).toBeVisible();

    act(() => {
      queryClient.setQueryData(
        noteKey('profile', noteEntry.id),
        (current: unknown) => ({
          ...(current as Record<string, unknown>),
          isFavorite: true,
        }),
      );
    });

    expect(
      await screen.findByRole('button', { name: 'Remove from favorites' }),
    ).toBeVisible();
  });
});
