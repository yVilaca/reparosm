import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    '.netlify/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.claude/**',
    '.cursor/**',
    'graft/**',
  ]),
  // Legacy code predates these rules; back to 'error' once app/page.tsx is split and typed.
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);

export default eslintConfig;
