import katex, { type KatexOptions } from 'katex';

import type { MathKind } from './types';

const BASE_OPTIONS: KatexOptions = {
  output: 'htmlAndMathml',
  trust: false,
};

export type KatexRenderResult =
  | { html: string; error: null }
  | { html: ''; error: string };

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^KaTeX parse error:\s*/u, '');
  }

  return 'Invalid LaTeX expression';
}

export function validateLatex(latex: string, kind: MathKind): string | null {
  if (!latex.trim()) {
    return 'Enter a LaTeX expression';
  }

  try {
    katex.renderToString(latex, {
      ...BASE_OPTIONS,
      displayMode: kind === 'block',
      strict: 'error',
      throwOnError: true,
    });
    return null;
  } catch (error) {
    return errorMessage(error);
  }
}

export function renderKatex(
  latex: string,
  kind: MathKind,
  strict = false,
): KatexRenderResult {
  if (!latex.trim()) {
    return { html: '', error: 'Equation content is missing' };
  }

  try {
    return {
      html: katex.renderToString(latex, {
        ...BASE_OPTIONS,
        displayMode: kind === 'block',
        strict: strict ? 'error' : 'ignore',
        throwOnError: strict,
      }),
      error: null,
    };
  } catch (error) {
    return { html: '', error: errorMessage(error) };
  }
}
