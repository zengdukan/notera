import { renderMermaid } from './mermaid';

const FILENAME = 'mermaid-diagram.svg';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to generate the SVG image';
}

function viewBoxSize(svg: SVGSVGElement): { height: number; width: number } {
  const values = svg
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);

  if (
    !values ||
    values.length !== 4 ||
    !Number.isFinite(values[2]) ||
    !Number.isFinite(values[3]) ||
    values[2] <= 0 ||
    values[3] <= 0
  ) {
    throw new Error('The Mermaid diagram has no valid dimensions');
  }

  return { height: values[3], width: values[2] };
}

function normalizeSvg(svgMarkup: string): string {
  const container = document.createElement('div');
  container.innerHTML = svgMarkup;
  const svg = container.querySelector<SVGSVGElement>('svg');
  if (!svg) {
    throw new Error('Mermaid did not return an SVG diagram');
  }

  const { height, width } = viewBoxSize(svg);
  svg.setAttribute('height', String(height));
  svg.setAttribute('width', String(width));
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.removeProperty('max-width');

  return svg.outerHTML;
}

function triggerDownload(svgMarkup: string): void {
  const blob = new Blob([svgMarkup], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.download = FILENAME;
  anchor.href = objectUrl;
  anchor.style.display = 'none';
  document.body.append(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export async function downloadMermaidSvg(source: string): Promise<boolean> {
  try {
    const result = await renderMermaid(
      `mermaid-svg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      source,
    );
    if (result.error !== null) {
      throw new Error(result.error);
    }
    if (!result.svg) {
      throw new Error('Mermaid did not return an SVG diagram');
    }

    triggerDownload(normalizeSvg(result.svg));
    return true;
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[svg-export] ${message}`, error);
    return false;
  }
}
