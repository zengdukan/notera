import {
  type ReactElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type EditorActions, type EditorProps } from '@atlaskit/editor-core';
import { ComposableEditor } from '@atlaskit/editor-core/composable-editor';
import { useUniversalPreset } from '@atlaskit/editor-core/preset-universal';
import { usePreset } from '@atlaskit/editor-core/use-preset';
import { blockControlsPlugin } from '@atlaskit/editor-plugins/block-controls';
import { captionPlugin } from '@atlaskit/editor-plugins/caption';
import { gridPlugin } from '@atlaskit/editor-plugins/grid';
import { highlightPlugin } from '@atlaskit/editor-plugins/highlight';
import { mediaPlugin } from '@atlaskit/editor-plugins/media';
import { ProviderFactory } from '@atlaskit/editor-common/provider-factory';
import { ReactRenderer } from '@atlaskit/renderer';
import type { DocNode } from '@atlaskit/adf-schema';

import { mediaProvider } from './media-provider';
import { currentUser, getEmojiProvider } from './emoji/get-emoji-provider';
import {
  createMathExtensionProvider,
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
  MermaidToolbarButton,
  useMermaidEditor,
} from './mermaid';

const EMPTY_DOCUMENT = {
  version: 1,
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'This editor uses only the public @atlaskit/editor-core API.',
        },
      ],
    },
  ],
};

const emojiProvider = getEmojiProvider({
  currentUser,
  uploadSupported: false,
});

const rendererProviders = ProviderFactory.create({
  emojiProvider,
  mediaProvider,
});

type Appearance = 'full-page' | 'full-width';

/**
 * Mirrors the editor wrapper used by editor-core/examples/5-full-page.tsx.
 * The published universal preset always adds mediaInsertPlugin when media is
 * enabled. That plugin owns the File/Link popup and has no public option for a
 * File-only UI. Build the universal preset without media, then add the public
 * grid/media/caption plugins back. With no mediaInsertPlugin, Atlaskit's media
 * toolbar, insert menu, and quick insert all fall back to showMediaPicker(),
 * which opens the local file picker directly.
 */
function FullPageComposableEditor(props: EditorProps) {
  const openMathEditor = useMathEditor();
  const openMermaidEditor = useMermaidEditor();
  const mediaOptions = props.media;
  const universalPreset = useUniversalPreset({
    props: {
      ...props,
      media: undefined,
    },
    initialPluginConfiguration: {
      insertBlockPlugin: {
        // Suppress Atlaskit's mediaInsert toolbar button. A local-upload-only
        // replacement is added below. Supplying this object changes all button
        // defaults to disabled, so keep every other default button explicit.
        toolbarButtons: {
          codeBlock: { enabled: false },
          emoji: { enabled: true },
          insert: { enabled: true },
          layout: { enabled: true },
          media: { enabled: false },
          mention: { enabled: true },
          table: { enabled: true },
          taskList: { enabled: true },
        },
      },
    },
  });
  const { preset } = usePreset(() => {
    let localMediaPreset = universalPreset;

    if (mediaOptions) {
      localMediaPreset = localMediaPreset
        .add([gridPlugin, { shouldCalcBreakoutGridLines: true }])
        .add([
          mediaPlugin,
          {
            ...mediaOptions,
            allowAdvancedToolBarOptions:
              mediaOptions.allowAdvancedToolBarOptions ?? true,
            allowBreakoutSnapPoints: true,
            allowDropzoneDropLine: true,
            allowImagePreview: mediaOptions.allowImagePreview ?? true,
            allowLazyLoading: true,
            allowMarkingUploadsAsIncomplete: false,
            allowMediaSingleEditable: true,
            allowRemoteDimensionsFetch: true,
            editorAppearance: props.appearance,
            fullWidthEnabled: props.appearance === 'full-width',
            isCopyPasteEnabled: true,
          },
        ]);

      if (mediaOptions.allowCaptions) {
        localMediaPreset = localMediaPreset.add(captionPlugin);
      }
    }

    return localMediaPreset
      .add(highlightPlugin)
      .add(blockControlsPlugin)
      .add(mathInputRulePlugin)
      .add(mathDoubleClickPlugin(openMathEditor))
      .add(mermaidDoubleClickPlugin(openMermaidEditor));
  }, [
    mediaOptions,
    openMathEditor,
    openMermaidEditor,
    props.appearance,
    universalPreset,
  ]);

  return <ComposableEditor {...props} preset={preset} />;
}

type EditorPropsWithLanguagePicker = {
  languagePicker?: ReactElement;
};

export function Editor({ languagePicker }: EditorPropsWithLanguagePicker) {
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
  const editorActions = useRef<EditorActions | null>(null);
  const [title, setTitle] = useState('Untitled page');
  const [document, setDocument] = useState<DocNode>(EMPTY_DOCUMENT as DocNode);
  const [isEditing, setIsEditing] = useState(true);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>('full-width');

  const handleEditorReady = useCallback((actions: EditorActions) => {
    editorActions.current = actions;
    setIsEditorReady(true);
  }, []);

  const handleInsertMermaid = useCallback(async () => {
    await insertMermaidFromToolbar(openMermaidEditor, editorActions.current);
  }, [openMermaidEditor]);

  const primaryToolbarComponents = useMemo(
    () => [
      <MermaidToolbarButton
        isDisabled={!isEditorReady}
        key="mermaid-toolbar-button"
        onClick={() => void handleInsertMermaid()}
      />,
      ...(languagePicker ? [languagePicker] : []),
    ],
    [handleInsertMermaid, isEditorReady, languagePicker],
  );

  const publish = useCallback(async () => {
    const value = await editorActions.current?.getValue();

    if (!value) {
      return;
    }

    setDocument(value as DocNode);
    setIsEditing(false);
  }, []);

  const clearDraft = useCallback(() => {
    setTitle('Untitled page');
    setDocument(EMPTY_DOCUMENT as DocNode);
    setIsEditing(true);
  }, []);

  const editorProps: EditorProps = {
    appearance,
    allowBlockType: {},
    allowBreakout: true,
    allowDate: true,
    allowExpand: {
      allowInsertion: true,
      allowInteractiveExpand: true,
    },
    allowExtension: {
      allowBreakout: true,
    },
    allowFindReplace: {
      allowMatchCase: true,
    },
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
    allowUndoRedoButtons: true,
    codeBlock: {
      allowCopyToClipboard: true,
    },
    media: {
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
      // This controls link actions on an inserted media node. The insertion UI
      // is made upload-only by omitting mediaInsertPlugin in the preset above.
      allowLinking: false,
      enableDownloadButton: true,
      featureFlags: {
        mediaInline: true,
      },
      isCopyPasteEnabled: true,
      waitForMediaUpload: true,
    },
    defaultValue: document,
    emojiProvider,
    extensionHandlers: {
      ...mathExtensionHandlers,
      ...mermaidExtensionHandlers,
    },
    extensionProviders: [mathExtensionProvider, mermaidExtensionProvider],
    featureFlags: {
      twoLineEditorToolbar: true,
    },
    onEditorReady: handleEditorReady,
    placeholder:
      "Type '/' to insert content, or use Markdown shortcuts such as # and *.",
    primaryToolbarComponents,
    quickInsert: true,
    shouldFocus: isEditing,
  };

  return (
    <main className={`full-page-example full-page-example--${appearance}`}>
      <header className="example-header">
        <div>
          <span className="example-eyebrow">ATLASKIT EDITOR</span>
          <strong>Full-page example</strong>
        </div>

        <div className="example-actions">
          <button
            type="button"
            onClick={() =>
              setAppearance((current) =>
                current === 'full-page' ? 'full-width' : 'full-page',
              )
            }
          >
            {appearance === 'full-page' ? 'Full width' : 'Fixed width'}
          </button>
          <button type="button" onClick={clearDraft}>
            Clear
          </button>
          {isEditing ? (
            <button className="button-primary" type="button" onClick={publish}>
              Publish
            </button>
          ) : (
            <button
              className="button-primary"
              type="button"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          )}
        </div>
      </header>

      <section className="example-content">
        <input
          aria-label="Page title"
          className="page-title"
          disabled={!isEditing}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Untitled page"
          value={title}
        />
        {isEditing ? (
          <FullPageComposableEditor key={appearance} {...editorProps} />
        ) : (
          <ReactRenderer
            adfStage="stage0"
            allowAltTextOnImages
            allowColumnSorting
            allowCopyToClipboard
            allowWrapCodeBlock
            appearance={appearance}
            dataProviders={rendererProviders}
            document={document}
            extensionHandlers={{
              ...mathExtensionHandlers,
              ...mermaidExtensionHandlers,
            }}
            media={{
              allowCaptions: true,
              allowLinking: false,
              enableDownloadButton: true,
            }}
            shouldOpenMediaViewer
          />
        )}
      </section>
    </main>
  );
}
