import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Export static (D1). `trailingSlash` și `basePath` validate în Etapa 0 (ARCHITECTURE §13: I4, I7).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
  // Director de ieșire alternativ (build cu basePath în paralel cu cel de la rădăcină).
  ...(process.env.RC_DIST_DIR ? { distDir: process.env.RC_DIST_DIR } : {}),
};

export default nextConfig;
