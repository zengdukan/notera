import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

describe('Compiled dependency resolution', () => {
  it('keeps the build transformer compatible with the Atlaskit runtime', () => {
    const projectRequire = createRequire(`${process.cwd()}/package.json`);
    const babelPlugin = projectRequire(
      '@compiled/babel-plugin/package.json',
    ) as {
      peerDependencies: Record<string, string>;
      version: string;
    };
    const webpackLoader = projectRequire(
      '@compiled/webpack-loader/package.json',
    ) as { version: string };
    const compiledRuntime = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          'node_modules',
          '@compiled',
          'react',
          'package.json',
        ),
        'utf8',
      ),
    ) as { version: string };

    expect(babelPlugin.version).toBe('2.0.0');
    expect(webpackLoader.version).toBe('1.1.0');
    expect(babelPlugin.peerDependencies['@compiled/react']).toBe('>=1.0.0');
    expect(compiledRuntime.version).toMatch(/^1\./);
  });
});
