import { SafePlugin } from '@atlaskit/editor-common/safe-plugin';
import type { NextEditorPlugin } from '@atlaskit/editor-common/types';
import { createRule } from '@atlaskit/editor-common/utils';
import type { Schema } from '@atlaskit/editor-prosemirror/model';
import { createPlugin } from '@atlaskit/prosemirror-input-rules';

import {
  createMathParameters,
  extensionKeyFor,
  MATH_EXTENSION_TYPE,
} from './types';

export const BLOCK_MATH_PATTERN = /^\$\$([^$\n]*[^$\s\n][^$\n]*)\$\$$/u;
export const INLINE_MATH_PATTERN =
  /(?<!\S)\$([^$\n]*[^$\s\n][^$\n]*)(?<!\\)\$$/u;

export function createMathInputRules(schema: Schema) {
  const inlineExtension = schema.nodes.inlineExtension;
  const extension = schema.nodes.extension;
  if (!inlineExtension || !extension) {
    return [];
  }

  const blockRule = createRule(BLOCK_MATH_PATTERN, (state, match, start) => {
    const latex = match[1];
    if (!latex?.trim()) {
      return null;
    }

    const $start = state.doc.resolve(start);
    if (!$start.parent.isTextblock || $start.depth === 0) {
      return null;
    }

    const containerDepth = $start.depth - 1;
    const container = $start.node(containerDepth);
    const paragraphIndex = $start.index(containerDepth);
    if (
      !container.canReplaceWith(paragraphIndex, paragraphIndex + 1, extension)
    ) {
      return null;
    }

    const node = extension.create({
      extensionKey: extensionKeyFor('block'),
      extensionType: MATH_EXTENSION_TYPE,
      layout: 'default',
      parameters: createMathParameters(latex),
    });
    const paragraphStart = $start.before();

    return state.tr.replaceWith(
      paragraphStart,
      paragraphStart + $start.parent.nodeSize,
      node,
    );
  });

  const inlineRule = createRule(
    INLINE_MATH_PATTERN,
    (state, match, start, end) => {
      const latex = match[1];
      if (!latex?.trim()) {
        return null;
      }

      const node = inlineExtension.create({
        extensionKey: extensionKeyFor('inline'),
        extensionType: MATH_EXTENSION_TYPE,
        parameters: createMathParameters(latex),
      });

      return state.tr.replaceWith(start, end, node);
    },
  );

  return [blockRule, inlineRule];
}

function createMathInputRulePlugin(schema: Schema): SafePlugin | undefined {
  const rules = createMathInputRules(schema);
  if (rules.length === 0) {
    return undefined;
  }

  return new SafePlugin(createPlugin('math-input-rules', rules));
}

export const mathInputRulePlugin: NextEditorPlugin<'mathInputRule'> = () => ({
  name: 'mathInputRule',
  pmPlugins() {
    return [
      {
        name: 'mathInputRule',
        plugin: ({ schema }) => createMathInputRulePlugin(schema),
      },
    ];
  },
});
