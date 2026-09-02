import { useCallback, useMemo, type ReactElement } from 'react';
import type { StepJson } from '@atlaskit/editor-common/collab';
import { useSharedPluginStateWithSelector } from '@atlaskit/editor-common/hooks';
import type { ExtractInjectionAPI } from '@atlaskit/editor-common/types';
import { type EditorActions, type EditorProps } from '@atlaskit/editor-core';
import { ComposableEditor } from '@atlaskit/editor-core/composable-editor';
import { useUniversalPreset } from '@atlaskit/editor-core/preset-universal';
import { usePreset } from '@atlaskit/editor-core/use-preset';
import {
  showDiffPlugin,
  type ShowDiffPlugin,
} from '@atlaskit/editor-plugin-show-diff';
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

export interface ProductEditorDiffNavigation {
  readonly activeIndex?: number;
  readonly numberOfChanges: number;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
}

export interface ProductEditorDiff {
  readonly colorScheme?: 'standard' | 'traditional';
  readonly originalDocument: AdfDocument;
  readonly steps: readonly StepJson[];
}

export interface ProductEditorProps {
  readonly mediaProvider: NonNullable<EditorProps['media']>['provider'];
  readonly document: AdfDocument;
  readonly appearance?: EditorProps['appearance'];
  readonly diff?: ProductEditorDiff;
  readonly disabled?: boolean;
  readonly onChange: (document: AdfDocument) => void;
  readonly onEditorReady?: (actions: EditorActions) => void;
  readonly renderDiffControls?: (
    navigation: ProductEditorDiffNavigation,
  ) => ReactElement;
  readonly shouldFocus?: boolean;
  readonly primaryToolbarComponents?: ReactElement[];
}

export function Editor({
  mediaProvider,
  document,
  appearance = EDITOR_APPEARANCE,
  diff,
  disabled = false,
  onChange,
  onEditorReady,
  renderDiffControls,
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
    appearance,
    disabled,
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
          editorAppearance: appearance,
          fullWidthEnabled: appearance === 'full-width',
        },
      ])
      .add(captionPlugin);

    if (diff) {
      productPreset = productPreset.add([
        showDiffPlugin,
        {
          colorScheme: diff.colorScheme ?? 'traditional',
          originalDoc: diff.originalDocument,
          steps: [...diff.steps],
        },
      ]);
    }

    productPreset = productPreset
      .add(highlightPlugin)
      .add(blockControlsPlugin)
      .add(mathInputRulePlugin)
      .add(mathDoubleClickPlugin(openMathEditor))
      .add(mermaidDoubleClickPlugin(openMermaidEditor));
    return productPreset;
  }, [diff, mediaOptions, openMathEditor, openMermaidEditor, universalPreset]);

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
    <>
      {diff && renderDiffControls ? (
        <DiffControls
          editorApi={
            editorApi as ExtractInjectionAPI<ShowDiffPlugin> | undefined
          }
          render={renderDiffControls}
        />
      ) : null}
      <ComposableEditor
        appearance={appearance}
        defaultValue={document}
        disabled={disabled}
        emojiProvider={emojiProvider}
        extensionProviders={[mathExtensionProvider, mermaidExtensionProvider]}
        featureFlags={{ twoLineEditorToolbar: false }}
        media={mediaOptions}
        onChange={handleChange}
        onEditorReady={handleEditorReady}
        preset={preset}
        primaryToolbarComponents={primaryToolbarComponents}
        quickInsert={!disabled}
        shouldFocus={shouldFocus}
      />
    </>
  );
}

function DiffControls({
  editorApi,
  render,
}: {
  readonly editorApi?: ExtractInjectionAPI<ShowDiffPlugin>;
  readonly render: (navigation: ProductEditorDiffNavigation) => ReactElement;
}) {
  const { activeIndex, numberOfChanges } = useSharedPluginStateWithSelector(
    editorApi,
    ['showDiff'],
    ({ showDiffState }) => ({
      activeIndex: showDiffState?.activeIndex,
      numberOfChanges: showDiffState?.numberOfChanges ?? 0,
    }),
  );
  const onNext = useCallback(() => {
    if (editorApi) {
      editorApi.core.actions.execute(editorApi.showDiff.commands.scrollToNext);
    }
  }, [editorApi]);
  const onPrevious = useCallback(() => {
    if (editorApi) {
      editorApi.core.actions.execute(
        editorApi.showDiff.commands.scrollToPrevious,
      );
    }
  }, [editorApi]);

  return render({ activeIndex, numberOfChanges, onNext, onPrevious });
}
