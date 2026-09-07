import fs from 'fs';
import path from 'path';

describe('ResizableNavigation styles', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../ResizableNavigation.css'),
    'utf8',
  );

  it('keeps the ADS side-nav splitter visible after editor styles load', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*48rem\)\s*\{\s*\[data-testid='notera-side-nav-splitter-container'\]\[class\]\s*\{\s*display:\s*block;/su,
    );
  });
});
