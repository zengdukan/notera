import { renderKatex, validateLatex } from './katex';

describe('KaTeX rendering', () => {
  it('renders accessible HTML and MathML', () => {
    const result = renderKatex('E = mc^2', 'inline');

    expect(result.error).toBeNull();
    expect(result.html).toContain('katex-mathml');
    expect(result.html).toContain('katex-html');
  });

  it('strictly rejects empty and invalid editor input', () => {
    expect(validateLatex('   ', 'inline')).toBe('Enter a LaTeX expression');
    expect(
      validateLatex('\\definitelyUnknownCommand{x}', 'block'),
    ).not.toBeNull();
  });

  it('keeps the reader resilient to invalid stored data', () => {
    const result = renderKatex('\\definitelyUnknownCommand{x}', 'block');

    expect(result.error).toBeNull();
    expect(result.html).toContain('katex');
    expect(result.html).toContain('definitelyUnknownCommand');
  });
});
