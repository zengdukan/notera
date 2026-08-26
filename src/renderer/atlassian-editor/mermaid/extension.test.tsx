const mockDownloadMermaidSvg = jest.fn();

jest.mock('./download-svg', () => ({
  downloadMermaidSvg: mockDownloadMermaidSvg,
}));

import { createMermaidExtensionProvider } from './extension';

describe('Mermaid extension contextual toolbar', () => {
  beforeEach(() => {
    mockDownloadMermaidSvg.mockReset();
    mockDownloadMermaidSvg.mockResolvedValue(true);
  });

  it('registers an SVG action for Mermaid block nodes', async () => {
    const provider = createMermaidExtensionProvider(async () => undefined);
    const [manifest] = await provider.getExtensions();
    const toolbar = manifest.modules.contextualToolbars?.[0];
    expect(toolbar?.context).toEqual({
      extensionKey: 'mermaid:block',
      extensionType: 'com.atlassian.editor.mermaid',
      nodeType: 'extension',
      type: 'extension',
    });
    if (!toolbar || typeof toolbar.toolbarItems === 'function') {
      throw new Error('Expected a static Mermaid toolbar');
    }
    const button = toolbar.toolbarItems[0];
    if (!('action' in button)) {
      throw new Error('Expected a Mermaid toolbar button');
    }

    await button.action(
      {
        attrs: {
          extensionKey: 'mermaid:block',
          extensionType: 'com.atlassian.editor.mermaid',
          parameters: {
            source: 'flowchart LR\nA --> B',
            version: 1,
          },
        },
        type: 'extension',
      },
      {} as Parameters<typeof button.action>[1],
    );

    expect(button).toMatchObject({
      ariaLabel: 'Download as SVG',
      display: 'icon',
      label: 'Download as SVG',
      tooltip: 'Download as SVG',
    });
    expect(mockDownloadMermaidSvg).toHaveBeenCalledWith(
      'flowchart LR\nA --> B',
    );
  });
});
