/** @jsxImportSource @emotion/react */
import type { ExtensionComponentProps } from '@atlaskit/editor-common/extensions';

import { renderKatex } from './katex';
import {
  blockMathStyles,
  inlineMathStyles,
  invalidMathStyles,
  mathBaseStyles,
} from './styles';
import { getMathLatex, type MathKind, type MathParameters } from './types';

type MathRendererProps = {
  kind: MathKind;
  latex: string;
  strict?: boolean;
};

export function MathRenderer({
  kind,
  latex,
  strict = false,
}: MathRendererProps) {
  const result = renderKatex(latex, kind, strict);
  const className = `math-extension math-extension--${kind}`;
  const kindStyles = kind === 'inline' ? inlineMathStyles : blockMathStyles;

  if (result.error) {
    return (
      <span
        aria-label={`Invalid equation: ${result.error}`}
        className={`${className} math-extension--invalid`}
        css={[mathBaseStyles, kindStyles, invalidMathStyles]}
        data-math-kind={kind}
        role="math"
      >
        {latex || 'Invalid equation'}
      </span>
    );
  }

  return (
    <span
      className={className}
      css={[mathBaseStyles, kindStyles]}
      data-math-kind={kind}
      dangerouslySetInnerHTML={{ __html: result.html }}
      role="math"
    />
  );
}

export function MathExtensionComponent({
  node,
}: ExtensionComponentProps<MathParameters>) {
  const kind: MathKind = node.type === 'inlineExtension' ? 'inline' : 'block';

  return <MathRenderer kind={kind} latex={getMathLatex(node.parameters)} />;
}
