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
const execute = jest.fn();
const scrollToNext = Symbol('scroll-to-next');
const scrollToPrevious = Symbol('scroll-to-previous');
const mockEditorApi = {
  core: { actions: { execute, requestDocument } },
  selectionToolbar: {
    actions: { forceToolbarDockingWithoutAnalytics },
  },
  showDiff: { commands: { scrollToNext, scrollToPrevious } },
};
const mockEditorActions = {};
const mockPreset = { add: jest.fn() };
mockPreset.add.mockReturnValue(mockPreset);
const mockUseUniversalPreset = jest.fn(() => mockPreset);
const diffStep = {
  stepType: 'replace',
  from: 1,
  to: 2,
  slice: { content: [], openEnd: 0, openStart: 0 },
  clientId: 'test-client',
  userId: 'test-user',
};

jest.mock('@atlaskit/editor-core/composable-editor', () => ({
  ComposableEditor: (props: {
    allowUndoRedoButtons?: boolean;
    appearance: string;
    defaultValue: unknown;
    disabled?: boolean;
    emojiProvider?: unknown;
    featureFlags?: { twoLineEditorToolbar?: boolean };
    onChange(): void;
    onEditorReady(actions: typeof mockEditorActions): void;
    quickInsert?: boolean;
  }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => props.onEditorReady(mockEditorActions), [props]);
    return (
      <div
        data-appearance={props.appearance}
        data-emoji-provider={String(Boolean(props.emojiProvider))}
        data-disabled={String(props.disabled ?? false)}
        data-document={JSON.stringify(props.defaultValue)}
        data-quick-insert={String(props.quickInsert ?? false)}
        data-two-line-toolbar={String(
          props.featureFlags?.twoLineEditorToolbar ?? false,
        )}
        data-undo-redo={String(props.allowUndoRedoButtons ?? false)}
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
jest.mock('@atlaskit/editor-common/hooks', () => ({
  useSharedPluginStateWithSelector: (
    _api: unknown,
    _plugins: unknown,
    selector: (state: unknown) => unknown,
  ) =>
    selector({
      showDiffState: { activeIndex: 1, numberOfChanges: 3 },
    }),
}));
jest.mock('@atlaskit/editor-plugin-show-diff', () => ({
  showDiffPlugin: Symbol('show-diff'),
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

  it('enables undo, redo, and emoji in the preset and visible toolbar', () => {
    render(
      <Editor
        mediaProvider={mediaProvider}
        document={initialDocument}
        onChange={jest.fn()}
      />,
    );

    expect(mockUseUniversalPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          allowUndoRedoButtons: true,
          emojiProvider: expect.any(Promise),
        }),
        initialPluginConfiguration: expect.objectContaining({
          insertBlockPlugin: expect.objectContaining({
            toolbarButtons: expect.objectContaining({
              emoji: { enabled: true },
            }),
          }),
        }),
      }),
    );
    expect(screen.getByTestId('composable-editor')).toHaveAttribute(
      'data-undo-redo',
      'true',
    );
    expect(screen.getByTestId('composable-editor')).toHaveAttribute(
      'data-emoji-provider',
      'true',
    );
    expect(screen.getByTestId('composable-editor')).toHaveAttribute(
      'data-two-line-toolbar',
      'false',
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

  it('configures a read-only diff and exposes change navigation', async () => {
    const user = userEvent.setup();
    const renderDiffControls = jest.fn(
      ({
        activeIndex,
        numberOfChanges,
        onNext,
        onPrevious,
      }: {
        activeIndex?: number;
        numberOfChanges: number;
        onNext(): void;
        onPrevious(): void;
      }) => (
        <div>
          <output>{`${activeIndex}:${numberOfChanges}`}</output>
          <button type="button" onClick={onPrevious}>
            Previous change
          </button>
          <button type="button" onClick={onNext}>
            Next change
          </button>
        </div>
      ),
    );

    render(
      <Editor
        appearance="chromeless"
        diff={{
          colorScheme: 'traditional',
          originalDocument: initialDocument,
          steps: [diffStep],
        }}
        disabled
        mediaProvider={mediaProvider}
        document={changedDocument}
        onChange={jest.fn()}
        renderDiffControls={renderDiffControls}
      />,
    );

    expect(screen.getByTestId('composable-editor')).toHaveAttribute(
      'data-appearance',
      'chromeless',
    );
    expect(screen.getByTestId('composable-editor')).toHaveAttribute(
      'data-disabled',
      'true',
    );
    expect(screen.getByTestId('composable-editor')).toHaveAttribute(
      'data-quick-insert',
      'false',
    );
    expect(screen.getByText('1:3')).toBeVisible();
    expect(mockPreset.add).toHaveBeenCalledWith([
      expect.anything(),
      {
        colorScheme: 'traditional',
        originalDoc: initialDocument,
        steps: [diffStep],
      },
    ]);

    await user.click(screen.getByRole('button', { name: 'Previous change' }));
    await user.click(screen.getByRole('button', { name: 'Next change' }));
    expect(execute).toHaveBeenNthCalledWith(1, scrollToPrevious);
    expect(execute).toHaveBeenNthCalledWith(2, scrollToNext);
  });
});
