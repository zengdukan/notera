import { formatRecentTimestamp } from '../recent-format';

describe('formatRecentTimestamp', () => {
  const now = new Date(2026, 8, 1, 18, 0).getTime();

  it.each([
    [new Date(2026, 8, 1, 14, 32).getTime(), '今天 14:32'],
    [new Date(2026, 7, 31, 20, 18).getTime(), '昨天 20:18'],
    [new Date(2026, 7, 30, 9, 45).getTime(), '8月30日 09:45'],
  ])('formats %s against the approved recent-date labels', (value, label) => {
    expect(formatRecentTimestamp(value, now)).toBe(label);
  });
});
