import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    // testele porților pornesc ESLint/dependency-cruiser (lent la prima rulare, mai ales sub încărcare)
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['spikes/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts', 'src/state/**/*.ts', 'src/persistence/**/*.ts'],
      exclude: ['src/domain/index.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});
