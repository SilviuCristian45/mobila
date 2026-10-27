// Construiește harness-ul de test pentru stocare (NU face parte din aplicație): un bundle mic care expune
// gestionarul de proiecte real (Dexie + Web Locks din browser) pe `window.rc`, ca să fie testat în browsere reale.
import { resolve } from 'node:path';
import { build } from 'vite';

await build({
  root: resolve('e2e-storage/harness'),
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: { '@': resolve('src') } },
  build: {
    outDir: resolve('e2e-storage/harness-dist'),
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
  },
});
console.log('harness construit în e2e-storage/harness-dist');
