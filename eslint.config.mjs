import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// src/domain/ este TypeScript pur: fără React, UI, API-uri de browser sau de platformă (docs/ARCHITECTURE.md §3).
// Complementar regulilor dependency-cruiser, care văd doar importurile, nu variabilele globale.
const PLATFORM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'location',
  'history',
  'fetch',
  'XMLHttpRequest',
  'Blob',
  'File',
  'FileReader',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
  'structuredClone',
  'crypto',
  'performance',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'process',
  'Buffer',
  'require',
  '__dirname',
  '__filename',
  'globalThis',
].map((name) => ({
  name,
  message: 'Domeniul este pur: fără API-uri de browser/platformă. Primește valorile din exterior.',
}));

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...PLATFORM_GLOBALS],
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'Domeniul nu citește ceasul; `now` vine din exterior.',
        },
        {
          object: 'Math',
          property: 'random',
          message: 'Domeniul este determinist; ID-urile vin din exterior.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Domeniul nu creează date din ceas; `now` vine din exterior.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'next', 'next/*'],
              message: 'Domeniul nu depinde de React/Next.',
            },
            {
              group: ['konva', 'react-konva', 'three', 'three/*', '@react-three/*', 'dexie'],
              message: 'Domeniul nu depinde de biblioteci de UI/stocare.',
            },
            {
              group: ['node:*', 'fs', 'path', 'os', 'child_process'],
              message: 'Domeniul nu depinde de API-uri Node.',
            },
            {
              group: ['@/features/*', '@/app/*', '@/lib/*', '@/state/*', '@/persistence/*'],
              message: 'Domeniul nu depinde de straturile superioare.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'out-base/**',
    'e2e-storage/harness-dist/**',
    'spikes/**',
    'tests/fixtures/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
]);
