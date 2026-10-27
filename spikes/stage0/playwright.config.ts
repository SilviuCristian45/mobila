import { defineConfig } from '@playwright/test';

const port = Number(process.env.SPIKE_PORT ?? 4173);
const prefix = process.env.SPIKE_PREFIX ?? '';
const dir = process.env.SPIKE_DIR ?? 'out';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}${prefix}/` },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: { command: `node scripts/serve-static.mjs ${dir} ${port} ${prefix}`, port, reuseExistingServer: false },
});
