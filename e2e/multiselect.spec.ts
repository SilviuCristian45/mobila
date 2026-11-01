import { expect, test, type Page } from '@playwright/test';

// Etapa 6c, în build-ul static și în cele trei browsere: selecție multiplă de obiecte (Shift + clic) și mutare în grup
// cu mouse-ul, ca un singur pas de undo; tastatura (săgeți, Ctrl+D, Delete) acționează pe tot grupul.

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
const selected = (page: Page) => page.locator('g[data-testid^="object-"][data-selected="true"]');
const centerOf = async (page: Page, index: number) => {
  const box = await objects2d(page).nth(index).boundingBox();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
};

test.describe('selecție multiplă de obiecte (build static)', () => {
  test('Shift + clic → grup → tragere cu mouse-ul (un pas de undo) → Ctrl+D → Delete → undo', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Grup');
    await page.getByTestId('room-form-submit').click(); // 4000 × 3000
    await page.getByTestId('catalog-toggle').click();
    await expect(async () => {
      await page.getByTestId('catalog-item-living.sofa-3').click();
      await expect(objects2d(page)).toHaveCount(1, { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await page.getByTestId('catalog-item-bedroom.wardrobe').click();
    await page.getByTestId('catalog-item-living.sofa-3').click();
    await expect(objects2d(page)).toHaveCount(3);
    await page.getByTestId('catalog-toggle').click(); // închide catalogul: planul rămâne vizibil
    await expect(page.getByTestId('catalog-panel')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));

    // fundal → nimic selectat; clic → unul; Shift + clic → grup
    await page.getByTestId('plan-svg').click({ position: { x: 4, y: 4 } });
    await expect(selected(page)).toHaveCount(0);
    const c0 = await centerOf(page, 0);
    await page.mouse.click(c0.x, c0.y);
    await expect(selected(page)).toHaveCount(1);
    const c1 = await centerOf(page, 1);
    await page.keyboard.down('Shift');
    await page.mouse.click(c1.x, c1.y);
    await page.keyboard.up('Shift');
    await expect(selected(page)).toHaveCount(2);
    await expect(page.getByTestId('multi-selection')).toContainText('2 obiecte selectate');

    // tragere: ambele obiecte se mută la fel, al treilea rămâne pe loc, un singur pas în istoric
    const before = [await centerOf(page, 0), await centerOf(page, 1), await centerOf(page, 2)];
    const hist = Number(await page.getByTestId('history-size').textContent());
    await page.mouse.move(before[0]!.x, before[0]!.y);
    await page.mouse.down();
    await page.mouse.move(before[0]!.x + 50, before[0]!.y + 30, { steps: 8 });
    await page.mouse.up();
    const after = [await centerOf(page, 0), await centerOf(page, 1), await centerOf(page, 2)];
    const d0 = { x: after[0]!.x - before[0]!.x, y: after[0]!.y - before[0]!.y };
    const d1 = { x: after[1]!.x - before[1]!.x, y: after[1]!.y - before[1]!.y };
    expect(Math.abs(d0.x) + Math.abs(d0.y)).toBeGreaterThan(10);
    expect(Math.abs(d0.x - d1.x)).toBeLessThan(1.5);
    expect(Math.abs(d0.y - d1.y)).toBeLessThan(1.5);
    expect(Math.abs(after[2]!.x - before[2]!.x)).toBeLessThan(1.5);
    await expect(page.getByTestId('history-size')).toHaveText(String(hist + 1));
    await expect(selected(page)).toHaveCount(2); // grupul rămâne selectat

    // tastatură pe grup
    await page.keyboard.press('Control+d');
    await expect(objects2d(page)).toHaveCount(5);
    await expect(selected(page)).toHaveCount(2); // copiile sunt selectate
    await page.keyboard.press('Delete');
    await expect(objects2d(page)).toHaveCount(3);
    await page.getByTestId('undo').click(); // un pas readuce ambele copii
    await expect(objects2d(page)).toHaveCount(5);

    // Ctrl+A selectează tot; Escape golește
    await page.keyboard.press('Control+a');
    await expect(selected(page)).toHaveCount(5);
    await page.keyboard.press('Escape');
    await expect(selected(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
