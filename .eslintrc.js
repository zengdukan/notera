module.exports = {
  extends: ['erb', 'plugin:@atlaskit/design-system/recommended'],
  plugins: ['@typescript-eslint', '@atlaskit/design-system'],
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
        // The hidden PDF renderer deliberately emits native semantic markup;
        // ADS visual primitives would change the exported document structure.
        '@atlaskit/design-system/no-html-heading': 'off',
        '@atlaskit/design-system/no-html-image': 'off',
        '@atlaskit/design-system/use-heading': 'off',
        '@atlaskit/design-system/use-primitives-text': 'off',
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
    {
      files: [
        'src/renderer/atlassian-editor/**/*.ts',
        'src/renderer/atlassian-editor/**/*.tsx',
      ],
      env: {
        browser: true,
        es2022: true,
        jest: true,
      },
      rules: {
        // Preserve the standalone Atlaskit example's Emotion styling and
        // extension callback contracts instead of rewriting them to Notera UI
        // conventions during the port.
        '@atlaskit/design-system/consistent-css-prop-usage': 'off',
        '@atlaskit/design-system/no-nested-styles': 'off',
        '@atlaskit/design-system/no-unsafe-design-token-usage': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'class-methods-use-this': 'off',
        'consistent-return': 'off',
        'import/first': 'off',
        'import/newline-after-import': 'off',
        'import/prefer-default-export': 'off',
        'jsx-a11y/label-has-associated-control': 'off',
        'lines-between-class-members': 'off',
        'no-nested-ternary': 'off',
        'no-plusplus': 'off',
        'no-undef': 'off',
        'no-var': 'off',
        'no-void': 'off',
        'prefer-destructuring': 'off',
        'promise/always-return': 'off',
        'promise/catch-or-return': 'off',
        'react/destructuring-assignment': 'off',
        'react/jsx-props-no-spreading': 'off',
        'react/no-unknown-property': 'off',
        'react/no-unstable-nested-components': 'off',
        'react/require-default-props': 'off',
        'react/sort-comp': 'off',
        'vars-on-top': 'off',
      },
    },
    {
      files: ['src/main/demo-media/**/*.ts'],
      env: {
        node: true,
        es2022: true,
        jest: true,
      },
      rules: {
        // Chunk assembly and shutdown deliberately perform ordered async work.
        '@typescript-eslint/no-unused-vars': 'off',
        'import/prefer-default-export': 'off',
        'lines-between-class-members': 'off',
        'no-await-in-loop': 'off',
        'no-nested-ternary': 'off',
        'no-promise-executor-return': 'off',
        'no-restricted-syntax': 'off',
        'no-undef': 'off',
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
