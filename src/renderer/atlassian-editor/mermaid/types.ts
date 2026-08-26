import type { ExtensionDefinition } from '@atlaskit/adf-schema';
import type { Parameters } from '@atlaskit/editor-common/extensions';

export const MERMAID_EXTENSION_TYPE = 'com.atlassian.editor.mermaid';
export const MERMAID_EXTENSION_KEY = 'mermaid';
export const MERMAID_BLOCK_NODE_KEY = 'block';

export type MermaidParameters = Parameters & {
  source: string;
  version: 1;
};

export type MermaidAdfNode = ExtensionDefinition;

export type MermaidEditorRequest = {
  source: string;
};

export type OpenMermaidEditor = (
  request: MermaidEditorRequest,
) => Promise<string | undefined>;

export function createMermaidParameters(source: string): MermaidParameters {
  return {
    version: 1,
    source,
  };
}

export function createMermaidAdf(source: string): MermaidAdfNode {
  return {
    type: 'extension',
    attrs: {
      extensionType: MERMAID_EXTENSION_TYPE,
      extensionKey: `${MERMAID_EXTENSION_KEY}:${MERMAID_BLOCK_NODE_KEY}`,
      parameters: createMermaidParameters(source),
      layout: 'default',
    },
  };
}

export function getMermaidSource(parameters: unknown): string {
  if (!parameters || typeof parameters !== 'object') {
    return '';
  }

  const source = (parameters as { source?: unknown }).source;
  return typeof source === 'string' ? source : '';
}

export function isMermaidExtensionKey(extensionKey: string): boolean {
  return extensionKey === `${MERMAID_EXTENSION_KEY}:${MERMAID_BLOCK_NODE_KEY}`;
}
