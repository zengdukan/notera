import { readFileSync } from 'node:fs';
import path from 'node:path';
import type webpack from 'webpack';

import baseConfig from '../../.erb/configs/webpack.config.base';

type LoaderEntry = {
  loader?: string;
  options?: Record<string, unknown>;
};

type WarningMatcher = {
  module?: RegExp;
  message?: RegExp;
};

function getLoaderName(entry: string | LoaderEntry): string | undefined {
  return typeof entry === 'string' ? entry : entry.loader;
}

function ignoresWarning(moduleName: string, message: string): boolean {
  return (baseConfig.ignoreWarnings ?? []).some((warning) => {
    if (warning instanceof RegExp || typeof warning === 'function') {
      return false;
    }

    const matcher = warning as WarningMatcher;
    return (
      (matcher.module?.test(moduleName) ?? true) &&
      (matcher.message?.test(message) ?? true)
    );
  });
}

describe('Compiled webpack configuration', () => {
  it.each([
    'webpack.config.renderer.dev.ts',
    'webpack.config.renderer.dev.dll.ts',
    'webpack.config.renderer.prod.ts',
  ])('replaces the Node process environment in %s', (configName) => {
    const configSource = readFileSync(
      path.join(process.cwd(), '.erb', 'configs', configName),
      'utf8',
    );

    expect(configSource).toContain("'process.env': JSON.stringify({}),");
  });

  it('shares the embedded Confluence shim with every renderer build', () => {
    expect(baseConfig.resolve?.alias).toEqual(
      expect.objectContaining({
        '@atlaskit/embedded-confluence/page': path.join(
          process.cwd(),
          'src',
          'renderer',
          'export',
          'shims',
          'embedded-confluence-page.tsx',
        ),
      }),
    );
  });

  it('transforms Atlaskit CSS before TypeScript and Babel processing', () => {
    const scriptRule = baseConfig.module?.rules?.find((rule) => {
      if (rule === null || typeof rule !== 'object' || !('test' in rule)) {
        return false;
      }

      return rule.test instanceof RegExp && rule.test.test('component.tsx');
    }) as webpack.RuleSetRule | undefined;
    const loaders = scriptRule?.use;

    expect(Array.isArray(loaders)).toBe(true);
    if (!Array.isArray(loaders)) {
      return;
    }

    const loaderEntries = loaders as Array<string | LoaderEntry>;

    expect(loaderEntries.map(getLoaderName)).toEqual([
      'babel-loader',
      'ts-loader',
      '@compiled/webpack-loader',
    ]);

    const compiledLoader = loaderEntries.find(
      (entry) => getLoaderName(entry) === '@compiled/webpack-loader',
    ) as LoaderEntry | undefined;

    expect(compiledLoader?.options?.importSources).toEqual(['@atlaskit/css']);
  });
});

describe('Webpack warning filters', () => {
  const dynamicDependencyWarning =
    'Critical dependency: the request of a dependency is an expression';

  it.each([
    './node_modules/@atlaskit/give-kudos/dist/esm/common/utils/fetch-messages-for-locale.js',
    './node_modules/@atlaskit/link-datasource/dist/esm/common/utils/locale/fetch-messages-for-locale.js',
  ])('ignores the known dynamic import warning from %s', (moduleName) => {
    expect(ignoresWarning(moduleName, dynamicDependencyWarning)).toBe(true);
  });

  it('keeps dynamic dependency warnings from unrelated modules', () => {
    expect(
      ignoresWarning(
        './node_modules/express/lib/view.js',
        dynamicDependencyWarning,
      ),
    ).toBe(false);
  });

  it('keeps dynamic dependency warnings from the patched heading assets', () => {
    expect(
      ignoresWarning(
        './node_modules/@atlaskit/editor-common/dist/esm/quick-insert/assets/index.js',
        dynamicDependencyWarning,
      ),
    ).toBe(false);
  });

  it('keeps other warnings from the known Atlaskit modules', () => {
    expect(
      ignoresWarning(
        './node_modules/@atlaskit/editor-common/dist/esm/quick-insert/assets/index.js',
        'Module parse failed',
      ),
    ).toBe(false);
  });
});
