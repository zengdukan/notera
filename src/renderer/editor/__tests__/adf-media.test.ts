import { collectAdfMediaIds } from '../adf-media';

describe('ADF media IDs', () => {
  it('collects unique string IDs from nested media nodes only', () => {
    expect(
      collectAdfMediaIds({
        type: 'doc',
        version: 1,
        content: [
          { type: 'media', attrs: { id: 'first' } },
          {
            type: 'mediaSingle',
            content: [
              { type: 'media', attrs: { id: 'second' } },
              { type: 'media', attrs: { id: 'first' } },
            ],
          },
          { type: 'paragraph', attrs: { id: 'not-media' } },
          { type: 'media', attrs: { id: 42 } },
        ],
      }),
    ).toEqual(['first', 'second']);
  });
});
