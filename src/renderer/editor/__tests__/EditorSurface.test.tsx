/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';

import type { AdfDocument } from '../../../shared/ipc/adf';
import { EditorSurface } from '../EditorSurface';

jest.mock('../../atlassian-editor/editor', () => ({
  Editor: ({ document }: { document: AdfDocument }) => (
    <output aria-label="Editor document">{JSON.stringify(document)}</output>
  ),
}));
jest.mock('../../atlassian-editor/media-provider', () => ({
  mediaProviderForNote: jest.fn(() => Promise.resolve({})),
}));

const renderSurface = (document: AdfDocument) =>
  render(
    <EditorSurface
      document={document}
      noteId="note"
      onChange={jest.fn()}
      onToolbarReady={jest.fn()}
    />,
  );

describe('EditorSurface', () => {
  it.each([
    { type: 'doc' as const, version: 1 as const },
    { type: 'doc' as const, version: 1 as const, content: [] },
  ])('normalizes a legacy empty document for Atlaskit', (document) => {
    renderSurface(document);

    expect(screen.getByLabelText('Editor document')).toHaveTextContent(
      JSON.stringify({
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [] }],
      }),
    );
  });

  it('preserves a non-empty document', () => {
    const document: AdfDocument = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Existing content' }],
        },
      ],
    };
    renderSurface(document);

    expect(screen.getByLabelText('Editor document')).toHaveTextContent(
      JSON.stringify(document),
    );
  });
});
