/**
 * Base webpack config used across other specific configs
 */

import webpack from 'webpack';
import TsconfigPathsPlugins from 'tsconfig-paths-webpack-plugin';
import webpackPaths from './webpack.paths';
import { dependencies as externals } from '../../release/app/package.json';

const configuration: webpack.Configuration = {
  externals: [...Object.keys(externals || {})],

  stats: 'errors-only',

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
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
    modules: [webpackPaths.srcPath, webpackPaths.packagesPath, 'node_modules'],
    // There is no need to add aliases here, the paths in tsconfig get mirrored
    plugins: [new TsconfigPathsPlugins()],
  },

  plugins: [new webpack.EnvironmentPlugin({ NODE_ENV: 'production' })],
};

export default configuration;
