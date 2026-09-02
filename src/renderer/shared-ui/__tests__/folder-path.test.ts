import { formatFolderPath } from '../folder-path';

describe('formatFolderPath', () => {
  it.each([
    ['an unnamed root', [{ name: '' }]],
    ['a root named by a legacy response', [{ name: 'Root' }]],
  ])('formats %s as /', (_description, path) => {
    expect(formatFolderPath(path)).toBe('/');
  });

  it('uses / as the root of a nested path', () => {
    expect(
      formatFolderPath([{ name: 'Root' }, { name: 'today' }, { name: '经济' }]),
    ).toBe('/ today / 经济');
  });
});
