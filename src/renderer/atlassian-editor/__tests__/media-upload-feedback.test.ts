import { formatMediaUploadLimit } from '../media-upload-feedback';

describe('formatMediaUploadLimit', () => {
  it.each([
    [512 * 1024, '512 KB'],
    [1024 * 1024, '1 MB'],
    [500 * 1024 * 1024, '500 MB'],
    [1024 * 1024 * 1024, '1 GB'],
    [2.5 * 1024 * 1024 * 1024, '2.5 GB'],
  ])('formats %d bytes as %s', (limitBytes, expected) => {
    expect(formatMediaUploadLimit(limitBytes)).toBe(expected);
  });
});
