import { asAdfDocument, type AdfDocument } from '@notera/domain';

import { collectAttachmentReferences } from '../adf-references';

const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';

describe('ADF attachment references', () => {
  it('collects valid media ids once in first-seen order', () => {
    const document = asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        { type: 'media', attrs: { id: first, type: 'file' } },
        {
          type: 'unknownWrapper',
          content: [
            { type: 'media', attrs: { id: second } },
            { type: 'media', attrs: { id: first } },
            { type: 'media', attrs: { id: 'invalid' } },
          ],
        },
      ],
    });

    expect(collectAttachmentReferences(document)).toEqual([first, second]);
  });

  it('uses an explicit stack for deeply nested JSON', () => {
    let node: Record<string, unknown> = {
      type: 'media',
      attrs: { id: first },
    };
    for (let depth = 0; depth < 10_000; depth += 1) {
      node = { type: 'wrapper', content: [node] };
    }
    const document = {
      type: 'doc' as const,
      version: 1 as const,
      content: [node],
    };

    expect(
      collectAttachmentReferences(document as unknown as AdfDocument),
    ).toEqual([first]);
  });
});
