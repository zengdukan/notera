import katex from 'katex';
import 'katex/dist/katex.min.css';
import type {
  ExtensionHandler,
  ExtensionParams,
} from '@atlaskit/editor-common/extensions';

export const MATH_EXTENSION_TYPE = 'com.atlassian.editor.math';

function latexOf(parameters: unknown): string {
  if (typeof parameters !== 'object' || parameters === null) return '';
  const latex = (parameters as { latex?: unknown }).latex;
  return typeof latex === 'string' ? latex : '';
}

function invalidMath(latex: string) {
  return (
    <span
      aria-label="无效公式"
      className="export-extension export-extension--invalid-math"
      data-export-lossy="true"
      role="math"
    >
      {latex || '公式内容为空'}
    </span>
  );
}

export const renderMathExtension: ExtensionHandler = (
  extension: ExtensionParams<any>,
) => {
  if (!/^math:(?:inline|block)$/u.test(extension.extensionKey)) {
    return invalidMath(latexOf(extension.parameters));
  }
  const latex = latexOf(extension.parameters);
  try {
    const html = katex.renderToString(latex, {
      displayMode: extension.type !== 'inlineExtension',
      output: 'htmlAndMathml',
      strict: 'error',
      throwOnError: true,
      trust: false,
    });
    return (
      <span
        className="export-extension export-extension--math"
        dangerouslySetInnerHTML={{ __html: html }}
        role="math"
      />
    );
  } catch {
    return invalidMath(latex);
  }
};
