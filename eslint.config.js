import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default tseslint.config(
  { ignores: ['dist/', '.astro/', 'node_modules/', 'data/', 'drizzle/', '.e2e-data/', 'test-results/', 'playwright-report/'] },
  ...tseslint.configs.strict,
  ...astro.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
