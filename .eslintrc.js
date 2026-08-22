module.exports = {
  extends: 'erb',
  plugins: ['@typescript-eslint'],
  rules: {
    // A temporary hack related to IDE not resolving correct package.json
    'import/no-extraneous-dependencies': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-import-module-exports': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  overrides: [
    {
      files: ['packages/storage-sqlcipher/src/**/*.ts'],
      rules: {
        'class-methods-use-this': 'off',
        'import/prefer-default-export': 'off',
        'max-classes-per-file': 'off',
        'no-continue': 'off',
        'no-empty-function': 'off',
        'no-restricted-syntax': 'off',
        'no-use-before-define': 'off',
        'no-useless-constructor': 'off',
      },
    },
    {
      files: ['packages/storage-sqlcipher/src/__tests__/**/*.ts'],
      rules: {
        'global-require': 'off',
        'jest/expect-expect': 'off',
        'jest/no-conditional-expect': 'off',
        'no-nested-ternary': 'off',
      },
    },
    {
      files: ['packages/domain/src/adf.ts', 'src/shared/ipc/adf.ts'],
      rules: {
        'no-continue': 'off',
        'no-loop-func': 'off',
      },
    },
  ],
  settings: {
    'import/resolver': {
      // See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
      webpack: {
        config: require.resolve('./.erb/configs/webpack.config.eslint.ts'),
      },
      typescript: {},
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
};
