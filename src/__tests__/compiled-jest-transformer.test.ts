import { readFileSync } from 'node:fs';
import path from 'node:path';

const transformer = require('../../.erb/jest/compiled-transformer.cjs') as {
  process: (
    sourceText: string,
    sourcePath: string,
    options: Record<string, unknown>,
  ) => string | { code: string };
};

describe('Compiled Jest transformer', () => {
  it('bakes cssMap calls before TypeScript lowers imports', () => {
    const source = readFileSync(
      'src/renderer/profile/ProfileAccessHeader.tsx',
      'utf8',
    );

    const sourcePath = path.resolve(
      'src/renderer/profile/ProfileAccessHeader.tsx',
    );
    const result = transformer.process(source, sourcePath, {
      config: {
        globals: {},
        rootDir: process.cwd(),
      },
      instrument: false,
      supportsStaticESM: false,
      cacheFS: new Map(),
    });
    const code = typeof result === 'string' ? result : result.code;

    expect(code).not.toMatch(/cssMap\s*\(/);
    expect(code).toMatch(/headerStyles\s*=\s*\{[\s\S]*root:\s*["'][^"']+["']/);
  });
});
