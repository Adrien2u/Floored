import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        // Config files and build scripts sit outside tsconfig's `include`, so
        // the project service needs explicit permission to type them.
        projectService: {
          allowDefaultProject: ['*.js', '*.ts', 'scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      // Numbers in template literals are safe and constant in this codebase
      // (dimensions, counts). Everything else still requires an explicit cast.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Build config and CI scripts run in Node, outside the app's TS project.
    // Type-aware rules have no type information here and only produce noise.
    files: ['*.config.js', '*.config.ts', 'scripts/**/*.mjs'],
    extends: [ts.configs.disableTypeChecked],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'playwright-report/', 'test-results/'],
  }
);
