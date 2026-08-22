import {
  allocateUniqueName,
  sanitizeWindowsBaseName,
} from '../filenames';

describe('Windows export file names', () => {
  it('sanitizes invalid, reserved, blank and trailing characters', () => {
    expect(sanitizeWindowsBaseName('  项目<计划>.  ', '未命名笔记')).toBe(
      '项目_计划_',
    );
    expect(sanitizeWindowsBaseName('CON', '未命名笔记')).toBe('_CON');
    expect(sanitizeWindowsBaseName(' . ', '未命名笔记')).toBe('未命名笔记');
  });

  it('allocates case-insensitive suffixes before the extension', () => {
    const used = new Set(['report.pdf', 'report (2).pdf']);

    expect(allocateUniqueName('Report.pdf', used)).toBe('Report (3).pdf');
    expect(allocateUniqueName('photo', new Set())).toBe('photo');
  });

  it('keeps the final suffix inside the UTF-16 limit', () => {
    const requested = `${'a'.repeat(20)}.txt`;
    const used = new Set([requested.toLocaleLowerCase('en-US')]);

    expect(allocateUniqueName(requested, used, 24)).toBe(
      `${'a'.repeat(16)} (2).txt`,
    );
  });
});
