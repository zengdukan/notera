import type {
  ExtensionComponentProps,
  ExtensionHandler,
  ExtensionHandlers,
  ExtensionManifest,
  ExtensionModule,
  ExtensionModuleActionHandler,
  ExtensionModuleNodes,
} from '@atlaskit/editor-common/extensions';
import { DefaultExtensionProvider } from '@atlaskit/editor-common/extensions';
import AngleBracketsIcon from '@atlaskit/icon/core/angle-brackets';

import { MathExtensionComponent, MathRenderer } from './MathRenderer';
import {
  BLOCK_MATH_NODE_KEY,
  createMathAdf,
  createMathParameters,
  getMathLatex,
  INLINE_MATH_NODE_KEY,
  isMathExtensionKey,
  MATH_EXTENSION_KEY,
  MATH_EXTENSION_TYPE,
  type MathKind,
  type MathParameters,
  type OpenMathEditor,
} from './types';

const loadIcon = () => Promise.resolve(AngleBracketsIcon);

function createInsertAction(
  kind: MathKind,
  openMathEditor: OpenMathEditor,
): ExtensionModuleActionHandler {
  return async () => {
    const latex = await openMathEditor({ kind, latex: '' });
    return latex === undefined ? undefined : createMathAdf(kind, latex);
  };
}

function createUpdateAction(kind: MathKind, openMathEditor: OpenMathEditor) {
  return async (parameters: MathParameters) => {
    const latex = await openMathEditor({
      kind,
      latex: getMathLatex(parameters),
    });

    return latex === undefined ? undefined : createMathParameters(latex);
  };
}

export function createMathExtensionProvider(openMathEditor: OpenMathEditor) {
  const quickInsert: ExtensionModule<MathParameters>[] = [
    {
      action: createInsertAction('inline', openMathEditor),
      categories: ['text structure'],
      description: 'Insert a LaTeX equation within a line of text',
      featured: true,
      icon: loadIcon,
      key: INLINE_MATH_NODE_KEY,
      keywords: ['math', 'formula', 'latex', 'equation', 'inline'],
      title: 'Inline equation',
    },
    {
      action: createInsertAction('block', openMathEditor),
      categories: ['text structure'],
      description: 'Insert a centered LaTeX equation block',
      featured: true,
      icon: loadIcon,
      key: BLOCK_MATH_NODE_KEY,
      keywords: ['math', 'formula', 'latex', 'equation', 'block'],
      title: 'Block equation',
    },
  ];

  const nodes: ExtensionModuleNodes<MathParameters> = {
    [INLINE_MATH_NODE_KEY]: {
      render: () =>
        Promise.resolve(
          MathExtensionComponent as React.ComponentType<
            ExtensionComponentProps<MathParameters>
          >,
        ),
      type: 'inlineExtension',
      update: createUpdateAction('inline', openMathEditor),
    },
    [BLOCK_MATH_NODE_KEY]: {
      render: () =>
        Promise.resolve(
          MathExtensionComponent as React.ComponentType<
            ExtensionComponentProps<MathParameters>
          >,
        ),
      type: 'extension',
      update: createUpdateAction('block', openMathEditor),
    },
  };

  const manifest: ExtensionManifest<MathParameters> = {
    categories: ['text structure'],
    description: 'Inline and block equations rendered with KaTeX',
    icons: {
      '48': loadIcon,
    },
    key: MATH_EXTENSION_KEY,
    keywords: ['math', 'formula', 'latex', 'equation'],
    modules: {
      nodes,
      quickInsert,
    },
    title: 'Equation',
    type: MATH_EXTENSION_TYPE,
  };

  return new DefaultExtensionProvider<MathParameters>([manifest]);
}

const renderMathExtension: ExtensionHandler = (extension) => {
  if (!isMathExtensionKey(extension.extensionKey)) {
    return null;
  }

  const kind: MathKind =
    extension.type === 'inlineExtension' ? 'inline' : 'block';
  return (
    <MathRenderer kind={kind} latex={getMathLatex(extension.parameters)} />
  );
};

export const mathExtensionHandlers: ExtensionHandlers = {
  [MATH_EXTENSION_TYPE]: renderMathExtension,
};
