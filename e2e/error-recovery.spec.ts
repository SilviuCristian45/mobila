import { expect, test, type Page } from '@playwright/test';

// F-05: erori de randare reale în build-ul static, în Chromium / Firefox / WebKit. Erorile se provoacă fără cod de
// test în aplicație: formatterele `Intl` primesc (prin addInitScript) un comutator care le face să arunce, iar WebGL
// se simulează prin `getContext`. Ce se verifică: boundary-ul chiar prinde eroarea, interfața rămâne explicată, în
// română, fără detalii tehnice, iar datele salvate rămân intacte.

const SECRET = 'SECRET-E2E-DETAIL';
type Boom = 'date' | 'length' | 'money' | null;

/** `Intl.DateTimeFormat`/`NumberFormat` aruncă la `format()` cât timp `window.__rcBoom` are tipul lor. */
async function installBoom(page: Page): Promise<void> {
  await page.addInitScript((secret) => {
    const w = window as unknown as { __rcBoom: Boom };
    w.__rcBoom = null;
    const wrap = <T extends object>(Orig: T, kindOf: (args: unknown[]) => string): T =>
      new Proxy(Orig, {
        construct(target, args) {
          const real = Reflect.construct(target as never, args) as object;
          const kind = kindOf(args);
          return new Proxy(real, {
            get(t, p) {
              if (p === 'format')
                return (v: unknown) => {
                  if (w.__rcBoom === kind) throw new Error(secret);
                  return (t as { format: (x: unknown) => string }).format(v);
                };
              const val = Reflect.get(t, p, t);
              return typeof val === 'function' ? val.bind(t) : val;
            },
          });
        },
      });
    Intl.DateTimeFormat = wrap(Intl.DateTimeFormat, () => 'date');
    Intl.NumberFormat = wrap(Intl.NumberFormat, (args) =>
      (args[1] as { minimumFractionDigits?: number } | undefined)?.minimumFractionDigits === 2
        ? 'money'
        : 'length',
    );
  }, SECRET);
}
const setBoom = (page: Page, kind: Boom) =>
  page.evaluate((k) => ((window as unknown as { __rcBoom: Boom }).__rcBoom = k), kind);

async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('./');
  await page
    .getByRole('button', { name: /^(\+ Proiect nou|Creează primul proiect)$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Proiect nou' });
  await dialog.getByLabel('Numele proiectului').fill(name);
  await dialog.getByRole('button', { name: 'Creează' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
  return new URL(page.url()).searchParams.get('p')!;
}
const saveStatus = (page: Page) => page.getByTestId('save-status');
const body = (page: Page) => page.locator('body');
async function rename(page: Page, name: string) {
  await page.getByTestId('rename').click();
  const dialog = page.getByRole('dialog', { name: 'Redenumește proiectul' });
  await dialog.getByLabel('Numele proiectului').fill(name);
  await dialog.getByRole('button', { name: 'Redenumește' }).click();
}
/** Documentul brut din IndexedDB, citit direct (nu prin aplicație). */
const storedName = (page: Page, id: string) =>
  page.evaluate(
    (pid) =>
      new Promise<{ name: string; revision: number } | null>((resolve, reject) => {
        const open = indexedDB.open('roomcraft');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('documents').objectStore('documents').get(pid);
          get.onsuccess = () => {
            open.result.close();
            const row = get.result as { revision: number; data: { name: string } } | undefined;
            resolve(row ? { name: row.data.name, revision: row.revision } : null);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    id,
  );

test.describe('erori de randare izolate (build static)', () => {
  test('eroare în carcasa editorului → error.tsx, fără detalii tehnice; datele salvate supraviețuiesc; „Încearcă din nou” redeschide proiectul', async ({
    page,
  }) => {
    await installBoom(page);
    const id = await createProject(page, 'Rută');
    await setBoom(page, 'date'); // SaveIndicator formatează data ultimei salvări în afara zonei de lucru
    await rename(page, 'Salvat înaintea erorii');

    const box = page.getByTestId('route-error');
    await expect(box).toBeVisible();
    await expect(box).toContainText('A apărut o eroare neașteptată');
    await expect(box).toContainText('Proiectele tale rămân salvate');
    await expect(body(page)).not.toContainText(SECRET);
    await expect(page.getByTestId('route-error-home')).toHaveAttribute('href', /\/$/);

    // modificarea a ajuns în IndexedDB înainte (sau la demontarea sesiunii) — nu s-a pierdut
    await expect
      .poll(async () => (await storedName(page, id))?.name)
      .toBe('Salvat înaintea erorii');

    await setBoom(page, null);
    await page.getByTestId('route-error-retry').click();
    await expect(page.getByTestId('editor')).toBeVisible();
    await expect(page.getByTestId('project-title')).toHaveText('Salvat înaintea erorii');
    await expect(page.getByTestId('mode')).toHaveText('editare'); // blocarea s-a eliberat: nu e doar-citire
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
  });

  test('eroare în planul 2D → zona de lucru izolată: antet, undo, export și dashboard rămân; retry readuce planul fără operații noi', async ({
    page,
  }) => {
    await installBoom(page);
    const id = await createProject(page, 'Zonă');
    await page.getByTestId('room-form-submit').click();
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
    const before = await storedName(page, id);

    await setBoom(page, 'length');
    await page.getByTestId('zoom-in').click(); // PlanEditor afișează scara cu `formatLength`

    const box = page.getByTestId('workspace-error');
    await expect(box).toBeVisible();
    await expect(box).toContainText('Zona de lucru a întâmpinat o eroare');
    await expect(body(page)).not.toContainText(SECRET);
    await expect(page.getByTestId('project-title')).toHaveText('Zonă'); // antetul a rămas
    await expect(page.getByTestId('undo')).toBeEnabled();
    await expect(page.getByTestId('back-to-dashboard')).toBeVisible();

    // „Exportă copie” funcționează din fallback și produce un fișier valid
    const download = page.waitForEvent('download');
    await box.getByRole('button', { name: 'Exportă copie' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('zona.roomcraft.json');

    // retry cât eroarea persistă: rămâne fallback-ul; după ce dispare cauza: planul revine
    await page.getByTestId('workspace-error-retry').click();
    await expect(box).toBeVisible();
    await setBoom(page, null);
    await page.getByTestId('workspace-error-retry').click();
    await expect(page.getByTestId('plan-editor')).toBeVisible();
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
    expect(await storedName(page, id)).toEqual(before); // nicio scriere de la erori/reîncercări
  });

  test('eroare într-un panou lateral → doar panoul e înlocuit, planul rămâne; retry readuce panoul', async ({
    page,
  }) => {
    await installBoom(page);
    await createProject(page, 'Panou');
    await setBoom(page, 'money'); // panoul de materiale formatează sume cu `formatMoney`
    await page.getByTestId('materials-toggle').click();

    const box = page.getByTestId('side-panel-error');
    await expect(box).toBeVisible();
    await expect(box).toContainText('Panoul lateral a întâmpinat o eroare');
    await expect(body(page)).not.toContainText(SECRET);
    await expect(page.getByTestId('plan-editor')).toBeVisible(); // planul a rămas
    await expect(page.getByTestId('workspace-error')).toHaveCount(0);

    await setBoom(page, null);
    await box.getByRole('button', { name: 'Încearcă din nou' }).click();
    await expect(page.getByTestId('side-panel-error')).toHaveCount(0);
    await expect(page.getByTestId('plan-editor')).toBeVisible();
  });
});

test.describe('3D: WebGL indisponibil sau eșuat', () => {
  test('WebGL indisponibil → mesaj explicit; planul 2D și proiectul funcționează', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = (() => null) as never;
    });
    await createProject(page, 'Fără WebGL');
    await page.getByTestId('mode-3d').click();
    await expect(page.getByTestId('viewer3d-nowebgl')).toBeVisible();
    await page.getByTestId('mode-2d').click();
    await expect(page.getByTestId('plan-editor')).toBeVisible();
    await expect(page.getByTestId('project-title')).toHaveText('Fără WebGL');
  });

  test('canvas-ul 3D nu se poate crea (după verificarea WebGL) → RenderBoundary: mesaj local, 2D și dashboard rămân', async ({
    page,
  }) => {
    // prima cerere de context (verificarea `webglAvailable`) reușește, restul eșuează: exact cazul „probă ok, randare nu”
    await page.addInitScript(() => {
      const w = window as unknown as { __glCalls: number; __glFail: boolean };
      w.__glCalls = 0;
      w.__glFail = true;
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...a: unknown[]) {
        const kind = String(a[0]);
        if (!kind.includes('webgl')) return (real as (...x: unknown[]) => unknown).apply(this, a);
        w.__glCalls++;
        if (w.__glCalls === 1) return {}; // proba: „există WebGL”
        return w.__glFail ? null : (real as (...x: unknown[]) => unknown).apply(this, a);
      } as never;
    });
    const id = await createProject(page, 'Eșec 3D');
    const before = await storedName(page, id);
    await page.getByTestId('mode-3d').click();

    const err = page.getByTestId('viewer3d-render-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText('Planul 2D și proiectul nu sunt afectate');
    await expect(err).not.toContainText('WebGL context');
    await expect(page.getByTestId('project-title')).toHaveText('Eșec 3D'); // aplicația a rămas în picioare

    await page.getByTestId('mode-2d').click(); // revenire la plan
    await expect(page.getByTestId('plan-editor')).toBeVisible();
    await page.getByTestId('mode-3d').click();
    await expect(page.getByTestId('viewer3d-render-error')).toBeVisible(); // reîncercarea cât eroarea persistă
    await page.getByTestId('back-to-dashboard').click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    expect(await storedName(page, id)).toEqual(before);
  });
});

test.describe('încărcare din IndexedDB eșuată', () => {
  test('document invalid: editorul explică și oferă înapoi; datele rămân neatinse; dashboard-ul oferă exportul brut', async ({
    page,
  }) => {
    const id = await createProject(page, 'Stricat');
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
    await page.goto('./'); // închide sesiunea (pagehide) înainte să scriem direct în stocare
    await page.evaluate(
      (pid) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('roomcraft');
          open.onsuccess = () => {
            const tx = open.result.transaction('documents', 'readwrite');
            tx.objectStore('documents').put({ projectId: pid, revision: 7, data: { gunoi: true } });
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          open.onerror = () => reject(open.error);
        }),
      id,
    );

    await page.goto(`./editor/?p=${id}`);
    const box = page.getByTestId('editor-open-error');
    await expect(box).toBeVisible();
    await expect(box).toContainText('Proiectul este invalid');
    await expect(page.getByTestId('editor')).toHaveCount(0);
    await box.getByRole('link', { name: /Înapoi la proiecte/ }).click();

    const card = page.getByTestId('project-card');
    await expect(card.getByTestId('project-invalid')).toBeVisible();
    await expect(card.getByRole('button', { name: /Exportă datele brute/ })).toBeVisible();
    // documentul invalid nu a fost modificat de încercările de deschidere
    const raw = await page.evaluate(
      (pid) =>
        new Promise<unknown>((resolve) => {
          const open = indexedDB.open('roomcraft');
          open.onsuccess = () => {
            const g = open.result.transaction('documents').objectStore('documents').get(pid);
            g.onsuccess = () => {
              open.result.close();
              resolve(g.result);
            };
          };
        }),
      id,
    );
    expect(raw).toEqual({ projectId: id, revision: 7, data: { gunoi: true } });
  });
});
