import { expect, test, type Page } from '@playwright/test';

const prefix = process.env.RC_PREFIX ?? '';

/** Colectează erorile de consolă, excepțiile și răspunsurile HTTP ≥ 400 (în afară de favicon). */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
      errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico'))
      errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return errors;
}

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

async function renameInEditor(page: Page, name: string) {
  await page.getByTestId('rename').click();
  const dialog = page.getByRole('dialog', { name: 'Redenumește proiectul' });
  await dialog.getByLabel('Numele proiectului').fill(name);
  await dialog.getByRole('button', { name: 'Redenumește' }).click();
}

test.describe('prerandare statică', () => {
  test('HTML-ul static conține doar carcasa: stocarea se deschide numai pe client', async ({
    request,
  }) => {
    const home = await (await request.get('./')).text();
    expect(home).toContain('RoomCraft');
    expect(home).toContain('Se inițializează stocarea locală');
    expect(home).not.toContain('Proiectele mele');
    const editor = await (await request.get('./editor/')).text();
    expect(editor).toContain('Se încarcă editorul');
  });
});

test.describe('dashboard', () => {
  test('stare goală → creare → editor → înapoi → proiectul apare în listă și supraviețuiește reîncărcării', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    const id = await createProject(page, 'Apartament Dorobanți');
    expect(page.url()).toMatch(/\/editor\/\?p=[0-9a-f-]{36}$/);
    await expect(page.getByTestId('project-title')).toHaveText('Apartament Dorobanți');
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');

    await page.getByTestId('back-to-dashboard').click();
    const card = page.getByTestId('project-card');
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId('project-name')).toHaveText('Apartament Dorobanți');
    await expect(card.getByText(/0 camere · 0 obiecte/)).toBeVisible();
    await expect(card.getByRole('link', { name: /Deschide/ })).toHaveAttribute(
      'href',
      `${prefix}/editor/?p=${id}`,
    );

    await page.reload();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await expect(page.getByTestId('project-name')).toHaveText('Apartament Dorobanți');
    expect(errors).toEqual([]);
  });

  test('„Deschide” duce în editorul proiectului; titlul paginii urmează numele', async ({
    page,
  }) => {
    await createProject(page, 'Casa de vacanță');
    await page.goto('./');
    await page.getByRole('link', { name: /Deschide/ }).click();
    await expect(page.getByTestId('project-title')).toHaveText('Casa de vacanță');
    await expect(page).toHaveTitle('Casa de vacanță — RoomCraft');
  });

  test('redenumire din listă cu validare; ștergere cu confirmare (anulare, apoi confirmare)', async ({
    page,
  }) => {
    await createProject(page, 'Vechi');
    await page.goto('./');
    await page.getByRole('button', { name: /Redenumește/ }).click();
    let dialog = page.getByRole('dialog', { name: 'Redenumește proiectul' });
    await dialog.getByLabel('Numele proiectului').fill('   ');
    await dialog.getByRole('button', { name: 'Redenumește' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Numele nu poate fi gol.');
    await dialog.getByLabel('Numele proiectului').fill('Nou');
    await dialog.getByRole('button', { name: 'Redenumește' }).click();
    await expect(page.getByTestId('project-name')).toHaveText('Nou');
    await expect(page.getByTestId('notice')).toContainText('redenumit în „Nou”');

    await page.getByRole('button', { name: /Șterge/ }).click();
    dialog = page.getByRole('dialog', { name: 'Ștergi proiectul?' });
    await expect(dialog).toContainText('nu poate fi anulată');
    await dialog.getByRole('button', { name: 'Anulează' }).click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await page.getByRole('button', { name: /Șterge/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Șterge definitiv' }).click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('dialogul de creare: Escape îl închide, validarea nu lasă numele gol', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: '+ Proiect nou' }).click();
    const dialog = page.getByRole('dialog', { name: 'Proiect nou' });
    await expect(dialog.getByLabel('Numele proiectului')).toBeFocused();
    await dialog.getByLabel('Numele proiectului').fill('');
    await dialog.getByRole('button', { name: 'Creează' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Numele nu poate fi gol.');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('document invalid în IndexedDB: cardul îl marchează, restul listei rămâne utilizabil', async ({
    page,
  }) => {
    const goodId = await createProject(page, 'Bun');
    await page.goto('./');
    await createProject(page, 'Stricat');
    // corupem direct documentul în IndexedDB-ul real
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('roomcraft');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(['documents', 'projects'], 'readwrite');
            const projects = tx.objectStore('projects').getAll();
            projects.onsuccess = () => {
              const bad = (projects.result as Array<{ id: string; name: string }>).find(
                (p) => p.name === 'Stricat',
              )!;
              tx.objectStore('documents').put({
                projectId: bad.id,
                revision: 1,
                data: { gunoi: true },
              });
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.goto('./');
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    const bad = page.getByTestId('project-card').filter({ hasText: 'Stricat' });
    await expect(bad.getByTestId('project-invalid')).toContainText('Proiectul este invalid');
    await expect(bad.getByRole('link', { name: /Deschide/ })).toHaveCount(0);
    await expect(bad.getByRole('button', { name: /Restaurează o copie/ })).toBeVisible();
    const good = page.getByTestId('project-card').filter({ hasText: 'Bun' });
    await expect(good.getByRole('link', { name: /Deschide/ })).toHaveAttribute(
      'href',
      `${prefix}/editor/?p=${goodId}`,
    );
    // și în editor: mesaj clar, fără blocare
    const badId = await bad.getAttribute('data-project-id');
    await page.goto(`./editor/?p=${badId}`);
    await expect(page.getByTestId('editor-open-error')).toContainText('Proiectul este invalid');
  });
});

test.describe('editor: rută, sesiune, stări', () => {
  test('navigare directă la editor + reîncărcare păstrează proiectul și modificările salvate', async ({
    page,
  }) => {
    const id = await createProject(page, 'Primul');
    await renameInEditor(page, 'Redenumit');
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'dirty');
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved'); // autosave real
    await page.goto(`./editor/?p=${id}`);
    await expect(page.getByTestId('project-title')).toHaveText('Redenumit');
    await page.reload();
    await expect(page.getByTestId('project-title')).toHaveText('Redenumit');
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
    await expect(page.getByTestId('history-size')).toHaveText('0');
    await expect(page.getByTestId('mode')).toHaveText('editare');
  });

  test('/editor?p=… fără slash final este redirecționat de gazdă la aceeași pagină', async ({
    page,
  }) => {
    const id = await createProject(page, 'Redirect');
    await page.goto(`./editor?p=${id}`);
    await expect(page.getByTestId('project-title')).toHaveText('Redirect');
  });

  test('undo / redo din interfață; butoanele și starea de salvare urmează sesiunea', async ({
    page,
  }) => {
    await createProject(page, 'Alfa');
    const undo = page.getByTestId('undo');
    const redo = page.getByTestId('redo');
    await expect(undo).toBeDisabled();
    await renameInEditor(page, 'Beta');
    await expect(page.getByTestId('project-title')).toHaveText('Beta');
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page.getByTestId('project-title')).toHaveText('Alfa');
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(page.getByTestId('project-title')).toHaveText('Beta');
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
    await page.reload();
    await expect(page.getByTestId('project-title')).toHaveText('Beta');
  });

  test('identificator lipsă sau proiect inexistent → mesaje clare cu cale înapoi', async ({
    page,
  }) => {
    await page.goto('./editor/');
    await expect(page.getByTestId('editor-missing-id')).toBeVisible();
    await page.goto('./editor/?p=nu-exista');
    const box = page.getByTestId('editor-open-error');
    await expect(box).toContainText('Proiectul nu există');
    await box.getByRole('link', { name: /Înapoi la proiecte/ }).click();
    await expect(page.getByTestId('dashboard')).toBeVisible();
  });

  test('două taburi: al doilea e doar-citire (Web Locks reale), „Preia controlul” transferă editarea', async ({
    context,
  }) => {
    const a = await context.newPage();
    const id = await createProject(a, 'Partajat');
    const b = await context.newPage();
    await b.goto(`./editor/?p=${id}`);
    await expect(b.getByTestId('banner-readonly')).toBeVisible();
    await expect(b.getByTestId('mode')).toHaveText('doar citire');
    await expect(b.getByTestId('rename')).toBeDisabled();
    await b.getByRole('button', { name: 'Preia controlul' }).click();
    await expect(b.getByTestId('mode')).toHaveText('editare');
    await expect(a.getByTestId('banner-lock-lost')).toBeVisible();
    await expect(a.getByTestId('mode')).toHaveText('doar citire');
    await renameInEditor(b, 'Editat în B');
    await expect(saveStatus(b)).toHaveAttribute('data-status', 'saved');
  });

  test('dashboard: ștergerea unui proiect deschis în alt tab este refuzată cu explicație', async ({
    context,
  }) => {
    const a = await context.newPage();
    await createProject(a, 'Blocat');
    const b = await context.newPage();
    await b.goto('./');
    await b.getByRole('button', { name: /Șterge/ }).click();
    await b.getByRole('dialog').getByRole('button', { name: 'Șterge definitiv' }).click();
    await expect(b.getByRole('dialog').getByRole('alert')).toContainText('deschis în alt tab');
    await expect(b.getByTestId('project-card')).toHaveCount(1);
  });

  test('cotă depășită (simulată pe IndexedDB real): bannerul explică, copia de siguranță se descarcă, reîncercarea salvează', async ({
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
    const id = await createProject(page, 'Plin');
    await page.evaluate(
      () => ((window as unknown as { __failWrites: boolean }).__failWrites = true),
    );
    await renameInEditor(page, 'Nesalvat încă');
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'error');
    const banner = page.getByTestId('banner-error');
    await expect(banner).toContainText('Spațiul de stocare este plin');
    await expect(page.getByTestId('project-title')).toHaveText('Nesalvat încă');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      banner.getByRole('button', { name: 'Exportă copie de siguranță' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('nesalvat-inca.roomcraft.json');
    const fs = await import('node:fs/promises');
    const saved = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
    expect(saved).toMatchObject({
      format: 'roomcraft',
      formatVersion: 1,
      project: { name: 'Nesalvat încă' },
    });

    await page.evaluate(
      () => ((window as unknown as { __failWrites: boolean }).__failWrites = false),
    );
    await banner.getByRole('button', { name: 'Reîncearcă salvarea' }).click();
    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
    await expect(page.getByTestId('banner-error')).toHaveCount(0);
    await page.goto(`./editor/?p=${id}`);
    await expect(page.getByTestId('project-title')).toHaveText('Nesalvat încă');
  });

  test('stocare indisponibilă (IndexedDB lipsă): dashboard și editor arată mesaj clar, fără excepții', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    });
    await page.goto('./');
    await expect(page.getByTestId('storage-unavailable')).toContainText(
      'Stocarea locală nu este disponibilă',
    );
    await page.goto('./editor/?p=x');
    await expect(page.getByTestId('editor-storage-unavailable')).toBeVisible();
    expect(errors.filter((e) => !/indexedDB/i.test(e))).toEqual([]);
  });
});
