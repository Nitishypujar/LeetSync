import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**'] },
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      globals: {
        AbortSignal: 'readonly',
        chrome: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        TextEncoder: 'readonly',
        HTMLAnchorElement: 'readonly',
        XMLHttpRequest: 'readonly',
        location: 'readonly',
        URL: 'readonly',
        window: 'readonly',
      },
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
