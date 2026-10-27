import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Stratul de persistență în browsere REALE: IndexedDB (Dexie) și Web Locks. Bază de date separată per test.
const FIXTURE = readFileSync('tests/fixtures/v1/studio.roomcraft.json', 'utf8');
const uniqueDb = () => `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function harness(page: Page, db: string, extra = ''): Promise<void> {
  await page.goto(`./?db=${db}${extra}`);
  await page.waitForFunction(() => document.getElementById('ready')?.textContent === 'ready');
}
/** Evaluează o expresie asincronă cu `rc` (harness) în pagină. */
const rc = <T>(page: Page, expr: string): Promise<T> =>
  page.evaluate(`(async () => { const rc = window.rc; return await (${expr}); })()`) as Promise<T>;

interface St {
  status: string;
  revision: number;
  readOnly: boolean;
  lockLost: boolean;
  hasUnsavedChanges: boolean;
  historySize: number;
  sofaX: number;
  name: string;
  error: { kind: string; attempts: number } | null;
  conflict: { kind: string } | null;
}
const state = (page: Page) => rc<St>(page, 'rc.state()');
const importStudio = (page: Page) =>
  rc<{ ok: boolean }>(page, `rc.manager.importFile(${JSON.stringify(FIXTURE)})`);
const open = (page: Page, takeOver = false) =>
  rc<{ ok: boolean; error?: unknown }>(page, `rc.open('studio', ${takeOver})`);
const move = (page: Page, x: number) => rc<{ ok: boolean }>(page, `rc.moveSofa(${x})`);
const flush = (page: Page) => rc<void>(page, 'rc.session.flush()');

test('proiectul se salvează și se restaurează după reîncărcarea paginii (istoric gol, revizie păstrată)', async ({
  page,
}) => {
  const db = uniqueDb();
  await harness(page, db);
  expect((await importStudio(page)).ok).toBe(true);
  expect((await open(page)).ok).toBe(true);
  expect(await move(page, 1500)).toMatchObject({ ok: true });
  await flush(page);
  expect(await state(page)).toMatchObject({
    status: 'saved',
    revision: 2,
    sofaX: 1500,
    historySize: 1,
  });
  await page.reload();
  await page.waitForFunction(() => document.getElementById('ready')?.textContent === 'ready');
  expect((await open(page)).ok).toBe(true);
  expect(await state(page)).toMatchObject({
    status: 'saved',
    revision: 2,
    sofaX: 1500,
    historySize: 0,
  });
});

test('autosave real: fără flush explicit, după debounce starea trece din „dirty” în „saved”', async ({
  page,
}) => {
  const db = uniqueDb();
  await harness(page, db);
  await importStudio(page);
  await open(page);
  await move(page, 1600);
  expect((await state(page)).status).toBe('dirty');
  await expect.poll(async () => (await state(page)).status, { timeout: 8000 }).toBe('saved');
  await page.reload();
  await page.waitForFunction(() => document.getElementById('ready')?.textContent === 'ready');
  await open(page);
  expect((await state(page)).sofaX).toBe(1600);
});

test('listare, redenumire și ștergere pe IndexedDB real', async ({ page }) => {
  const db = uniqueDb();
  await harness(page, db);
  const id = await rc<string>(
    page,
    `(async () => { const r = await rc.manager.create('Apartament'); return r.value.id; })()`,
  );
  await rc(page, `rc.manager.rename(${JSON.stringify(id)}, 'Casă')`);
  const list = await rc<Array<{ name: string; revision: number }>>(
    page,
    `(async () => (await rc.manager.list()).value)()`,
  );
  expect(list).toMatchObject([{ name: 'Casă', revision: 2 }]);
  await rc(page, `rc.manager.remove(${JSON.stringify(id)})`);
  expect(await rc<unknown[]>(page, `(async () => (await rc.manager.list()).value)()`)).toEqual([]);
});

test('două taburi, blocare reală (Web Locks): al doilea e doar-citire; „preia controlul” transferă editarea fără pierderi', async ({
  context,
}) => {
  const db = uniqueDb();
  const p1 = await context.newPage();
  const p2 = await context.newPage();
  await harness(p1, db);
  await harness(p2, db);
  await importStudio(p1);
  expect((await open(p1)).ok).toBe(true);
  // al doilea tab
  expect((await open(p2)).ok).toBe(true);
  expect(await state(p2)).toMatchObject({ readOnly: true, lockLost: false, status: 'readonly' });
  expect(await move(p2, 1)).toMatchObject({ ok: false });
  // ștergerea e refuzată cât timp proiectul e deschis în p1
  const del = await rc<{ ok: boolean; error?: { kind: string } }>(
    p2,
    `rc.manager.remove('studio')`,
  );
  expect(del).toMatchObject({ ok: false, error: { kind: 'open-elsewhere' } });
  // p1 are o modificare încă nesalvată, apoi p2 preia controlul
  await move(p1, 1500);
  expect((await open(p2, true)).ok).toBe(true);
  await expect.poll(async () => (await state(p1)).lockLost, { timeout: 8000 }).toBe(true);
  await expect.poll(async () => (await state(p1)).status).toBe('readonly');
  expect(await move(p1, 2000)).toMatchObject({ ok: false });
  // modificarea lui p1 nu s-a pierdut
  const stored = await rc<number>(
    p2,
    `(async () => { const r = await rc.repo.load('studio'); return r.value.doc.objects.oSofa.position.x; })()`,
  );
  expect(stored).toBe(1500);
  expect(await state(p2)).toMatchObject({ readOnly: false });
  expect(await move(p2, 1700)).toMatchObject({ ok: true });
  await flush(p2);
  // după ce p2 își închide sesiunea, ștergerea devine posibilă
  await rc(p2, 'rc.session.dispose()');
  await rc(p1, 'rc.session.dispose()');
  expect(await rc<{ ok: boolean }>(p2, `rc.manager.remove('studio')`)).toMatchObject({ ok: true });
});

test('fără excludere între taburi, concurența optimistă tot oprește suprascrierea (revizii reale în IndexedDB)', async ({
  context,
}) => {
  const db = uniqueDb();
  const p1 = await context.newPage();
  const p2 = await context.newPage();
  await harness(p1, db, '&locks=none');
  await harness(p2, db, '&locks=none');
  await importStudio(p1);
  await open(p1);
  await open(p2);
  await move(p1, 1500);
  await flush(p1);
  await move(p2, 999);
  await flush(p2);
  expect(await state(p2)).toMatchObject({
    status: 'conflict',
    conflict: { kind: 'changed' },
    hasUnsavedChanges: true,
    sofaX: 999,
  });
  const stored = (p: Page) =>
    rc<number>(
      p,
      `(async () => (await rc.repo.load('studio')).value.doc.objects.oSofa.position.x)()`,
    );
  expect(await stored(p1)).toBe(1500);
  // „reîncarcă” aruncă modificarea locală
  expect(await rc(p2, 'rc.session.reloadFromStorage()')).toMatchObject({ ok: true });
  expect(await state(p2)).toMatchObject({ status: 'saved', sofaX: 1500, historySize: 0 });
  // al doilea conflict, rezolvat cu „suprascrie”; versiunea suprascrisă se arhivează
  await move(p1, 1800);
  await flush(p1);
  await move(p2, 999);
  await flush(p2);
  expect((await state(p2)).status).toBe('conflict');
  expect(await rc(p2, 'rc.session.overwriteStored()')).toMatchObject({ ok: true });
  expect(await stored(p1)).toBe(999);
  const snaps = await rc<Array<{ reason: string }>>(p1, `rc.repo.listSnapshots('studio')`);
  expect(snaps.map((s) => s.reason)).toEqual(['pre-overwrite']);
});

test('cotă depășită (simulată pe IndexedDB real): modificările rămân în memorie, backup-ul se exportă, reîncercarea salvează', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __failWrites?: boolean };
    for (const name of ['put', 'add'] as const) {
      const original = IDBObjectStore.prototype[name];
      IDBObjectStore.prototype[name] = function (
        this: IDBObjectStore,
        ...args: Parameters<typeof original>
      ) {
        if (w.__failWrites)
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return original.apply(this, args);
      } as typeof original;
    }
  });
  const db = uniqueDb();
  await harness(page, db);
  await importStudio(page);
  await open(page);
  await page.evaluate(() => ((window as unknown as { __failWrites: boolean }).__failWrites = true));
  await move(page, 1500);
  await flush(page);
  expect(await state(page)).toMatchObject({
    status: 'error',
    hasUnsavedChanges: true,
    sofaX: 1500,
    revision: 1,
    error: { kind: 'quota' },
  });
  const backup = await rc<string>(
    page,
    `rc.session.exportBackup({ exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' })`,
  );
  expect(JSON.parse(backup).project.objects.oSofa.position.x).toBe(1500);
  await page.evaluate(
    () => ((window as unknown as { __failWrites: boolean }).__failWrites = false),
  );
  await rc(page, 'rc.session.retrySave()');
  expect(await state(page)).toMatchObject({
    status: 'saved',
    hasUnsavedChanges: false,
    revision: 2,
  });
  await page.reload();
  await page.waitForFunction(() => document.getElementById('ready')?.textContent === 'ready');
  await open(page);
  expect((await state(page)).sofaX).toBe(1500);
});

test('cererea de persistență și estimarea spațiului nu aruncă (valori booleene/numerice sau null)', async ({
  page,
}) => {
  await harness(page, uniqueDb());
  expect(typeof (await rc<boolean>(page, 'rc.persistence()'))).toBe('boolean');
  const info = await rc<{
    persisted: boolean | null;
    usageBytes: number | null;
    quotaBytes: number | null;
  }>(page, 'rc.storageInfo()');
  expect(['boolean', 'object']).toContain(typeof info.persisted);
  expect(info.usageBytes === null || typeof info.usageBytes === 'number').toBe(true);
});
