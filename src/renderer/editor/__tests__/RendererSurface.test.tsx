/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';

const providerFactory = jest.fn((_value: unknown) => ({ providers: true }));
jest.mock('@atlaskit/editor-common/provider-factory', () => ({
  ProviderFactory: { create: (value: unknown) => providerFactory(value) },
}));
jest.mock('@atlaskit/renderer', () => ({
  ReactRenderer: (props: { document: unknown; dataProviders: unknown }) => (
    <output
      aria-label="Rendered ADF"
      data-providers={JSON.stringify(props.dataProviders)}
    >
      {JSON.stringify(props.document)}
    </output>
  ),
}));
jest.mock('../../atlassian-editor/media-provider', () => ({ mediaProvider: Promise.resolve({}) }));
jest.mock('../../atlassian-editor/emoji/get-emoji-provider', () => ({
  currentUser: { id: 'user' },
  getEmojiProvider: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../../atlassian-editor/math', () => ({ mathExtensionHandlers: { math: jest.fn() } }));
jest.mock('../../atlassian-editor/mermaid', () => ({ mermaidExtensionHandlers: { mermaid: jest.fn() } }));

import { RendererSurface } from '../RendererSurface';

const document = {
  version: 1 as const,
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Preview' }] }],
};

describe('RendererSurface', () => {
  it('renders the same ADF with emoji, media, math and Mermaid providers', () => {
    render(<RendererSurface document={document} />);

    expect(screen.getByLabelText('Rendered ADF')).toHaveTextContent('Preview');
    expect(providerFactory).toHaveBeenCalledWith(
      expect.objectContaining({ emojiProvider: expect.any(Promise), mediaProvider: expect.any(Promise) }),
    );
    expect(screen.getByLabelText('Rendered ADF')).toHaveAttribute(
      'data-providers',
      JSON.stringify({ providers: true }),
    );
  });
});
