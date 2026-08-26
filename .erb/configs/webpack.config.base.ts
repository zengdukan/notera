/**
 * Base webpack config used across other specific configs
 */

import path from 'path';
import webpack from 'webpack';
import TsconfigPathsPlugins from 'tsconfig-paths-webpack-plugin';
import webpackPaths from './webpack.paths';
import { dependencies as externals } from '../../release/app/package.json';

const configuration: webpack.Configuration = {
  externals: [...Object.keys(externals || {})],

  stats: 'errors-only',

  ignoreWarnings: [
    {
      module:
        /[\\/]node_modules[\\/]@atlaskit[\\/](?:editor-common[\\/]dist[\\/]esm[\\/]quick-insert[\\/]assets[\\/]index|give-kudos[\\/]dist[\\/]esm[\\/]common[\\/]utils[\\/]fetch-messages-for-locale|link-datasource[\\/]dist[\\/]esm[\\/]common[\\/]utils[\\/]locale[\\/]fetch-messages-for-locale)\.js$/,
      message:
        /^Critical dependency: the request of a dependency is an expression$/,
    },
  ],

  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        include: [webpackPaths.srcPath, webpackPaths.packagesPath],
        use: [
          {
            loader: 'babel-loader',
            options: {
              babelrc: false,
              configFile: false,
            },
          },
          {
            loader: 'ts-loader',
            options: {
              // Remove this line to enable type checking in webpack builds
              transpileOnly: true,
              compilerOptions: {
                module: 'nodenext',
                moduleResolution: 'nodenext',
              },
            },
          },
          {
            // Webpack applies loaders right-to-left, so Compiled sees TSX before
            // ts-loader lowers JSX and Babel receives plain JavaScript last.
            loader: '@compiled/webpack-loader',
            options: {
              importSources: ['@atlaskit/css'],
            },
          },
        ],
      },
    ],
  },

  output: {
    path: webpackPaths.srcPath,
    // https://github.com/webpack/webpack/issues/1114
    library: { type: 'commonjs2' },
  },

  /**
   * Determine the array of extensions that should be used to resolve modules.
   */
  resolve: {
    alias: {
      '@atlaskit/embedded-confluence/page': path.join(
        webpackPaths.srcRendererPath,
        'export/shims/embedded-confluence-page.tsx',
      ),
    },
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
    modules: [webpackPaths.srcPath, webpackPaths.packagesPath, 'node_modules'],
    // Mirror the remaining path mappings declared in tsconfig.
    plugins: [new TsconfigPathsPlugins()],
  },

  plugins: [new webpack.EnvironmentPlugin({ NODE_ENV: 'production' })],
};

export default configuration;
