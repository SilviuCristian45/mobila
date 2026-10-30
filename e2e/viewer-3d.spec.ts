import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    // fără WebGL (unele motoare headless) canvas-ul nici nu se încearcă; erorile reale rămân vizibile aici
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

const box = (page: Page) => page.getByTestId('viewer3d-box');
const frame = (page: Page) =>
  page
    .locator('[data-testid="viewer3d-box"] canvas')
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());

/** Procentul de pixeli diferiți de culoarea de fundal (#f5f5f4) în canvas. */
const paintedRatio = (page: Page) =>
  page.locator('[data-testid="viewer3d-box"] canvas').evaluate((c) => {
    const src = c as HTMLCanvasElement;
    const t = document.createElement('canvas');
    t.width = src.width;
    t.height = src.height;
    const ctx = t.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(0, 0, t.width, t.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (Math.abs(d[i]! - 0xf5) + Math.abs(d[i + 1]! - 0xf5) + Math.abs(d[i + 2]! - 0xf4) > 12)
        n++;
    return n / (t.width * t.height);
  });

test.describe('vizualizare 3D (build static)', () => {
  test('2D → 3D → 2D păstrează proiectul; 3D se actualizează după editarea în 2D; navigare cu mouse-ul și reset', async ({
    page,
    browserName,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Trei D');
    await page.getByTestId('room-form-submit').click(); // 4000 × 3000
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');

    await page.getByTestId('mode-3d').click();
    await expect(page.getByTestId('plan-editor')).toHaveCount(0);
    await expect(page.getByTestId('project-title')).toHaveText('Trei D'); // proiectul rămâne activ

    const noWebgl = page.getByTestId('viewer3d-nowebgl');
    await expect(box(page).locator('canvas').or(noWebgl)).toBeVisible({ timeout: 20_000 });
    if (await noWebgl.isVisible()) {
      // motor fără WebGL în headless: mesajul explicativ e comportamentul corect; 2D rămâne utilizabil
      test.skip(browserName === 'chromium', 'Chromium trebuie să ofere WebGL (swiftshader)');
      await page.getByTestId('mode-2d').click();
      await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');
      expect(errors).toEqual([]);
      return;
    }

    await expect(box(page)).toHaveAttribute('data-walls', '4');
    await expect(box(page)).toHaveAttribute('data-floors', '1');
    await expect.poll(() => paintedRatio(page)).toBeGreaterThan(0.05);
    const initial = await frame(page);

    // orbitare (click stânga + tragere)
    const b = (await box(page).boundingBox())!;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // gestul poate fi pierdut sub încărcare (WebKit): se reîncearcă până când imaginea se schimbă
    await expect(async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 120, cy + 30, { steps: 8 });
      await page.mouse.up();
      expect(await frame(page)).not.toBe(initial);
    }).toPass({ timeout: 15_000 });
    // zoom (roata) și deplasare (click dreapta)
    const rotated = await frame(page);
    await page.mouse.wheel(0, -400);
    await expect.poll(() => frame(page)).not.toBe(rotated);
    const zoomed = await frame(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx - 80, cy - 40, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await expect.poll(() => frame(page)).not.toBe(zoomed);

    // resetarea readuce vederea inițială încadrată
    await page.getByTestId('viewer3d-reset').click();
    await expect.poll(() => frame(page)).toBe(initial);

    // înapoi în 2D, adaug o ușă, apoi 3D: peretele cu gol se segmentează (1 → 3 prisme)
    await page.getByTestId('mode-2d').click();
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');
    await page.locator('polygon[data-testid^="wall-"]').first().click();
    await page.getByTestId('add-door').click();
    await expect(page.locator('[data-testid^="opening-"][data-type="door"]')).toHaveCount(1);
    await page.getByTestId('mode-3d').click();
    await expect(box(page)).toHaveAttribute('data-walls', '6');

    // autosave-ul continuă: după reîncărcare, proiectul (cu ușa) e acolo
    await page.getByTestId('mode-2d').click();
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await page.reload();
    await expect(page.locator('[data-testid^="opening-"][data-type="door"]')).toHaveCount(1);
    await page.getByTestId('mode-3d').click();
    await expect(box(page)).toHaveAttribute('data-walls', '6');
    expect(errors).toEqual([]);
  });

  test('proiect fără pereți: mesaj explicativ, nu un canvas gol', async ({ page }) => {
    await createProject(page, 'Gol');
    await page.getByTestId('mode-3d').click();
    await expect(
      page.getByTestId('viewer3d-empty').or(page.getByTestId('viewer3d-nowebgl')),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('viewer3d-reset')).toBeDisabled();
  });
});
