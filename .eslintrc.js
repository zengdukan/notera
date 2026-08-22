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
      files: ['packages/attachments/src/**/*.ts'],
      rules: {
        'consistent-return': 'off',
        'import/prefer-default-export': 'off',
        'no-await-in-loop': 'off',
        'no-continue': 'off',
        'no-restricted-syntax': 'off',
        'no-void': 'off',
        'promise/always-return': 'off',
      },
    },
    {
      files: [
        'packages/attachments/src/__tests__/**/*.ts',
        'packages/crypto/src/__tests__/attachment-chunks.test.ts',
      ],
      rules: {
        'no-bitwise': 'off',
        'require-yield': 'off',
      },
    },
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
    {
      files: [
        'packages/export/src/**/*.ts',
        'src/main/export/**/*.ts',
        'src/main/ipc/export-handlers.ts',
      ],
      rules: {
        'import/prefer-default-export': 'off',
        'no-await-in-loop': 'off',
        'no-continue': 'off',
        'no-control-regex': 'off',
        'no-promise-executor-return': 'off',
        'no-restricted-syntax': 'off',
        'no-undef': 'off',
        'no-use-before-define': 'off',
        'require-yield': 'off',
      },
    },
    {
      files: ['src/renderer/export/**/*.ts', 'src/renderer/export/**/*.tsx'],
      env: {
        browser: true,
        es2022: true,
        jest: true,
      },
      rules: {
        'consistent-return': 'off',
        'func-names': 'off',
        'import/prefer-default-export': 'off',
        'no-continue': 'off',
        'no-promise-executor-return': 'off',
        'no-undef': 'off',
        'no-void': 'off',
        'promise/always-return': 'off',
        'react/destructuring-assignment': 'off',
        'react/function-component-definition': 'off',
        'react/no-danger': 'off',
        'react/require-default-props': 'off',
        'react/state-in-constructor': 'off',
      },
    },
    {
      files: ['src/__tests__/export-preload.test.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
    {
      files: ['src/main/export-preload.ts'],
      rules: {
        'no-use-before-define': 'off',
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
