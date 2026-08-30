import { useCallback, useMemo, type ReactElement } from 'react';
import { type EditorActions, type EditorProps } from '@atlaskit/editor-core';
import { ComposableEditor } from '@atlaskit/editor-core/composable-editor';
import { useUniversalPreset } from '@atlaskit/editor-core/preset-universal';
import { usePreset } from '@atlaskit/editor-core/use-preset';
import { blockControlsPlugin } from '@atlaskit/editor-plugins/block-controls';
import { captionPlugin } from '@atlaskit/editor-plugins/caption';
import { gridPlugin } from '@atlaskit/editor-plugins/grid';
import { highlightPlugin } from '@atlaskit/editor-plugins/highlight';
import { mediaPlugin } from '@atlaskit/editor-plugins/media';

import type { AdfDocument } from '../../shared/ipc/adf';
import { emojiProvider } from '../editor/editor-providers';
import {
  createMathExtensionProvider,
  mathDoubleClickPlugin,
  mathExtensionHandlers,
  mathInputRulePlugin,
  useMathEditor,
} from './math';
import {
  createMermaidExtensionProvider,
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
  readonly shouldFocus?: boolean;
  readonly primaryToolbarComponents?: ReactElement[];
}

export function Editor({
  mediaProvider,
  document,
  onChange,
  onEditorReady,
  shouldFocus = false,
  primaryToolbarComponents,
}: ProductEditorProps) {
  const openMathEditor = useMathEditor();
  const openMermaidEditor = useMermaidEditor();
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
      onEditorReady?.(actions);
    },
    [onEditorReady],
  );

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
