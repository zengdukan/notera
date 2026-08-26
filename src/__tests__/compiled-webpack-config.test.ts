import type webpack from 'webpack';

import baseConfig from '../../.erb/configs/webpack.config.base';

type LoaderEntry = {
  loader?: string;
  options?: Record<string, unknown>;
};

function getLoaderName(entry: string | LoaderEntry): string | undefined {
  return typeof entry === 'string' ? entry : entry.loader;
}

describe('Compiled webpack configuration', () => {
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
