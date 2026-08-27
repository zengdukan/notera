import { localVersionName } from '../local-version-name';

describe('localVersionName', () => {
  it('formats the injected local date as YYYY-MM-DD HH:mm:ss', () => {
    expect(localVersionName(new Date(2026, 7, 27, 4, 5, 6))).toBe(
      '2026-08-27 04:05:06',
    );
  });
});
