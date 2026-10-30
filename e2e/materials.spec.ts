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

const frame = (page: Page) =>
  page
    .locator('[data-testid="viewer3d-box"] canvas')
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
test.describe('materiale și finisaje (build static)', () => {
  test('aplicare pe podea, pereți, față de perete și mobilier; 2D și 3D se actualizează; buget; persistă după reîncărcare', async ({
    page,
    browserName,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Finisat');
    await page.getByTestId('room-form-submit').click(); // 4000 × 3000

    // obiect pentru finisaje pe zone
    await page.getByTestId('catalog-toggle').click();
    await page.getByTestId('catalog-item-bedroom.wardrobe').click();
    await expect(page.getByTestId('object-panel')).toBeVisible();

    // panoul de materiale (exclusiv cu catalogul): zonele obiectului selectat sunt țintele
    await page.getByTestId('materials-toggle').click();
    await expect(page.getByTestId('materials-panel')).toBeVisible();
    await expect(page.getByTestId('catalog-panel')).toHaveCount(0);
    await expect(page.getByTestId('materials-surface-hint')).toContainText('mobilier');
    await expect(page.locator('[data-testid^="material-mat."]')).toHaveCount(7);
    await page.getByTestId('material-mat.furn.gloss-white').click();
    await expect(page.getByTestId('materials-current-name')).toHaveText('Finisaj lucios alb');

    // podea
    const options = await page.getByTestId('materials-target').locator('option').allTextContents();
    await page
      .getByTestId('materials-target')
      .selectOption({ label: options.find((o) => o.startsWith('Podeaua'))! });
    await expect(page.getByTestId('materials-surface-hint')).toContainText('podea');
    await expect(page.locator('[data-testid^="material-mat.paint."]')).toHaveCount(0); // incompatibile
    await page.getByTestId('material-mat.parquet.oak-natural').click();
    await expect(page.locator('g[data-testid^="room-"][data-floor]').first()).toHaveAttribute(
      'data-floor',
      '#b9834f',
    );
    await page.getByTestId('material-scale').fill('150');
    await page.getByTestId('material-scale').press('Enter');
    await expect(page.getByTestId('material-scale')).toHaveValue('150');

    // toți pereții, apoi un perete diferit
    await page
      .getByTestId('materials-target')
      .selectOption({ label: options.find((o) => o.startsWith('Toți pereții'))! });
    await page.getByTestId('material-mat.paint.sage').click();
    await expect(page.locator('[data-testid^="finish-face-"]')).toHaveCount(4);
    await page
      .getByTestId('materials-target')
      .selectOption({ label: options.find((o) => o.startsWith('Peretele 1'))! });
    await page.getByTestId('material-mat.wtile.metro').click();

    // estimarea vine din domeniu, cu avertisment
    await expect(page.getByTestId('materials-budget')).toContainText('Parchet stejar natur');
    await expect(page.getByTestId('materials-budget')).toContainText('Verde salvie');
    await expect(page.getByTestId('materials-budget')).toContainText('nu prețuri de piață');
    await expect(page.getByTestId('materials-budget-total')).toContainText('RON');

    // 3D
    await page.getByTestId('mode-3d').click();
    const noWebgl = page.getByTestId('viewer3d-nowebgl');
    await expect(page.locator('[data-testid="viewer3d-box"] canvas').or(noWebgl)).toBeVisible({
      timeout: 20_000,
    });
    if (!(await noWebgl.isVisible())) {
      await expect(page.getByTestId('viewer3d-box')).toHaveAttribute('data-walls', /\d+/);
      await expect.poll(() => frame(page)).not.toBe('');
      const textured = await frame(page);
      // schimbarea unui material actualizează imaginea imediat
      await page
        .getByTestId('materials-target')
        .selectOption({ label: options.find((o) => o.startsWith('Podeaua'))! });
      await page.getByTestId('material-mat.parquet.dark').click();
      await expect.poll(() => frame(page)).not.toBe(textured);
      // clic pe o suprafață din scenă o alege ca țintă
      const box = (await page.getByTestId('viewer3d-box').boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.62);
      await expect(page.getByTestId('materials-target')).toHaveValue(/^(floor|face):/);
    } else test.skip(browserName === 'chromium', 'Chromium trebuie să ofere WebGL');

    // autosave + reîncărcare: materialele supraviețuiesc
    await page.getByTestId('mode-2d').click();
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await page.reload();
    await page.getByTestId('materials-toggle').click();
    await expect(page.getByTestId('materials-budget')).toContainText('Verde salvie');
    await expect(page.locator('[data-testid^="finish-face-"]')).toHaveCount(4);

    expect(errors).toEqual([]);
  });

  test('doar materiale compatibile și mesaj pentru căutare fără rezultate', async ({ page }) => {
    await createProject(page, 'Compat');
    await page.getByTestId('room-form-submit').click();
    await page.getByTestId('materials-toggle').click();
    await expect(page.getByTestId('materials-surface-hint')).toContainText('podea');
    await page.getByTestId('materials-search').fill('vopsea');
    await expect(page.getByTestId('materials-empty')).toBeVisible(); // vopseaua nu e compatibilă cu podeaua
    await page.getByTestId('materials-search').fill('parchet');
    await expect(page.locator('[data-testid^="material-mat."]')).toHaveCount(3);
  });
});
