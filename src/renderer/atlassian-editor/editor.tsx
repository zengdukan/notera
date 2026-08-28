import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
} from 'react';
import { type EditorActions, type EditorProps } from '@atlaskit/editor-core';
import { INPUT_METHOD } from '@atlaskit/editor-common/analytics';
import { ComposableEditor } from '@atlaskit/editor-core/composable-editor';
import { useUniversalPreset } from '@atlaskit/editor-core/preset-universal';
import { usePreset } from '@atlaskit/editor-core/use-preset';
import { blockControlsPlugin } from '@atlaskit/editor-plugins/block-controls';
import { captionPlugin } from '@atlaskit/editor-plugins/caption';
import { gridPlugin } from '@atlaskit/editor-plugins/grid';
import { highlightPlugin } from '@atlaskit/editor-plugins/highlight';
import { mediaPlugin } from '@atlaskit/editor-plugins/media';

import type { AdfDocument } from '../../shared/ipc/adf';
import type { ToolbarExecutor } from '../editor/toolbar-actions';
import { emojiProvider } from '../editor/editor-providers';
import {
  createMathExtensionProvider,
  insertMathFromToolbar,
  mathDoubleClickPlugin,
  mathExtensionHandlers,
  mathInputRulePlugin,
  useMathEditor,
} from './math';
import {
  createMermaidExtensionProvider,
  insertMermaidFromToolbar,
  mermaidDoubleClickPlugin,
  mermaidExtensionHandlers,
  useMermaidEditor,
} from './mermaid';

const EDITOR_APPEARANCE = 'full-width' as const;

export interface ProductEditorProps {
  readonly mediaProvider: NonNullable<EditorProps['media']>['provider'];
  readonly document: AdfDocument;
  readonly onChange: (document: AdfDocument) => void;
  readonly onEditorReady?: (actions: EditorActions) => void;
  readonly onToolbarReady?: (execute: ToolbarExecutor) => void;
  readonly shouldFocus?: boolean;
  readonly primaryToolbarComponents?: ReactElement[];
}

export function Editor({
  mediaProvider,
  document,
  onChange,
  onEditorReady,
  onToolbarReady,
  shouldFocus = false,
  primaryToolbarComponents,
}: ProductEditorProps) {
  const openMathEditor = useMathEditor();
  const openMermaidEditor = useMermaidEditor();
  const editorActions = useRef<EditorActions | null>(null);
  const mathExtensionProvider = useMemo(
    () => createMathExtensionProvider(openMathEditor),
    [openMathEditor],
  );
  const mermaidExtensionProvider = useMemo(
    () => createMermaidExtensionProvider(openMermaidEditor),
    [openMermaidEditor],
  );
  const mediaOptions: NonNullable<EditorProps['media']> = useMemo(
    () => ({
      provider: mediaProvider,
      allowMediaSingle: true,
      allowMediaGroup: true,
      allowMediaSingleEditable: true,
      allowImagePreview: true,
      allowAdvancedToolBarOptions: true,
      allowResizing: true,
      allowResizingInTables: true,
      allowAltTextOnImages: true,
      allowCaptions: true,
      allowMediaInlineImages: true,
      allowLinking: false,
      enableDownloadButton: true,
      featureFlags: { mediaInline: true },
      isCopyPasteEnabled: true,
      waitForMediaUpload: true,
    }),
    [mediaProvider],
  );
  const editorConfiguration: EditorProps = {
    appearance: EDITOR_APPEARANCE,
    allowBlockType: {},
    allowBreakout: true,
    allowDate: true,
    allowExpand: { allowInsertion: true, allowInteractiveExpand: true },
    allowExtension: { allowBreakout: true },
    allowFindReplace: { allowMatchCase: true },
    allowHelpDialog: true,
    allowIndentation: true,
    showIndentationButtons: true,
    allowLayouts: {
      allowBreakout: true,
      UNSAFE_addSidebarLayouts: true,
      UNSAFE_allowSingleColumnLayout: true,
    },
    allowNestedTasks: true,
    allowPanel: true,
    allowRule: true,
    allowStatus: true,
    allowTables: {
      advanced: true,
      allowColumnSorting: true,
      allowCollapse: true,
      allowDistributeColumns: true,
      stickyHeaders: true,
      allowTableAlignment: true,
    },
    allowTasksAndDecisions: true,
    allowTextAlignment: true,
    allowTextColor: true,
    codeBlock: { allowCopyToClipboard: true },
    extensionHandlers: {
      ...mathExtensionHandlers,
      ...mermaidExtensionHandlers,
    },
    media: mediaOptions,
    placeholder:
      "Type '/' to insert content, or use Markdown shortcuts such as # and *.",
  };
  const universalPreset = useUniversalPreset({
    props: {
      ...editorConfiguration,
      media: undefined,
    },
    initialPluginConfiguration: {
      insertBlockPlugin: {
        toolbarButtons: {
          codeBlock: { enabled: false },
          emoji: { enabled: true },
          insert: { enabled: true },
          layout: { enabled: true },
          media: { enabled: false },
          mention: { enabled: false },
          table: { enabled: true },
          taskList: { enabled: true },
        },
      },
      toolbarPlugin: {
        contextualFormattingEnabled: 'always-pinned',
      },
    },
  });
  const { preset, editorApi } = usePreset(() => {
    let productPreset = universalPreset
      .add([gridPlugin, { shouldCalcBreakoutGridLines: true }])
      .add([
        mediaPlugin,
        {
          ...mediaOptions,
          allowBreakoutSnapPoints: true,
          allowDropzoneDropLine: true,
          allowLazyLoading: true,
          allowMarkingUploadsAsIncomplete: false,
          allowRemoteDimensionsFetch: true,
          editorAppearance: EDITOR_APPEARANCE,
          fullWidthEnabled: true,
        },
      ])
      .add(captionPlugin);

    productPreset = productPreset
      .add(highlightPlugin)
      .add(blockControlsPlugin)
      .add(mathInputRulePlugin)
      .add(mathDoubleClickPlugin(openMathEditor))
      .add(mermaidDoubleClickPlugin(openMermaidEditor));
    return productPreset;
  }, [mediaOptions, openMathEditor, openMermaidEditor, universalPreset]);

  const handleChange = useCallback(() => {
    editorApi?.core.actions.requestDocument(
      (value) => {
        if (value) onChange(value as AdfDocument);
      },
      { alwaysFire: true },
    );
  }, [editorApi, onChange]);
  const handleEditorReady = useCallback(
    (actions: EditorActions) => {
      editorActions.current = actions;
      onEditorReady?.(actions);
    },
    [onEditorReady],
  );
  const executeToolbar = useCallback<ToolbarExecutor>(
    (action) => {
      const execute = editorApi?.core.actions.execute;
      const textFormatting = editorApi?.textFormatting?.commands;
      const insert = (node: object) => {
        const inserted = editorActions.current?.replaceSelection(node) ?? false;
        if (inserted) editorActions.current?.focus();
      };
      switch (action) {
        case 'undo':
          editorApi?.undoRedoPlugin?.actions.undo();
          return;
        case 'redo':
          editorApi?.undoRedoPlugin?.actions.redo();
          return;
        case 'paragraph':
          execute?.(
            editorApi?.blockType?.commands.setTextLevel(
              'normal',
              INPUT_METHOD.TOOLBAR,
            ),
          );
          return;
        case 'heading-1':
          execute?.(
            editorApi?.blockType?.commands.setTextLevel(
              'heading1',
              INPUT_METHOD.TOOLBAR,
            ),
          );
          return;
        case 'heading-2':
          execute?.(
            editorApi?.blockType?.commands.setTextLevel(
              'heading2',
              INPUT_METHOD.TOOLBAR,
            ),
          );
          return;
        case 'heading-3':
          execute?.(
            editorApi?.blockType?.commands.setTextLevel(
              'heading3',
              INPUT_METHOD.TOOLBAR,
            ),
          );
          return;
        case 'bold':
          execute?.(textFormatting?.toggleStrong(INPUT_METHOD.TOOLBAR));
          return;
        case 'italic':
          execute?.(textFormatting?.toggleEm(INPUT_METHOD.TOOLBAR));
          return;
        case 'underline':
          execute?.(textFormatting?.toggleUnderline(INPUT_METHOD.TOOLBAR));
          return;
        case 'strike':
          execute?.(textFormatting?.toggleStrike(INPUT_METHOD.TOOLBAR));
          return;
        case 'inline-code':
          execute?.(textFormatting?.toggleCode(INPUT_METHOD.TOOLBAR));
          return;
        case 'superscript':
          execute?.(textFormatting?.toggleSuperscript(INPUT_METHOD.TOOLBAR));
          return;
        case 'subscript':
          execute?.(textFormatting?.toggleSubscript(INPUT_METHOD.TOOLBAR));
          return;
        case 'link':
          execute?.(
            editorApi?.hyperlink?.commands.showLinkToolbar(
              INPUT_METHOD.TOOLBAR,
            ),
          );
          return;
        case 'bullet-list':
          execute?.(
            editorApi?.list?.commands.toggleBulletList(INPUT_METHOD.TOOLBAR),
          );
          return;
        case 'number-list':
          execute?.(
            editorApi?.list?.commands.toggleOrderedList(INPUT_METHOD.TOOLBAR),
          );
          return;
        case 'task-list':
          execute?.(editorApi?.taskDecision?.commands.toggleTaskList());
          return;
        case 'outdent':
          execute?.(
            editorApi?.list?.commands.outdentList(INPUT_METHOD.TOOLBAR),
          );
          return;
        case 'indent':
          execute?.(editorApi?.list?.commands.indentList(INPUT_METHOD.TOOLBAR));
          return;
        case 'table':
          execute?.(
            editorApi?.table?.commands.insertTableWithSize(
              3,
              3,
              INPUT_METHOD.PICKER,
            ),
          );
          return;
        case 'text-color':
          execute?.(
            editorApi?.textColor?.commands.changeColor(
              '#0052CC',
              INPUT_METHOD.TOOLBAR,
            ),
          );
          return;
        case 'highlight-color':
          execute?.(
            editorApi?.highlight?.commands.changeColor({
              color: '#FFF0B3',
              inputMethod: INPUT_METHOD.TOOLBAR,
            }),
          );
          return;
        case 'clear-formatting':
          execute?.(
            editorApi?.blockType?.commands.clearFormatting(
              INPUT_METHOD.TOOLBAR,
            ),
          );
          return;
        case 'date':
          execute?.(
            editorApi?.date?.commands.insertDate({
              inputMethod: INPUT_METHOD.TOOLBAR,
            }),
          );
          return;
        case 'status':
          execute?.(
            editorApi?.status?.commands.insertStatus(INPUT_METHOD.TOOLBAR),
          );
          return;
        case 'media':
          editorApi?.media?.sharedState.currentState()?.showMediaPicker?.();
          return;
        case 'emoji':
          editorApi?.emoji?.actions.openTypeAhead(INPUT_METHOD.TOOLBAR);
          return;
        case 'math':
          void insertMathFromToolbar(openMathEditor, editorActions.current);
          return;
        case 'mermaid':
          void insertMermaidFromToolbar(
            openMermaidEditor,
            editorActions.current,
          );
          return;
        case 'rule':
          insert({ type: 'rule' });
          return;
        case 'layout':
          insert({
            type: 'layoutSection',
            content: [
              {
                type: 'layoutColumn',
                content: [{ type: 'paragraph', content: [] }],
              },
              {
                type: 'layoutColumn',
                content: [{ type: 'paragraph', content: [] }],
              },
            ],
          });
          return;
        case 'panel':
          insert({
            type: 'panel',
            attrs: { panelType: 'info' },
            content: [{ type: 'paragraph', content: [] }],
          });
          return;
        case 'code-block':
          insert({ type: 'codeBlock', attrs: { language: null }, content: [] });
          return;
        case 'align':
        case 'text-style':
        case 'more-formatting':
        case 'list':
        case 'insert':
          return;
        default:
          return action satisfies never;
      }
    },
    [editorApi, openMathEditor, openMermaidEditor],
  );
  useEffect(
    () => onToolbarReady?.(executeToolbar),
    [executeToolbar, onToolbarReady],
  );
  useEffect(() => {
    editorApi?.selectionToolbar?.actions.forceToolbarDockingWithoutAnalytics?.(
      'none',
    );
  }, [editorApi]);

  return (
    <ComposableEditor
      appearance={EDITOR_APPEARANCE}
      defaultValue={document}
      emojiProvider={emojiProvider}
      extensionProviders={[mathExtensionProvider, mermaidExtensionProvider]}
      featureFlags={{ twoLineEditorToolbar: false }}
      media={mediaOptions}
      onChange={handleChange}
      onEditorReady={handleEditorReady}
      preset={preset}
      primaryToolbarComponents={primaryToolbarComponents}
      quickInsert
      shouldFocus={shouldFocus}
    />
  );
}
