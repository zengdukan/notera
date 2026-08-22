import { asAdfDocument, asAttachmentId } from '@notera/domain';

import { renderMarkdown } from '../markdown';
import type { PlannedAsset } from '../types';

const imageId = asAttachmentId('10000000-0000-4000-8000-000000000001');
const fileId = asAttachmentId('10000000-0000-4000-8000-000000000002');

const assets = new Map([
  [
    imageId,
    {
      id: imageId,
      fileName: 'photo.png',
      mimeType: 'image/png',
      byteLength: 3,
      relativePath: 'assets/photo.png',
    } satisfies PlannedAsset,
  ],
  [
    fileId,
    {
      id: fileId,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      byteLength: 4,
      relativePath: 'assets/report.pdf',
    } satisfies PlannedAsset,
  ],
]);

describe('ADF to Markdown', () => {
  it('renders text, lists, tables, math, mermaid and attachments', () => {
    const document = asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [
            { type: 'text', text: 'Title', marks: [{ type: 'strong' }] },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Visit ' },
            {
              type: 'text',
              text: 'site',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
            {
              type: 'inlineExtension',
              attrs: {
                extensionKey: 'math:inline',
                parameters: { latex: 'x^2' },
              },
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
              ],
            },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'A' }],
                    },
                  ],
                },
                {
                  type: 'tableHeader',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'B' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '1' }],
                    },
                  ],
                },
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '2' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'extension',
          attrs: {
            extensionKey: 'math:block',
            parameters: { latex: '\\frac{1}{2}' },
          },
        },
        {
          type: 'extension',
          attrs: {
            extensionKey: 'mermaid:block',
            parameters: { source: 'flowchart LR\nA-->B' },
          },
        },
        { type: 'media', attrs: { id: imageId, alt: 'Photo' } },
        { type: 'media', attrs: { id: fileId } },
      ],
    });

    const result = renderMarkdown({ document, assetsById: assets });
    const markdown = new TextDecoder().decode(result.bytes);

    expect(markdown).toContain('## **Title**');
    expect(markdown).toContain('[site](https://example.com)$x^2$');
    expect(markdown).toContain('- One');
    expect(markdown).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(markdown).toContain('$$\n\\frac{1}{2}\n$$');
    expect(markdown).toContain('```mermaid\nflowchart LR\nA-->B\n```');
    expect(markdown).toContain('![Photo](assets/photo.png)');
    expect(markdown).toContain('[report.pdf](assets/report.pdf)');
    expect(markdown.endsWith('\n')).toBe(true);
    expect(result.lossyNodeCount).toBe(0);
  });

  it('uses explicit placeholders instead of raw html or silent loss', () => {
    const document = asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'unsupportedWidget',
          attrs: { html: '<script>bad()</script>' },
        },
        { type: 'media', attrs: { id: 'invalid' } },
      ],
    });

    const result = renderMarkdown({ document, assetsById: new Map() });
    const markdown = new TextDecoder().decode(result.bytes);

    expect(markdown).toContain('[不支持的内容：unsupportedWidget]');
    expect(markdown).toContain('[不支持的内容：media]');
    expect(markdown).not.toContain('<script>');
    expect(result.lossyNodeCount).toBe(2);
  });
});
