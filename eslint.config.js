import { builtinModules } from 'node:module';

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const restrictedBuiltinImports = builtinModules
  .filter((name) => !name.startsWith('_') && !name.startsWith('node:'))
  .map((name) => ({
    name,
    message: `Use node:${name} instead of bare builtin imports.`,
  }));

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/coverage/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.bun,
        ...globals.mocha,
      },
    },
    rules: {
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-restricted-imports': ['error', { paths: restrictedBuiltinImports }],
    },
  },
]);
