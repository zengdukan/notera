/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';

import { EditorSurface } from '../EditorSurface';
import { RendererSurface } from '../RendererSurface';

const provider = Promise.resolve({ scoped: true });
const mediaProviderForNote = jest.fn((noteId: string) => {
  void noteId;
  return provider;
});
const providerFactory = jest.fn((value: unknown) => ({ value }));
const productEditor = jest.fn((props: { mediaProvider: unknown }) => (
  <output aria-label="Editor Media">
    {String(props.mediaProvider === provider)}
  </output>
));

jest.mock('../../atlassian-editor/media-provider', () => ({
  mediaProviderForNote: (noteId: string) => mediaProviderForNote(noteId),
}));
jest.mock('../../atlassian-editor/editor', () => ({
  Editor: (props: { mediaProvider: unknown }) => productEditor(props),
}));
jest.mock('@atlaskit/editor-common/provider-factory', () => ({
  ProviderFactory: { create: (value: unknown) => providerFactory(value) },
}));
jest.mock('@atlaskit/renderer', () => ({
  ReactRenderer: ({ dataProviders }: { dataProviders: unknown }) => (
    <output aria-label="Renderer Media">{JSON.stringify(dataProviders)}</output>
  ),
}));
jest.mock('../../atlassian-editor/emoji/get-emoji-provider', () => ({
  currentUser: { id: 'user' },
  getEmojiProvider: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../../atlassian-editor/math', () => ({ mathExtensionHandlers: {} }));
jest.mock('../../atlassian-editor/mermaid', () => ({
  mermaidExtensionHandlers: {},
}));

const noteId = '20000000-0000-4000-8000-000000000001';
const document = { type: 'doc' as const, version: 1 as const };

describe('note-scoped Editor and Renderer Media', () => {
  it('shares the same production Media Provider for one note', () => {
    render(
      <>
        <EditorSurface
          noteId={noteId}
          document={document}
          onChange={jest.fn()}
        />
        <RendererSurface noteId={noteId} document={document} />
      </>,
    );

    expect(screen.getByLabelText('Editor Media')).toHaveTextContent('true');
    expect(providerFactory).toHaveBeenCalledWith(
      expect.objectContaining({ mediaProvider: provider }),
    );
    expect(mediaProviderForNote).toHaveBeenCalledWith(noteId);
  });
});
