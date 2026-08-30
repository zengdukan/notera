/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const initialDocument = {
  version: 1 as const,
  type: 'doc' as const,
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Initial' }] },
  ],
};
const changedDocument = {
  version: 1 as const,
  type: 'doc' as const,
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Changed' }] },
  ],
};
const requestDocument = jest.fn((receive: (document: unknown) => void) => {
  receive(changedDocument);
});
const forceToolbarDockingWithoutAnalytics = jest.fn();
const mockEditorApi = {
  core: { actions: { requestDocument } },
  selectionToolbar: {
    actions: { forceToolbarDockingWithoutAnalytics },
  },
};
const mockEditorActions = {};
const mockPreset = { add: jest.fn() };
mockPreset.add.mockReturnValue(mockPreset);
const mockUseUniversalPreset = jest.fn(() => mockPreset);

jest.mock('@atlaskit/editor-core/composable-editor', () => ({
  ComposableEditor: (props: {
    appearance: string;
    defaultValue: unknown;
    onChange(): void;
    onEditorReady(actions: typeof mockEditorActions): void;
  }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => props.onEditorReady(mockEditorActions), [props]);
    return (
      <div
        data-appearance={props.appearance}
        data-document={JSON.stringify(props.defaultValue)}
        data-testid="composable-editor"
      >
        <button type="button" onClick={props.onChange}>
          Simulate document change
        </button>
      </div>
    );
  },
}));
jest.mock('@atlaskit/editor-core/preset-universal', () => ({
  useUniversalPreset: mockUseUniversalPreset,
}));
jest.mock('@atlaskit/editor-core/use-preset', () => ({
  usePreset: (factory: () => unknown) => ({
    preset: factory(),
    editorApi: mockEditorApi,
  }),
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
  mermaidDoubleClickPlugin: jest.fn(() => Symbol('mermaid-double-click')),
  mermaidExtensionHandlers: {},
  useMermaidEditor: jest.fn(() => jest.fn()),
}));

import { Editor } from '../editor';

const mediaProvider = Promise.resolve({} as never);

describe('Atlaskit product editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreset.add.mockReturnValue(mockPreset);
  });

  it('uses the full-width appearance consistently across editor plugins', () => {
    render(
      <Editor
        mediaProvider={mediaProvider}
        document={initialDocument}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByTestId('composable-editor')).toHaveAttribute(
      'data-appearance',
      'full-width',
    );
    expect(screen.getByTestId('composable-editor')).toHaveAttribute(
      'data-document',
      JSON.stringify(initialDocument),
    );
    expect(screen.queryByLabelText('Page title')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Fixed width|Full width/ }),
    ).not.toBeInTheDocument();

    expect(mockUseUniversalPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ appearance: 'full-width' }),
      }),
    );
    expect(mockPreset.add).toHaveBeenCalledWith([
      expect.anything(),
      expect.objectContaining({ editorAppearance: 'full-width' }),
    ]);
  });

  it('leaves the Atlaskit formatting toolbar enabled', () => {
    render(
      <Editor
        mediaProvider={mediaProvider}
        document={initialDocument}
        onChange={jest.fn()}
      />,
    );

    expect(forceToolbarDockingWithoutAnalytics).not.toHaveBeenCalled();
    expect(mockUseUniversalPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPluginConfiguration: expect.objectContaining({
          toolbarPlugin: {
            contextualFormattingEnabled: 'always-pinned',
          },
        }),
      }),
    );
  });

  it('reads changed ADF through the public editor API callback', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <Editor
        mediaProvider={mediaProvider}
        document={initialDocument}
        onChange={onChange}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Simulate document change' }),
    );

    expect(requestDocument).toHaveBeenCalledWith(expect.any(Function), {
      alwaysFire: true,
    });
    expect(onChange).toHaveBeenCalledWith(changedDocument);
  });

});
