import {
  createMediaApiArgument,
  parseMediaApiArgument,
  mediaCollectionForNote,
  validateMediaApiBaseUrl,
} from '../media-runtime';

describe('Atlassian Editor Media runtime configuration', () => {
  it('round-trips a dynamic loopback API address through argv', () => {
    const address = 'http://127.0.0.1:43125/api/media';
    const argument = createMediaApiArgument(address);

    expect(argument).toBe(
      '--atlassian-editor-media-api-base-url=http://127.0.0.1:43125/api/media',
    );
    expect(parseMediaApiArgument(['electron', argument])).toBe(address);
  });

  it.each([
    'https://127.0.0.1:43125/api/media',
    'http://localhost:43125/api/media',
    'http://0.0.0.0:43125/api/media',
    'http://127.0.0.1/api/media',
    'http://user:password@127.0.0.1:43125/api/media',
    'http://127.0.0.1:43125/api/media?token=secret',
    'http://127.0.0.1:43125/api/media#fragment',
    'http://127.0.0.1:43125/other',
    'not a URL',
  ])('rejects unsafe Media API address %s', (value) => {
    expect(() => validateMediaApiBaseUrl(value)).toThrow(
      'Invalid Atlassian Editor Media API address.',
    );
  });

  it('rejects missing and duplicate runtime arguments', () => {
    const argument = createMediaApiArgument('http://127.0.0.1:43125/api/media');
    expect(() => parseMediaApiArgument(['electron'])).toThrow(
      'Missing Atlassian Editor Media API address.',
    );
    expect(() =>
      parseMediaApiArgument(['electron', argument, argument]),
    ).toThrow('Duplicate Atlassian Editor Media API address.');
  });

  it('derives one fixed collection from a validated note UUID', () => {
    expect(mediaCollectionForNote('20000000-0000-4000-8000-000000000001')).toBe(
      'notera-note-20000000-0000-4000-8000-000000000001',
    );
    expect(() => mediaCollectionForNote('../other-note')).toThrow(
      'Invalid Media note ID.',
    );
  });
});
