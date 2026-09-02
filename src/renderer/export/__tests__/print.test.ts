import fs from 'node:fs';
import path from 'node:path';

describe('PDF print styles', () => {
  it('disables sticky table positioning and constrains tables to the page', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../print.css'),
      'utf8',
    );

    expect(css).toContain('[data-testid="sticky-table-fixed"]');
    expect(css).toMatch(
      /\.pm-table-container\s*\{[^}]*width:\s*100%\s*!important/su,
    );
    expect(css).toMatch(
      /\.pm-table-wrapper\s*>\s*table\s*\{[^}]*table-layout:\s*fixed\s*!important/su,
    );
    expect(css).toMatch(
      /\.sticky\s*>\s*th,[^}]*position:\s*static\s*!important/su,
    );
  });
});
