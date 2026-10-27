import { expect, test, type Page } from '@playwright/test';

const prefix = process.env.SPIKE_PREFIX ?? '';
const errorsOf = (page: Page) => {
  const errs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errs.push(`http ${r.status()}: ${r.url()}`); });
  return errs;
};
const spike = <T,>(page: Page, expr: string): Promise<T> => page.evaluate(`(async () => { const s = window.__spike; return await (${expr}); })()`) as Promise<T>;
const trail = process.env.SPIKE_TRAILING === '0' ? '' : '/';
const open = async (page: Page, p = 'demo') => { await page.goto(`./editor${trail}?p=${p}`); await page.waitForSelector('[data-testid=editor]'); await page.waitForFunction('window.__spike && window.__spike.getDoc'); };

test.describe('I1/I3/I7 — rute, Suspense, reîncărcare directă', () => {
  test('pagina de start se încarcă fără Konva/Three/Dexie', async ({ page }) => {
    const reqs: string[] = []; page.on('request', (r) => reqs.push(r.url()));
    const errs = errorsOf(page);
    await page.goto('./');
    await expect(page.getByTestId('home-title')).toBeVisible();
    // Tailwind aplicat (culoare teal-700 ≠ negru)
    const color = await page.getByTestId('home-title').evaluate((e) => getComputedStyle(e).color);
    expect(color).not.toBe('rgb(0, 0, 0)');
    const js = reqs.filter((u) => u.endsWith('.js'));
    const bytes = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.js')).reduce((a, e) => a + ((e as PerformanceResourceTiming).transferSize || (e as PerformanceResourceTiming).encodedBodySize || 0), 0));
    console.log(`[home] ${js.length} fișiere JS, ~${(bytes / 1024).toFixed(0)} KiB`);
    expect(errs).toEqual([]);
  });

  test('link intern către editor + încărcare directă cu query + reîncărcare', async ({ page }) => {
    const errs = errorsOf(page);
    await page.goto('./'); await page.getByTestId('to-editor').click();
    await page.waitForSelector('[data-testid=editor]');
    expect(page.url()).toMatch(/\/editor\/?\?p=demo/);
    await page.reload(); await page.waitForSelector('[data-testid=editor]');
    await expect(page.getByTestId('title')).toContainText('(demo)');
    await open(page, 'alt-id');
    await expect(page.getByTestId('title')).toContainText('(alt-id)');
    expect(errs).toEqual([]);
  });

  test('/editor?p=x (fără slash) → redirect gazdă → aceeași pagină', async ({ page }) => {
    await page.goto('./editor?p=zz'); await page.waitForSelector('[data-testid=editor]');
    await expect(page.getByTestId('title')).toContainText('(zz)');
  });

  test('rută inexistentă → 404', async ({ page }) => {
    const r = await page.goto('./nu-exista/');
    expect(r?.status()).toBe(404);
  });
});

test.describe('I2 — acces browser-only, Konva 2D, Dexie', () => {
  test('editorul 2D desenează și proiectul se creează în IndexedDB', async ({ page }) => {
    const errs = errorsOf(page);
    await open(page);
    await page.waitForFunction('window.__spike.stats2d && window.__spike.stats2d()');
    const st = await spike<{ shapes: number; paintedRatio: number }>(page, 's.stats2d()');
    console.log('[2d]', JSON.stringify(st));
    expect(st.shapes).toBe(19); expect(st.paintedRatio).toBeGreaterThan(0.1);
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(dbs).toContain('roomcraft');
    expect(errs).toEqual([]);
  });

  test('numere formatate ro-RO identice cu așteptarea, fără erori de hidratare', async ({ page }) => {
    const errs = errorsOf(page);
    await open(page);
    expect(await spike<string>(page, 's.fmt()')).toBe('1.234.567,89');
    await expect(page.getByTestId('total')).toContainText('4.567,08');
    expect(errs.filter((e) => /hydrat/i.test(e))).toEqual([]);
  });
});

test.describe('persistență + undo/redo + autosave în browser real', () => {
  test('mută nod → autosave → reîncărcare păstrează; undo → reîncărcare păstrează', async ({ page }) => {
    await open(page, 'persist');
    const x0 = await spike<number>(page, 's.getDoc().nodes.n3.x');
    await spike(page, 's.moveNode("n3", 4200, 3000)');
    await expect(page.getByTestId('status')).toHaveText('dirty');
    await expect(page.getByTestId('status')).toHaveText('saved', { timeout: 5000 }); // debounce 800 ms
    await page.reload(); await page.waitForFunction('window.__spike && window.__spike.getDoc');
    expect(await spike<number>(page, 's.getDoc().nodes.n3.x')).toBe(4200);
    expect((await spike<{ past: number }>(page, 's.status()')).past).toBe(0); // istoricul nu se persistă
    await spike(page, 's.moveNode("n3", 4300, 3000)'); await spike(page, 's.undo()'); await spike(page, 's.flush()');
    await page.reload(); await page.waitForFunction('window.__spike && window.__spike.getDoc');
    expect(await spike<number>(page, 's.getDoc().nodes.n3.x')).toBe(4200);
    expect(x0).toBe(4000);
  });

  test('două taburi pe același proiect: al doilea scriitor primește conflict, nu suprascrie', async ({ page, context }) => {
    await open(page, 'twotabs');
    const p2 = await context.newPage(); await open(p2, 'twotabs');
    await spike(page, 's.moveNode("n1", -200, 0)'); await spike(page, 's.flush()');
    await spike(p2, 's.moveNode("n1", -300, 0)'); await spike(p2, 's.flush()');
    expect((await spike<{ status: string }>(p2, 's.status()')).status).toBe('conflict');
    expect((await spike<{ status: string }>(page, 's.status()')).status).toBe('saved');
    await p2.reload(); await p2.waitForFunction('window.__spike && window.__spike.getDoc');
    expect(await spike<number>(p2, 's.getDoc().nodes.n1.x')).toBe(-200); // scrisul primului tab a rămas
  });

  test('pagehide forțează salvarea (fără a aștepta debounce)', async ({ page, context }) => {
    await open(page, 'hide');
    await spike(page, 's.moveNode("n1", -100, 0)');
    const p2 = await context.newPage();
    await p2.goto('about:blank');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(300);
    await page.reload(); await page.waitForFunction('window.__spike && window.__spike.getDoc');
    expect(await spike<number>(page, 's.getDoc().nodes.n1.x')).toBe(-100);
  });

  test('trageți un nod pe canvas → 1 pas de undo', async ({ page }) => {
    await open(page, 'drag');
    await page.waitForFunction('window.__spike.stats2d && window.__spike.stats2d()');
    const box = (await page.getByTestId('stage2d').boundingBox())!;
    const sc = (await spike<{ scale: number }>(page, 's.stats2d()')).scale;
    // nodul n3 (4000,3000) în ecran: x = -minX*fit... folosim transformarea Konva prin hook: scale + poziție inițială
    const tr = await page.evaluate('(() => { const d = window.__spike.getDoc(); const xs=Object.values(d.nodes).map(n=>n.x), ys=Object.values(d.nodes).map(n=>n.y); return {minX: Math.min(...xs)-500, minY: Math.min(...ys)-500}; })()') as { minX: number; minY: number };
    const sx = box.x + (4000 - tr.minX) * sc, sy = box.y + (3000 - tr.minY) * sc;
    await page.mouse.move(sx, sy); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(sx + i * 3, sy + i * 2);
    await page.mouse.up();
    await expect.poll(async () => (await spike<{ past: number }>(page, 's.status()')).past).toBe(1);
    const n = await spike<{ x: number; y: number }>(page, 's.getDoc().nodes.n3');
    expect(n.x).toBeGreaterThan(4000); expect(n.x % 10).toBe(0); expect(n.y % 10).toBe(0);
    await spike(page, 's.undo()');
    expect(await spike<number>(page, 's.getDoc().nodes.n3.x')).toBe(4000);
  });
});

test.describe('3D — R3F', () => {
  test('scena 3D se randează, e nevidă, și corespunde 2D (sofa la poziția proiectată, nu oglindită)', async ({ page, browserName }) => {
    const errs = errorsOf(page);
    await open(page);
    await spike(page, 's.show3d(true)');
    await page.waitForFunction('window.__spike.stats3d && window.__spike.stats3d()', undefined, { timeout: 15000 }).catch(() => {});
    const st = await spike<{ meshes: number; geometries: number; paintedRatio: number } | null>(page, 's.stats3d()');
    console.log(`[3d:${browserName}]`, JSON.stringify(st));
    test.skip(!st, 'WebGL/R3F indisponibil în acest browser headless');
    expect(st!.meshes).toBeGreaterThanOrEqual(12 + 2 + 2); // 12 prisme + 2 podele + 2 obiecte
    expect(st!.paintedRatio).toBeGreaterThan(0.05);
    await spike(page, 's.setFlat(true)'); await page.waitForTimeout(300);
    await spike(page, 's.topView3d()');
    const sofa = await spike<{ r: number; g: number; b: number }>(page, 's.sample3d([1.2, 0.86, 2.4])'); // centrul canapelei (x=1200, y=2400)
    const mirrorX = await spike<{ r: number; g: number; b: number }>(page, 's.sample3d([5.8, 0.86, 2.4])');
    const mirrorZ = await spike<{ r: number; g: number; b: number }>(page, 's.sample3d([1.2, 0.86, 0.6])');
    console.log('[3d sofa]', JSON.stringify({ sofa, mirrorX, mirrorZ }));
    const near = (c: { r: number; g: number; b: number }) => Math.abs(c.r - 0x8a) < 12 && Math.abs(c.g - 0x9b) < 12 && Math.abs(c.b - 0xa8) < 12;
    expect(near(sofa)).toBe(true); expect(near(mirrorX)).toBe(false); expect(near(mirrorZ)).toBe(false);
    expect(errs.filter((e) => !/GPU stall|WebGL/i.test(e))).toEqual([]);
  });
});

test.describe('export/import în instalare curată', () => {
  test('export din instalarea A → import în contextul B (IndexedDB gol) → aceeași scenă și buget', async ({ page, browser }) => {
    await open(page, 'src');
    await spike(page, 's.moveNode("n3", 4200, 3000)'); await spike(page, 's.flush()');
    const text = await spike<string>(page, 's.exportText()');
    const hashA = await spike<string>(page, 's.sceneHash()'); const totalA = await spike<number>(page, 's.budgetTotal()');
    const ctxB = await browser.newContext({ baseURL: `http://localhost:${process.env.SPIKE_PORT ?? 4173}${prefix}/` });
    const pb = await ctxB.newPage();
    await open(pb, 'doar-pt-import'); // inițializează aplicația în context nou; proiectul „doar-pt-import” nu e cel importat
    const r = await spike<{ ok: boolean; id: string }>(pb, `s.importText(${JSON.stringify(text)})`);
    expect(r.ok).toBe(true);
    await open(pb, r.id);
    expect(await spike<string>(pb, 's.sceneHash()')).toBe(hashA);
    expect(await spike<number>(pb, 's.budgetTotal()')).toBe(totalA);
    expect(await spike<number>(pb, 's.getDoc().nodes.n3.x')).toBe(4200);
    // fișier corupt → respins, nimic scris
    const bad = await spike<{ ok: boolean; stage: string }>(pb, 's.importText("{")');
    expect(bad).toMatchObject({ ok: false, stage: 'parse' });
    const count = await pb.evaluate(async () => new Promise<number>((res) => { const rq = indexedDB.open('roomcraft'); rq.onsuccess = () => { const t = rq.result.transaction('projects'); const c = t.objectStore('projects').count(); c.onsuccess = () => res(c.result); }; }));
    expect(count).toBe(2); // doar-pt-import + importat
    await ctxB.close();
  });
});

test.describe('I4 — basePath', () => {
  test('resursele prin asset() merg; fetch naiv de la rădăcină nu merge sub prefix', async ({ page }) => {
    await open(page);
    const viaHelper = await spike<{ status: number }>(page, 's.fetchAsset()');
    const naive = await spike<{ status: number }>(page, 's.naiveFetch()');
    console.log(`[basePath='${prefix}'] helper=${viaHelper.status} naiv=${naive.status}`);
    expect(viaHelper.status).toBe(200);
    if (prefix) expect(naive.status).toBe(404); else expect(naive.status).toBe(200);
  });
});
