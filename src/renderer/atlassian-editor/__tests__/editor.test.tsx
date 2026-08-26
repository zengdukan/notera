/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockDocument = {
  version: 1,
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved' }] }],
};
const mockGetValue = jest.fn(async () => mockDocument);
const mockPreset = { add: jest.fn() };
mockPreset.add.mockReturnValue(mockPreset);

jest.mock('@atlaskit/editor-core/composable-editor', () => ({
  ComposableEditor: (props: {
    onEditorReady(actions: { getValue: typeof mockGetValue }): void;
    primaryToolbarComponents?: React.ReactNode;
  }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => {
      props.onEditorReady({ getValue: mockGetValue });
    }, [props]);
    return React.createElement(
      'div',
      { 'data-testid': 'composable-editor' },
      props.primaryToolbarComponents,
    );
  },
}));
jest.mock('@atlaskit/editor-core/preset-universal', () => ({
  useUniversalPreset: () => mockPreset,
}));
jest.mock('@atlaskit/editor-core/use-preset', () => ({
  usePreset: (factory: () => unknown) => ({ preset: factory() }),
}));
jest.mock('@atlaskit/editor-plugins/block-controls', () => ({
  blockControlsPlugin: Symbol('block-controls'),
}));
jest.mock('@atlaskit/editor-plugins/caption', () => ({
  captionPlugin: Symbol('caption'),
}));
jest.mock('@atlaskit/editor-plugins/grid', () => ({
  gridPlugin: Symbol('grid'),
}));
jest.mock('@atlaskit/editor-plugins/highlight', () => ({
  highlightPlugin: Symbol('highlight'),
}));
jest.mock('@atlaskit/editor-plugins/media', () => ({
  mediaPlugin: Symbol('media'),
}));
jest.mock('@atlaskit/editor-common/provider-factory', () => ({
  ProviderFactory: { create: jest.fn(() => ({})) },
}));
jest.mock('@atlaskit/renderer', () => ({
  ReactRenderer: ({ document }: { document: unknown }) => (
    <output aria-label="Published ADF">{JSON.stringify(document)}</output>
  ),
}));
jest.mock('../media-provider', () => ({ mediaProvider: Promise.resolve({}) }));
jest.mock('../emoji/get-emoji-provider', () => ({
  currentUser: { id: 'user' },
  getEmojiProvider: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../math', () => ({
  createMathExtensionProvider: jest.fn(() => ({})),
  mathDoubleClickPlugin: jest.fn(() => Symbol('math-double-click')),
  mathExtensionHandlers: {},
  mathInputRulePlugin: Symbol('math-input-rule'),
  useMathEditor: jest.fn(() => jest.fn()),
}));
jest.mock('../mermaid', () => ({
  createMermaidExtensionProvider: jest.fn(() => ({})),
  insertMermaidFromToolbar: jest.fn(async () => undefined),
  mermaidDoubleClickPlugin: jest.fn(() => Symbol('mermaid-double-click')),
  mermaidExtensionHandlers: {},
  MermaidToolbarButton: ({ isDisabled }: { isDisabled?: boolean }) => (
    <button disabled={isDisabled} type="button">
      Insert Mermaid diagram
    </button>
  ),
  useMermaidEditor: jest.fn(() => jest.fn()),
}));

import { Editor } from '../editor';

describe('Atlaskit editor example shell', () => {
  beforeEach(() => {
    mockGetValue.mockClear();
    mockPreset.add.mockClear();
  });

  it('keeps title and layout controls in local component state', async () => {
    const user = userEvent.setup();
    render(<Editor />);

    const title = screen.getByLabelText('Page title');
    expect(title).toHaveValue('Untitled page');
    expect(screen.getByTestId('composable-editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fixed width' })).toBeVisible();

    await user.clear(title);
    await user.type(title, 'Local draft');
    await user.click(screen.getByRole('button', { name: 'Fixed width' }));
    expect(screen.getByRole('button', { name: 'Full width' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(title).toHaveValue('Untitled page');
    expect(mockGetValue).not.toHaveBeenCalled();
  });

  it('publishes the in-memory ADF and returns to editing', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Insert Mermaid diagram' }),
      ).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Published ADF')).toHaveTextContent('Saved');
    });
    expect(mockGetValue).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Page title')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByTestId('composable-editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Page title')).toBeEnabled();
  });
});
