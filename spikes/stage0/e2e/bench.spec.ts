import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// INDICATIV: Chromium headless cu randare software (fără GPU) — NU reprezintă hardware-ul țintă.
const spike = <T,>(page: Page, expr: string): Promise<T> => page.evaluate(`(async () => { const s = window.__spike; return await (${expr}); })()`) as Promise<T>;

test('benchmark indicativ: 20 camere / 300 obiecte (chromium software GL)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'doar chromium');
  await page.goto('./editor/?p=big'); await page.waitForFunction('window.__spike && window.__spike.getDoc');
  await spike(page, 's.loadBig()');
  await page.waitForFunction('window.__spike.stats2d && window.__spike.stats2d() && window.__spike.stats2d().shapes > 400');
  const fps2d = await page.evaluate(async () => {
    const s = (window as any).__spike; let frames = 0; const t0 = performance.now(); let i = 0;
    await new Promise<void>((res) => { const step = () => { s.setViewport(0.03 + (i % 10) * 0.0005, 20 + i, 20 + i); i++; frames++; if (performance.now() - t0 > 2000) res(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
    return { frames, seconds: (performance.now() - t0) / 1000 };
  });
  const shapes = (await spike<{ shapes: number }>(page, 's.stats2d()')).shapes;
  await spike(page, 's.show3d(true)');
  await page.waitForFunction('window.__spike.stats3d && window.__spike.stats3d()', undefined, { timeout: 20000 });
  const r3 = await page.evaluate(() => { const s = (window as any).__spike; const t0 = performance.now(); for (let i = 0; i < 20; i++) s.topView3d(); return (performance.now() - t0) / 20; });
  const st3 = await spike<{ meshes: number; geometries: number }>(page, 's.stats3d()');
  const result = { shapes2d: shapes, fps2d: +(fps2d.frames / fps2d.seconds).toFixed(1), msPerGlRender: +r3.toFixed(1), meshes3d: st3.meshes, geometries3d: st3.geometries };
  console.log('[bench]', JSON.stringify(result));
  writeFileSync('reports/bench-browser.json', JSON.stringify(result, null, 2));
  expect(st3.meshes).toBeGreaterThan(300);
});
