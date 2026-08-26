import type {
  ExtensionComponentProps,
  ExtensionHandler,
  ExtensionHandlers,
  ExtensionManifest,
  ExtensionModule,
  ExtensionModuleActionHandler,
  ExtensionModuleNodes,
  ContextualToolbar,
} from '@atlaskit/editor-common/extensions';
import { DefaultExtensionProvider } from '@atlaskit/editor-common/extensions';
import DataFlowIcon from '@atlaskit/icon/core/data-flow';
import DownloadIcon from '@atlaskit/icon/core/download';

import { downloadMermaidSvg } from './download-svg';
import { MermaidExtensionComponent, MermaidRenderer } from './MermaidRenderer';
import {
  createMermaidAdf,
  createMermaidParameters,
  getMermaidSource,
  isMermaidExtensionKey,
  MERMAID_BLOCK_NODE_KEY,
  MERMAID_EXTENSION_KEY,
  MERMAID_EXTENSION_TYPE,
  type MermaidParameters,
  type OpenMermaidEditor,
} from './types';

const loadIcon = () => Promise.resolve(DataFlowIcon);

const loadDownloadIcon = () => Promise.resolve(DownloadIcon);

function createDownloadToolbar(): ContextualToolbar {
  return {
    context: {
      extensionKey: `${MERMAID_EXTENSION_KEY}:${MERMAID_BLOCK_NODE_KEY}`,
      extensionType: MERMAID_EXTENSION_TYPE,
      nodeType: 'extension',
      type: 'extension',
    },
    toolbarItems: [
      {
        action: async (contextNode) => {
          await downloadMermaidSvg(
            getMermaidSource(contextNode.attrs?.parameters),
          );
        },
        ariaLabel: 'Download as SVG',
        display: 'icon',
        icon: loadDownloadIcon,
        key: 'download-mermaid-svg',
        label: 'Download as SVG',
        tooltip: 'Download as SVG',
      },
    ],
  };
}

function createInsertAction(
  openMermaidEditor: OpenMermaidEditor,
): ExtensionModuleActionHandler {
  return async () => {
    const source = await openMermaidEditor({ source: '' });
    return source === undefined ? undefined : createMermaidAdf(source);
  };
}

function createUpdateAction(openMermaidEditor: OpenMermaidEditor) {
  return async (parameters: MermaidParameters) => {
    const source = await openMermaidEditor({
      source: getMermaidSource(parameters),
    });

    return source === undefined ? undefined : createMermaidParameters(source);
  };
}

export function createMermaidExtensionProvider(
  openMermaidEditor: OpenMermaidEditor,
) {
  const quickInsert: ExtensionModule<MermaidParameters>[] = [
    {
      action: createInsertAction(openMermaidEditor),
      categories: ['text structure'],
      description: 'Insert a diagram using Mermaid syntax',
      featured: true,
      icon: loadIcon,
      key: MERMAID_BLOCK_NODE_KEY,
      keywords: ['mermaid', 'diagram', 'flowchart', 'sequence', 'graph'],
      title: 'Mermaid diagram',
    },
  ];

  const nodes: ExtensionModuleNodes<MermaidParameters> = {
    [MERMAID_BLOCK_NODE_KEY]: {
      render: () =>
        Promise.resolve(
          MermaidExtensionComponent as React.ComponentType<
            ExtensionComponentProps<MermaidParameters>
          >,
        ),
      type: 'extension',
      update: createUpdateAction(openMermaidEditor),
    },
  };

  const manifest: ExtensionManifest<MermaidParameters> = {
    categories: ['text structure'],
    description: 'Diagrams rendered from Mermaid syntax',
    icons: {
      '48': loadIcon,
    },
    key: MERMAID_EXTENSION_KEY,
    keywords: ['mermaid', 'diagram', 'flowchart', 'sequence', 'graph'],
    modules: {
      contextualToolbars: [createDownloadToolbar()],
      nodes,
      quickInsert,
    },
    title: 'Mermaid diagram',
    type: MERMAID_EXTENSION_TYPE,
  };

  return new DefaultExtensionProvider<MermaidParameters>([manifest]);
}

const renderMermaidExtension: ExtensionHandler = (extension) => {
  if (!isMermaidExtensionKey(extension.extensionKey)) {
    return null;
  }

  return <MermaidRenderer source={getMermaidSource(extension.parameters)} />;
};

export function createMermaidExtensionHandlers(): ExtensionHandlers {
  return {
    [MERMAID_EXTENSION_TYPE]: renderMermaidExtension,
  };
}

export const mermaidExtensionHandlers = createMermaidExtensionHandlers();
