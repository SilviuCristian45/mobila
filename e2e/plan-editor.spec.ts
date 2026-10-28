import { expect, test, type Page } from '@playwright/test';

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

const saveStatus = (page: Page) => page.getByTestId('save-status');
const roomArea = (page: Page) => page.locator('[data-testid^="room-area-"]');

/** Centrul (în pixeli de pagină) al nodului din colțul dreapta-sus al planului. */
async function topRightNode(page: Page): Promise<{ x: number; y: number }> {
  const boxes = await page.locator('circle[data-testid^="node-"]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  return boxes.reduce((best, b) => (b.x - b.y > best.x - best.y ? b : best));
}

test.describe('editor 2D (build static)', () => {
  test('cameră din formular → plan cu suprafață; tragere de nod = un pas de istoric; undo; persistă după reîncărcare', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Plan 2D');
    await expect(page.getByTestId('plan-empty')).toBeVisible();

    await page.getByTestId('room-form-submit').click(); // 4000 × 3000 implicit
    await expect(page.getByTestId('panel-room')).toBeVisible();
    await expect(roomArea(page)).toHaveText('12 m²');
    await expect(page.getByTestId('history-size')).toHaveText('1');
    await expect(page.getByTestId('plan-svg')).toHaveAttribute('data-valid', 'true');

    // tragere reală cu mouse-ul: documentul se scrie o singură dată, la eliberare
    const from = await topRightNode(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + i * 10, from.y, { steps: 2 });
    await expect(page.getByTestId('history-size')).toHaveText('1'); // încă niciun commit
    await page.mouse.up();
    await expect(page.getByTestId('history-size')).toHaveText('2');
    await expect(roomArea(page)).not.toHaveText('12 m²');

    await page.getByTestId('undo').click();
    await expect(roomArea(page)).toHaveText('12 m²');
    await page.getByTestId('redo').click();
    await expect(roomArea(page)).not.toHaveText('12 m²');
    const moved = await roomArea(page).textContent();

    await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
    await page.reload();
    await expect(page.getByTestId('plan-svg')).toBeVisible();
    await expect(roomArea(page)).toHaveText(moved!);
    expect(errors).toEqual([]);
  });

  test('ușă și fereastră: se adaugă, se repoziționează din câmp, se șterg cu tastatura', async ({
    page,
  }) => {
    await createProject(page, 'Goluri');
    await page.getByTestId('room-form-submit').click();
    await page.locator('polygon[data-testid^="wall-"]').first().click();
    await expect(page.getByTestId('panel-wall')).toBeVisible();
    await page.getByTestId('add-door').click();
    await expect(page.locator('[data-testid^="opening-"][data-type="door"]')).toHaveCount(1);
    await expect(page.getByTestId('panel-opening')).toBeVisible();
    const offset = page.getByTestId('opening-offset');
    await offset.fill('1000');
    await offset.press('Enter');
    await expect(offset).toHaveValue('1000');
    await page.getByTestId('opening-nudge-forward').click();
    await expect(offset).toHaveValue('1100');
    // în câmp, Delete nu șterge golul
    await offset.focus();
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-testid^="opening-"][data-type="door"]')).toHaveCount(1);
    // în afara câmpurilor, Delete șterge
    // clic pe golul propriu-zis (centrul grupului ar nimeri camera de sub arcul ușii); mută și focusul din câmp pe plan
    await page.locator('[data-testid^="opening-"][data-type="door"] > polygon').click();
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-testid^="opening-"][data-type="door"]')).toHaveCount(0);
  });

  test('ecran îngust: controalele rămân utilizabile, fără defilare orizontală a paginii', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await createProject(page, 'Mobil');
    await page.getByTestId('room-form-submit').click();
    await expect(roomArea(page)).toHaveText('12 m²');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId('zoom-in').click();
    await page.getByTestId('tool-wall').click();
    await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
  });
});
