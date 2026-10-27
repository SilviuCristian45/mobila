import { defineConfig } from '@playwright/test';

// Rulează testele E2E pe build-ul static, servit de un server strict (fără rescrieri SPA).
// RC_DIR: directorul build-ului (out | out-base); RC_PREFIX: basePath (ex. /rc-test); RC_PORT: portul.
const port = Number(process.env.RC_PORT ?? 4173);
const prefix = process.env.RC_PREFIX ?? '';
const dir = process.env.RC_DIR ?? 'out';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: { baseURL: `http://localhost:${port}${prefix}/` },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: `node scripts/serve-static.mjs ${dir} ${port} ${prefix}`,
    port,
    reuseExistingServer: false,
  },
});
