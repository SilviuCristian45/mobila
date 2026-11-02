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

/** Fracția de pixeli care diferă între canvas-ul curent și o captură (`dataUrl`): robust la zgomot subpixel de randare. */
const diffFromFrame = (page: Page, dataUrl: string): Promise<number> =>
  page.locator('[data-testid="viewer3d-box"] canvas').evaluate(async (c, url) => {
    const src = c as HTMLCanvasElement;
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = Math.min(src.width, img.width);
    const h = Math.min(src.height, img.height);
    const read = (draw: (ctx: CanvasRenderingContext2D) => void) => {
      const t = document.createElement('canvas');
      t.width = w;
      t.height = h;
      const ctx = t.getContext('2d')!;
      draw(ctx);
      return ctx.getImageData(0, 0, w, h).data;
    };
    const a = read((ctx) => ctx.drawImage(src, 0, 0));
    const b = read((ctx) => ctx.drawImage(img, 0, 0));
    let n = 0;
    for (let i = 0; i < a.length; i += 4)
      if (
        Math.abs(a[i]! - b[i]!) +
          Math.abs(a[i + 1]! - b[i + 1]!) +
          Math.abs(a[i + 2]! - b[i + 2]!) >
        24
      )
        n++;
    return n / (w * h);
  }, dataUrl);

/** Cadrul canvas-ului după ce s-a stabilizat (două cadre identice la rând): camera poate încă să se așeze după un gest. */
const settledFrame = async (page: Page): Promise<string> => {
  let prev = await frame(page);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const cur = await frame(page);
    if (cur === prev) return cur;
    prev = cur;
  }
  return prev;
};

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

  test('vederi: „De sus” și „Pereți tăiați” schimbă imaginea, „Centrează pe selecție” mută camera pe obiect, resetul revine; contextul WebGL pierdut se vede și se reface', async ({
    page,
    browserName,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Vederi 3D');
    await page.getByTestId('room-form-submit').click(); // 4000 × 3000
    // un obiect în cameră, selectat (selecția rămâne la trecerea în 3D)
    await page.getByTestId('catalog-toggle').click();
    await expect(async () => {
      await page.getByTestId('catalog-item-living.sofa-3').click();
      await expect(page.locator('g[data-testid^="object-"]')).toHaveCount(1, { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await page.getByTestId('mode-3d').click();

    const noWebgl = page.getByTestId('viewer3d-nowebgl');
    await expect(box(page).locator('canvas').or(noWebgl)).toBeVisible({ timeout: 20_000 });
    test.skip(await noWebgl.isVisible(), 'fără WebGL în acest motor headless');
    await expect
      .poll(() =>
        box(page)
          .locator('canvas')
          .evaluate((c) => (c as HTMLCanvasElement).width),
      )
      .toBeGreaterThan(300); // implicit 300×150 până la dimensionare
    await expect.poll(() => paintedRatio(page)).toBeGreaterThan(0.05);
    const persp = await settledFrame(page);

    // de sus: altă imagine, tot planul vizibil
    await page.getByTestId('viewer3d-top').click();
    await expect.poll(() => frame(page)).not.toBe(persp);
    await expect.poll(() => paintedRatio(page)).toBeGreaterThan(0.05);
    const top = await settledFrame(page);

    // pereți tăiați: imaginea de sus se schimbă (pereții scad), iar comutatorul rămâne apăsat
    await page.getByTestId('viewer3d-cutaway').click();
    await expect(page.getByTestId('viewer3d-cutaway')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => frame(page)).not.toBe(top);
    await page.getByTestId('viewer3d-cutaway').click();
    await expect.poll(() => diffFromFrame(page, top)).toBeLessThan(0.01); // înapoi: aceeași imagine (tolerant la zgomot subpixel)

    // resetul revine la perspectivă
    await page.getByTestId('viewer3d-reset').click();
    await expect.poll(() => diffFromFrame(page, persp)).toBeLessThan(0.01);

    // centrare pe obiectul selectat: camera se mută
    await expect(page.getByTestId('viewer3d-focus')).toBeEnabled();
    await page.getByTestId('viewer3d-focus').click();
    await expect.poll(() => frame(page)).not.toBe(persp);

    // pierderea reală a contextului WebGL: mesaj, apoi refacere (extensia se păstrează: după pierdere `getExtension` dă null)
    const canLose = await box(page)
      .locator('canvas')
      .evaluate((c) => {
        const el = c as HTMLCanvasElement;
        const gl = el.getContext('webgl2') ?? el.getContext('webgl');
        const ext = gl?.getExtension('WEBGL_lose_context') ?? null;
        (window as unknown as { __lose?: WEBGL_lose_context | null }).__lose = ext;
        return !!ext;
      });
    test.skip(!canLose, `${browserName}: fără WEBGL_lose_context`);
    await page.evaluate(() =>
      (window as unknown as { __lose: WEBGL_lose_context }).__lose.loseContext(),
    );
    await expect(page.getByTestId('viewer3d-context-lost')).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext(),
    );
    await expect(page.getByTestId('viewer3d-context-lost')).toHaveCount(0);
    await expect.poll(() => paintedRatio(page)).toBeGreaterThan(0.05); // scena e din nou desenată
    // proiectul nu a fost afectat
    await page.getByTestId('mode-2d').click();
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');
    // WebKit avertizează (ca eroare de consolă) la ștergerea resurselor GPU ale contextului pierdut intenționat
    expect(errors.filter((e) => !/object does not belong to this context/.test(e))).toEqual([]);
  });
});
