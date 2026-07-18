const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*', 'node_modules/*'],
  },
  {
    // Scoped to TypeScript: the @typescript-eslint plugin is only registered by
    // eslint-config-expo for these files, and referencing its rules from a
    // config object that also matches plain JS fails to resolve the plugin.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Unused args are common in RN event handlers and delegate-style
      // signatures; allow the underscore convention instead of deleting them.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Jest globals. The `/* eslint-env */` comment form is not honored by flat
    // config, so they are declared here instead.
    files: ['jest.setup.js', '**/__tests__/**', '**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
]);
