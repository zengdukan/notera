/** @jest-environment jsdom */

const mockRenderMermaid = jest.fn();

jest.mock('./mermaid', () => ({ renderMermaid: mockRenderMermaid }));

import { downloadMermaidSvg } from './download-svg';

describe('Mermaid SVG download', () => {
  const createObjectURL = jest.fn((_blob: Blob) => 'blob:mermaid-svg');
  const revokeObjectURL = jest.fn();
  let clickSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let clickedAnchor: HTMLAnchorElement | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    mockRenderMermaid.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    clickedAnchor = undefined;
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {
        clickedAnchor =
          document.querySelector<HTMLAnchorElement>(
            'a[download="mermaid-diagram.svg"]',
          ) ?? undefined;
      });
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete (URL as Partial<typeof URL>).createObjectURL;
    delete (URL as Partial<typeof URL>).revokeObjectURL;
    clickSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('downloads a standalone SVG normalized to its viewBox dimensions', async () => {
    mockRenderMermaid.mockResolvedValue({
      error: null,
      svg: '<svg viewBox="0 0 320 180" style="max-width: 100%"><text>A</text></svg>',
    });

    await expect(downloadMermaidSvg('flowchart LR\nA --> B')).resolves.toBe(
      true,
    );

    expect(mockRenderMermaid).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-svg-/u),
      'flowchart LR\nA --> B',
    );
    expect(clickedAnchor?.download).toBe('mermaid-diagram.svg');
    expect(clickedAnchor?.href).toBe('blob:mermaid-svg');
    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/svg+xml;charset=utf-8' }),
    );
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.size).toBeGreaterThan(0);
    jest.runOnlyPendingTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mermaid-svg');
    jest.useRealTimers();
    const svgMarkup = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result)));
      reader.addEventListener('error', () => reject(reader.error));
      reader.readAsText(blob);
    });
    jest.useFakeTimers();
    expect(svgMarkup).toContain('width="320"');
    expect(svgMarkup).toContain('height="180"');
    expect(svgMarkup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svgMarkup).not.toContain('max-width');
    expect(
      document.querySelector('a[download="mermaid-diagram.svg"]'),
    ).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('reports invalid Mermaid syntax without starting a download', async () => {
    mockRenderMermaid.mockResolvedValue({
      error: 'Invalid Mermaid syntax',
      svg: null,
    });

    await expect(downloadMermaidSvg('bad')).resolves.toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[svg-export] Invalid Mermaid syntax',
      expect.any(Error),
    );
  });

  it('rejects SVG output without a valid viewBox', async () => {
    mockRenderMermaid.mockResolvedValue({
      error: null,
      svg: '<svg><text>A</text></svg>',
    });

    await expect(downloadMermaidSvg('flowchart LR')).resolves.toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[svg-export] The Mermaid diagram has no valid dimensions',
      expect.any(Error),
    );
  });
});
