import { defineConfig } from '@playwright/test';

// Teste în browsere REALE (IndexedDB, Web Locks) ale stratului de persistență, prin harness-ul construit cu
// `pnpm e2e:storage:build`. Independent de aplicația Next (care nu folosește încă stocarea).
const port = Number(process.env.RC_STORAGE_PORT ?? 4174);

export default defineConfig({
  testDir: 'e2e-storage',
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: { baseURL: `http://localhost:${port}/` },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: `node scripts/serve-static.mjs e2e-storage/harness-dist ${port}`,
    port,
    reuseExistingServer: false,
  },
});
