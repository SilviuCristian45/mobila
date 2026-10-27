/** Spike Etapa 0: export static + trailingSlash + basePath optional (ARCHITECTURE I4/I7). */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: process.env.SPIKE_TRAILING !== '0',
  images: { unoptimized: true },
  ...(process.env.SPIKE_DIST ? { distDir: process.env.SPIKE_DIST } : {}),
  ...(basePath ? { basePath } : {}),
};
export default nextConfig;
