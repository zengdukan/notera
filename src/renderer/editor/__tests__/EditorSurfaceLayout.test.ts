import fs from 'node:fs';
import path from 'node:path';

describe('EditorSurface paper layout', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, '../EditorSurface.css'),
    'utf8',
  );

  it('centers the A4 paper region instead of its overflowing content child', () => {
    expect(css).toMatch(
      /\.ak-editor-content-area-region\s*\{[^}]*flex-grow:\s*1;[^}]*flex-shrink:\s*0;[^}]*height:\s*auto;[^}]*width:\s*210mm;[^}]*min-width:\s*210mm;[^}]*margin-block:\s*0;[^}]*margin-inline:\s*auto;/su,
    );
    expect(css).toMatch(
      /\.ak-editor-content-area\s*\{[^}]*width:\s*100%;[^}]*margin:\s*0;/su,
    );
  });

  it('applies A3 width to the same centered paper region', () => {
    expect(css).toMatch(
      /\[data-page-size='A3'\][^{]*\.ak-editor-content-area-region\s*\{[^}]*width:\s*297mm;[^}]*min-width:\s*297mm;/su,
    );
  });

  it('fills the edit body so Atlaskit scrolls content below its toolbar', () => {
    expect(css).toMatch(
      /\[data-testid='note-editor-surface'\]\s*\{[^}]*height:\s*100%;[^}]*width:\s*100%;/su,
    );
    expect(css).toMatch(
      /\[data-testid='note-editor-surface'\]\s+\.akEditor\s*\{[^}]*height:\s*100%;[^}]*width:\s*100%;/su,
    );
  });

  it('prevents the horizontally scrollable toolbar from scrolling vertically', () => {
    expect(css).toMatch(
      /\[data-testid='ak-editor-main-toolbar'\]\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/su,
    );
  });

  it('keeps the paper wrapper content-sized so bottom padding remains scrollable', () => {
    expect(css).toMatch(
      /\[data-editor-click-wrapper='true'\]\s*\{[^}]*box-sizing:\s*border-box;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex-grow:\s*0;[^}]*flex-shrink:\s*0;[^}]*height:\s*auto;[^}]*min-height:\s*100%;[^}]*padding-block:\s*var\(--ds-space-300,\s*24px\);/su,
    );
    expect(css).toMatch(/#editor-scroll-gutter\s*\{[^}]*display:\s*none;/su);
  });

  it('uses distinct ADS surfaces for the editor canvas and paper', () => {
    expect(css).toMatch(
      /\[data-testid='note-editor-surface'\]\s*\{[^}]*background:\s*var\(--ds-surface-sunken,\s*#f8f8f8\);/su,
    );
    expect(css).toMatch(
      /\.ak-editor-content-area-region\s*\{[^}]*background:\s*var\(--ds-surface-raised,\s*#ffffff\);/su,
    );
  });

  it('uses the ADS overflow shadow around the editor paper', () => {
    expect(css).toMatch(
      /\.ak-editor-content-area-region\s*\{[^}]*box-shadow:\s*var\(\s*--ds-shadow-overflow,\s*0 0 8px #1e1f2128,\s*0 0 1px #1e1f211e\s*\);/su,
    );
  });
});
