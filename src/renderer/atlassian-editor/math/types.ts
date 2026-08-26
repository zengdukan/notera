import type {
  ExtensionDefinition,
  InlineExtensionDefinition,
} from '@atlaskit/adf-schema';
import type { Parameters } from '@atlaskit/editor-common/extensions';

export const MATH_EXTENSION_TYPE = 'com.atlassian.editor.math';
export const MATH_EXTENSION_KEY = 'math';
export const INLINE_MATH_NODE_KEY = 'inline';
export const BLOCK_MATH_NODE_KEY = 'block';

export type MathKind = 'inline' | 'block';

export type MathParameters = Parameters & {
  latex: string;
  version: 1;
};

export type MathAdfNode = ExtensionDefinition | InlineExtensionDefinition;

export type MathEditorRequest = {
  kind: MathKind;
  latex: string;
};

export type OpenMathEditor = (
  request: MathEditorRequest,
) => Promise<string | undefined>;

export function extensionKeyFor(kind: MathKind): string {
  return `${MATH_EXTENSION_KEY}:${kind === 'inline' ? INLINE_MATH_NODE_KEY : BLOCK_MATH_NODE_KEY}`;
}

export function createMathParameters(latex: string): MathParameters {
  return {
    version: 1,
    latex,
  };
}

export function createMathAdf(kind: MathKind, latex: string): MathAdfNode {
  const attrs = {
    extensionType: MATH_EXTENSION_TYPE,
    extensionKey: extensionKeyFor(kind),
    parameters: createMathParameters(latex),
  };

  if (kind === 'inline') {
    return {
      type: 'inlineExtension',
      attrs,
    };
  }

  return {
    type: 'extension',
    attrs: {
      ...attrs,
      layout: 'default',
    },
  };
}

export function getMathLatex(parameters: unknown): string {
  if (!parameters || typeof parameters !== 'object') {
    return '';
  }

  const latex = (parameters as { latex?: unknown }).latex;
  return typeof latex === 'string' ? latex : '';
}

export function isMathExtensionKey(extensionKey: string): boolean {
  return (
    extensionKey === extensionKeyFor('inline') ||
    extensionKey === extensionKeyFor('block')
  );
}
