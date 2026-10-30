import { expect, test, type Page } from '@playwright/test';

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

async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('./');
  await page
    .getByRole('button', { name: /^(\+ Proiect nou|Creează primul proiect)$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Proiect nou' });
  await dialog.getByLabel('Numele proiectului').fill(name);
  await dialog.getByRole('button', { name: 'Creează' }).click();
  await expect(page.getByTestId('plan-editor')).toBeVisible();
}

const objects2d = (page: Page) => page.locator('g[data-testid^="object-"]');
const frame = (page: Page) =>
  page
    .locator('[data-testid="viewer3d-box"] canvas')
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());

test.describe('catalog de obiecte și mobilier (build static)', () => {
  test('catalog → adăugare în cameră → proprietăți → mutare cu mouse-ul → undo → 3D → reîncărcare', async ({
    page,
    browserName,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Mobilat');
    await page.getByTestId('room-form-submit').click(); // 4000 × 3000
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');
    await expect(objects2d(page)).toHaveCount(0);

    // catalogul se deschide la cerere și are ~40 de obiecte cu previzualizare
    await expect(page.getByTestId('catalog-panel')).toHaveCount(0);
    await page.getByTestId('catalog-toggle').click();
    await expect(page.getByTestId('catalog-panel')).toBeVisible();
    await expect(page.locator('[data-testid^="catalog-item-"]')).toHaveCount(41);
    await expect(page.getByTestId('item-preview').first()).toBeVisible();
    // clicul poate fi pierdut sub încărcare (hidratare): se reîncearcă până când filtrul se aplică
    await expect(async () => {
      await page.getByTestId('catalog-category-baie').click();
      await expect(page.locator('[data-testid^="catalog-item-"]')).toHaveCount(5, {
        timeout: 1500,
      });
    }).toPass({ timeout: 10_000 });
    await page.getByTestId('catalog-category-all').click();
    await page.getByTestId('catalog-search').fill('nu-exista');
    await expect(page.getByTestId('catalog-empty')).toBeVisible();
    await page.getByTestId('catalog-search').fill('canapea');
    await expect(page.locator('[data-testid^="catalog-item-"]')).toHaveCount(3);

    // adăugare în cameră
    await page.getByTestId('catalog-item-living.sofa-3').click();
    await expect(objects2d(page)).toHaveCount(1);
    await expect(page.getByTestId('object-panel')).toBeVisible();
    await expect(page.getByTestId('object-title')).toHaveText('Canapea 3 locuri');

    // proprietăți: dimensiune validă, parametru, culoare; valoare invalidă respinsă cu mesaj
    await page.getByTestId('object-width').fill('2400');
    await page.getByTestId('object-width').press('Enter');
    await expect(page.getByTestId('object-width')).toHaveValue('2400');
    await page.getByTestId('param-seats').fill('4');
    await page.getByTestId('param-seats').press('Enter');
    await expect(page.getByTestId('param-seats')).toHaveValue('4');
    await page.getByTestId('object-swatch-8c6d4f').click();
    await page.getByTestId('object-width').fill('100');
    await page.getByTestId('object-width').press('Enter');
    await expect(page.getByRole('alert').first()).toContainText('Lățimea trebuie să fie între');

    // mutare cu mouse-ul: un pas în istoric
    const obj = objects2d(page).first();
    await expect(obj).toHaveAttribute('data-selected', 'true');
    // câmpurile din panou au derulat pagina: planul trebuie să fie din nou în fereastră
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await obj.boundingBox();
    const hist = await page.getByTestId('history-size').textContent();
    await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await page.mouse.down();
    await page.mouse.move(before!.x + before!.width / 2 + 60, before!.y + before!.height / 2 + 20, {
      steps: 8,
    });
    await page.mouse.up();
    const after = await obj.boundingBox();
    expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(20);
    await expect(page.getByTestId('history-size')).toHaveText(String(Number(hist) + 1));

    // tastatură: rotire, duplicare, ștergere, apoi undo
    await page.keyboard.press('r');
    await page.keyboard.press('Control+d');
    await expect(objects2d(page)).toHaveCount(2);
    await page.keyboard.press('Delete');
    await expect(objects2d(page)).toHaveCount(1);
    await page.getByTestId('undo').click(); // anulează ștergerea
    await expect(objects2d(page)).toHaveCount(2);
    await page.getByTestId('undo').click(); // anulează duplicarea
    await expect(objects2d(page)).toHaveCount(1);

    // 3D: obiectul apare în scenă și rămâne selectat
    await page.getByTestId('mode-3d').click();
    const noWebgl = page.getByTestId('viewer3d-nowebgl');
    await expect(page.locator('[data-testid="viewer3d-box"] canvas').or(noWebgl)).toBeVisible({
      timeout: 20_000,
    });
    if (!(await noWebgl.isVisible())) {
      await expect(page.getByTestId('viewer3d-box')).toHaveAttribute('data-objects', '1');
      const withSofa = await frame(page);
      // un al doilea obiect schimbă imaginea scenei, fără reîncărcare
      await page.getByTestId('catalog-search').fill('dulap');
      await page.getByTestId('catalog-item-bedroom.wardrobe').click();
      await expect(page.getByTestId('viewer3d-box')).toHaveAttribute('data-objects', '2');
      await expect(page.getByTestId('object-panel')).toBeVisible(); // obiectul nou e selectat și în 3D
      await expect.poll(() => frame(page)).not.toBe(withSofa);
    } else test.skip(browserName === 'chromium', 'Chromium trebuie să ofere WebGL');

    // autosave + reîncărcare: obiectele supraviețuiesc
    await page.getByTestId('mode-2d').click();
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    const count = await objects2d(page).count();
    await page.reload();
    await expect(objects2d(page)).toHaveCount(count);
    await page.getByTestId('mode-3d').click();
    if (!(await noWebgl.isVisible()))
      await expect(page.getByTestId('viewer3d-box')).toHaveAttribute(
        'data-objects',
        String(count),
        {
          timeout: 20_000,
        },
      );
    expect(errors).toEqual([]);
  });

  test('catalog: obiect montat pe perete (oglindă) se așază lipit de perete, la elevația din catalog', async ({
    page,
  }) => {
    await createProject(page, 'Perete');
    await page.getByTestId('room-form-submit').click();
    await page.getByTestId('catalog-toggle').click();
    await page.getByTestId('catalog-item-decor.mirror').click();
    await expect(page.getByTestId('object-elevation')).toHaveValue('1000');
    await expect(objects2d(page)).toHaveCount(1);
  });
});
