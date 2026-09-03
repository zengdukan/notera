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

    const result = renderMarkdown({
      document,
      assetsById: assets,
      locale: 'en',
    });
    const markdown = new TextDecoder().decode(result.bytes);

    expect(markdown).toContain('## **Title**');
    expect(markdown).toContain('[site](https://example.com)$`x^2`$');
    expect(markdown).toContain('- One');
    expect(markdown).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(markdown).toContain('$$\n\\frac{1}{2}\n$$');
    expect(markdown).toContain('```mermaid\nflowchart LR\nA-->B\n```');
    expect(markdown).toContain('![Photo](assets/photo.png)');
    expect(markdown).toContain('[report.pdf](assets/report.pdf)');
    expect(markdown.endsWith('\n')).toBe(true);
    expect(result.lossyNodeCount).toBe(0);
  });

  it('renders supported inline and structural nodes as localized GitHub Markdown', () => {
    const document = asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'emoji', attrs: { shortName: ':grinning:', text: '😀' } },
            { type: 'text', text: ' ' },
            { type: 'emoji', attrs: { shortName: ':custom:' } },
            { type: 'text', text: ' ' },
            { type: 'status', attrs: { text: 'In progress', color: 'blue' } },
            { type: 'text', text: ' ' },
            { type: 'date', attrs: { timestamp: '1788393600000' } },
          ],
        },
        {
          type: 'layoutSection',
          content: [
            {
              type: 'layoutColumn',
              attrs: { width: 50 },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Left column' }],
                },
              ],
            },
            {
              type: 'layoutColumn',
              attrs: { width: 50 },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Right column' }],
                },
              ],
            },
          ],
        },
        {
          type: 'decisionList',
          attrs: { localId: 'decision-list' },
          content: [
            {
              type: 'decisionItem',
              attrs: { localId: 'decision-1', state: 'DECIDED' },
              content: [{ type: 'text', text: 'First decision' }],
            },
            {
              type: 'decisionItem',
              attrs: { localId: 'decision-2', state: 'DECIDED' },
              content: [{ type: 'text', text: 'Second decision' }],
            },
          ],
        },
      ],
    });

    const result = renderMarkdown({
      document,
      assetsById: new Map(),
      locale: 'en',
    });
    const markdown = new TextDecoder().decode(result.bytes);

    expect(markdown).toBe(
      '😀 :custom: `In progress` `Sep 3, 2026`\n\n' +
        'Left column\n\nRight column\n\n' +
        '- First decision\n- Second decision\n',
    );
    expect(result.lossyNodeCount).toBe(0);
  });

  it('matches the Chinese Notera date display inside inline code', () => {
    const document = asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'date', attrs: { timestamp: '1788393600000' } }],
        },
      ],
    });

    const result = renderMarkdown({
      document,
      assetsById: new Map(),
      locale: 'zh-CN',
    });

    expect(new TextDecoder().decode(result.bytes)).toBe('`2026年9月3日`\n');
    expect(result.lossyNodeCount).toBe(0);
  });

  it('keeps nested action items and ordered lists nested in GitHub Markdown', () => {
    const taskItem = (text: string) => ({
      type: 'taskItem',
      attrs: { localId: `task-${text}`, state: 'TODO' },
      content: [{ type: 'text', text }],
    });
    const paragraph = (text: string) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    });
    const listItem = (text: string, nested?: unknown) => ({
      type: 'listItem',
      content: [paragraph(text), ...(nested === undefined ? [] : [nested])],
    });
    const document = asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'taskList',
          attrs: { localId: 'tasks-root' },
          content: [
            taskItem('123'),
            taskItem('9999'),
            {
              type: 'taskList',
              attrs: { localId: 'tasks-level-2' },
              content: [
                taskItem('8888'),
                {
                  type: 'taskList',
                  attrs: { localId: 'tasks-level-3' },
                  content: [taskItem('7777')],
                },
              ],
            },
            taskItem('456'),
          ],
        },
        {
          type: 'orderedList',
          content: [
            listItem('123'),
            listItem('2', {
              type: 'orderedList',
              content: [
                listItem('3'),
                listItem('4', {
                  type: 'orderedList',
                  content: [listItem('5'), listItem('666')],
                }),
              ],
            }),
            listItem('6'),
            listItem('7'),
          ],
        },
      ],
    });

    const result = renderMarkdown({
      document,
      assetsById: new Map(),
      locale: 'en',
    });
    const markdown = new TextDecoder().decode(result.bytes);

    expect(markdown).toContain(
      '- [ ] 123\n' +
        '- [ ] 9999\n' +
        '    - [ ] 8888\n' +
        '        - [ ] 7777\n' +
        '- [ ] 456',
    );
    expect(markdown).toContain(
      '1. 123\n' +
        '2. 2\n' +
        '    1. 3\n' +
        '    2. 4\n' +
        '        1. 5\n' +
        '        2. 666\n' +
        '3. 6\n' +
        '4. 7',
    );
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

    const result = renderMarkdown({
      document,
      assetsById: new Map(),
      locale: 'en',
    });
    const markdown = new TextDecoder().decode(result.bytes);

    expect(markdown).toContain('[不支持的内容：unsupportedWidget]');
    expect(markdown).toContain('[不支持的内容：media]');
    expect(markdown).not.toContain('<script>');
    expect(result.lossyNodeCount).toBe(2);
  });
});
