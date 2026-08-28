/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
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
const execute = jest.fn();
const command = (name: string) => jest.fn(() => Symbol(name));
const showMediaPicker = jest.fn();
const forceToolbarDockingWithoutAnalytics = jest.fn();
const mockInsertMath = jest.fn(async () => true);
const mockInsertMermaid = jest.fn(async () => true);
const mockEditorApi = {
  core: { actions: { execute, requestDocument } },
  undoRedoPlugin: { actions: { undo: jest.fn(), redo: jest.fn() } },
  textFormatting: {
    commands: {
      toggleStrong: command('strong'),
      toggleEm: command('em'),
      toggleUnderline: command('underline'),
      toggleStrike: command('strike'),
      toggleCode: command('code'),
      toggleSuperscript: command('superscript'),
      toggleSubscript: command('subscript'),
    },
  },
  blockType: {
    commands: {
      setTextLevel: command('text-level'),
      clearFormatting: command('clear'),
    },
  },
  hyperlink: { commands: { showLinkToolbar: command('link') } },
  list: {
    commands: {
      toggleBulletList: command('bullet-list'),
      toggleOrderedList: command('ordered-list'),
      outdentList: command('outdent'),
      indentList: command('indent'),
    },
  },
  taskDecision: { commands: { toggleTaskList: command('task-list') } },
  table: { commands: { insertTableWithSize: command('table') } },
  textColor: { commands: { changeColor: command('text-color') } },
  highlight: { commands: { changeColor: command('highlight') } },
  date: { commands: { insertDate: command('date') } },
  status: { commands: { insertStatus: command('status') } },
  media: { sharedState: { currentState: () => ({ showMediaPicker }) } },
  emoji: { actions: { openTypeAhead: jest.fn() } },
  selectionToolbar: {
    actions: { forceToolbarDockingWithoutAnalytics },
  },
};
const mockEditorActions = {
  focus: jest.fn(),
  replaceSelection: jest.fn(),
};
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
  insertMathFromToolbar: mockInsertMath,
  mathDoubleClickPlugin: jest.fn(() => Symbol('math-double-click')),
  mathExtensionHandlers: {},
  mathInputRulePlugin: Symbol('math-input-rule'),
  useMathEditor: jest.fn(() => jest.fn()),
}));
jest.mock('../mermaid', () => ({
  createMermaidExtensionProvider: jest.fn(() => ({})),
  insertMermaidFromToolbar: mockInsertMermaid,
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

  it('keeps the external toolbar as the only formatting toolbar', async () => {
    render(
      <Editor
        mediaProvider={mediaProvider}
        document={initialDocument}
        onChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(forceToolbarDockingWithoutAnalytics).toHaveBeenCalledWith('none'),
    );
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

  it('exposes toolbar actions backed by the public editor API', async () => {
    const onToolbarReady = jest.fn();
    render(
      <Editor
        mediaProvider={mediaProvider}
        document={initialDocument}
        onChange={jest.fn()}
        onToolbarReady={onToolbarReady}
      />,
    );

    await waitFor(() => expect(onToolbarReady).toHaveBeenCalled());
    const toolbar = onToolbarReady.mock.calls.at(-1)?.[0];
    toolbar('bold');

    expect(
      mockEditorApi.textFormatting.commands.toggleStrong,
    ).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(expect.any(Symbol));
  });

  it('maps formatting, lists and insert actions without private editor state', async () => {
    const onToolbarReady = jest.fn();
    render(
      <Editor
        mediaProvider={mediaProvider}
        document={initialDocument}
        onChange={jest.fn()}
        onToolbarReady={onToolbarReady}
      />,
    );
    await waitFor(() => expect(onToolbarReady).toHaveBeenCalled());
    const toolbar = onToolbarReady.mock.calls.at(-1)?.[0];

    for (const action of [
      'undo',
      'redo',
      'heading-2',
      'italic',
      'underline',
      'strike',
      'inline-code',
      'superscript',
      'subscript',
      'link',
      'bullet-list',
      'number-list',
      'task-list',
      'outdent',
      'indent',
      'table',
      'text-color',
      'highlight-color',
      'date',
      'status',
      'media',
      'emoji',
      'math',
      'mermaid',
      'rule',
      'layout',
      'panel',
      'code-block',
    ]) {
      toolbar(action);
    }

    expect(mockEditorApi.undoRedoPlugin.actions.undo).toHaveBeenCalled();
    expect(mockEditorApi.blockType.commands.setTextLevel).toHaveBeenCalledWith(
      'heading2',
      expect.anything(),
    );
    expect(mockEditorApi.list.commands.toggleBulletList).toHaveBeenCalled();
    expect(mockEditorApi.table.commands.insertTableWithSize).toHaveBeenCalled();
    expect(showMediaPicker).toHaveBeenCalled();
    expect(mockEditorApi.emoji.actions.openTypeAhead).toHaveBeenCalled();
    expect(mockInsertMath).toHaveBeenCalledWith(
      expect.any(Function),
      mockEditorActions,
    );
    expect(mockInsertMermaid).toHaveBeenCalledWith(
      expect.any(Function),
      mockEditorActions,
    );
    expect(mockEditorActions.replaceSelection).toHaveBeenCalled();
    expect(
      Reflect.get(mockEditorActions, '_privateGetEditorView'),
    ).toBeUndefined();
  });
});
