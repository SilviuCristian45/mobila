import { expect, test, type Page } from '@playwright/test';

// Etapa 7a, în build-ul static și în cele trei browsere: camere noi trase din paletă pe plan (cu lipire), mutarea unei
// camere întregi cu mouse-ul și planul vizibil fără derulare pe un ecran de laptop.

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

async function dragPreset(page: Page, presetId: string, to: { x: number; y: number }) {
  const chip = await page.getByTestId(`room-preset-${presetId}`).boundingBox();
  await page.mouse.move(chip!.x + chip!.width / 2, chip!.y + chip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  return async () => {
    await page.mouse.up();
  };
}

test.describe('camere prin drag & drop (build static)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('trage Living și Bucătărie din paletă: se creează cu nume și arie, se alipesc, planul rămâne valid; mutare cu mouse-ul; undo', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await createProject(page, 'Drag camere');
    const box = (await page.getByTestId('plan-box').boundingBox())!;

    // planul și paleta sunt în ecran fără derulare
    const palette = (await page.getByTestId('room-palette').boundingBox())!;
    expect(palette.y + palette.height).toBeLessThan(720);
    expect(box.y).toBeLessThan(720);

    // 1) Living în stânga-centru
    const dropAt = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.5 };
    const release1 = await dragPreset(page, 'living', dropAt);
    await expect(page.getByTestId('room-ghost')).toHaveAttribute('data-valid', 'true');
    await release1();
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('20 m²');
    await expect(page.getByTestId('history-size')).not.toHaveText('0');

    // 2) Bucătărie lângă Living (cursorul la dreapta lui): se alipește, fără probleme geometrice
    const living = (await page.locator('polygon').first().boundingBox())!;
    const zoom = Number(await page.getByTestId('plan-svg').getAttribute('data-zoom'));
    // fantoma e centrată pe cursor: stânga ei exterioară cade la ~60 mm de dreapta exterioară a Living-ului
    // (Bucătăria: 3000 mm lățime interioară; pereți de 100 mm)
    const target = {
      x: living.x + living.width + (1500 + 100 + 100 + 60) * zoom,
      y: living.y + (1500 + 40) * zoom,
    };
    const release2 = await dragPreset(page, 'kitchen', target);
    await expect(page.getByTestId('room-ghost')).toHaveAttribute('data-valid', 'true');
    await release2();
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveCount(2);
    await expect(page.getByTestId('plan-invalid')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('plan-camere.png') });

    // 3) camerele împart un perete: bucătăria se mută întreagă, iar nodurile comune o urmează (Living-ul se deformează);
    //    un singur pas de istoric, planul rămâne valid; undo readuce totul
    const hist = Number(await page.getByTestId('history-size').textContent());
    const selectedRoom = page.locator('g[data-testid^="room-"][data-selected="true"]').first();
    const sb = (await selectedRoom.locator('polygon').boundingBox())!;
    const grab = { x: sb.x + sb.width * 0.25, y: sb.y + sb.height * 0.25 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 60, grab.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('history-size')).toHaveText(String(hist + 1));
    await expect(page.getByTestId('plan-invalid')).toHaveCount(0);
    const after = (await selectedRoom.locator('polygon').boundingBox())!;
    expect(after.x - sb.x).toBeGreaterThan(20);
    await page.getByTestId('undo').click();
    const back = (await selectedRoom.locator('polygon').boundingBox())!;
    expect(Math.abs(back.x - sb.x)).toBeLessThan(2);
    expect(errors).toEqual([]);
  });

  test('cameră singură: se mută cu mouse-ul (un pas), se rotește cu R și cu butoanele (dimensiunile se inversează), undo; R rotește camera și în timpul plasării', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Rotire');
    await page.getByTestId('room-form-submit').click(); // 4000 × 3000
    await expect(page.getByTestId('room-width')).toHaveValue('4000');
    const room = page.locator('g[data-testid^="room-"][data-selected="true"]').first();
    await expect(room).toBeVisible();

    // mutare
    const hist = Number(await page.getByTestId('history-size').textContent());
    const sb = (await room.locator('polygon').boundingBox())!;
    const grab = { x: sb.x + sb.width * 0.25, y: sb.y + sb.height * 0.25 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x, grab.y + 80, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('history-size')).toHaveText(String(hist + 1));
    await page.getByTestId('undo').click();

    // rotire: R și buton; dimensiunile se inversează, aria rămâne
    await page.getByTestId('plan-svg').focus();
    await page.keyboard.press('r');
    await expect(page.getByTestId('room-width')).toHaveValue('3000');
    await expect(page.getByTestId('room-depth')).toHaveValue('4000');
    await expect(page.locator('[data-testid^="room-list-area-"]')).toHaveText('12 m²');
    await page.getByTestId('room-rotate-ccw').click();
    await expect(page.getByTestId('room-width')).toHaveValue('4000');
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('room-width')).toHaveValue('3000');

    // în timpul plasării, R inversează dimensiunile camerei din paletă (fantoma)
    const box = (await page.getByTestId('plan-box').boundingBox())!;
    const chip = (await page.getByTestId('room-preset-bedroom').boundingBox())!;
    await page.mouse.move(chip.x + 5, chip.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + box.height - 90, { steps: 8 });
    await expect(page.getByTestId('room-ghost-label')).toContainText('400 cm × 350 cm');
    await page.keyboard.press('r');
    await expect(page.getByTestId('room-ghost-label')).toContainText('350 cm × 400 cm');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(errors).toEqual([]);
  });

  test('eliberare în afara planului nu creează nimic; Esc anulează o cameră armată', async ({
    page,
  }) => {
    await createProject(page, 'Anulare');
    const before = await page.locator('[data-testid^="room-area-"]').count();
    const chip = (await page.getByTestId('room-preset-bathroom').boundingBox())!;
    await page.mouse.move(chip.x + 5, chip.y + 5);
    await page.mouse.down();
    await page.mouse.move(chip.x + 40, chip.y + 4, { steps: 5 }); // rămâne pe paletă, nu pe plan
    await page.mouse.up();
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveCount(before);
    await expect(page.getByTestId('room-ghost')).toHaveCount(0);

    await page.getByTestId('room-preset-bathroom').click(); // armează
    await expect(page.getByTestId('room-preset-bathroom')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('room-preset-bathroom')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveCount(before);
  });

  test('lista camerelor arată aria; tragerea mânerului de est o schimbă (lista și panoul rămân în acord); undo', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Mânere');
    await page.getByTestId('room-form-submit').click(); // 4000 × 3000 = 12 m²
    const item = page.locator('[data-testid^="room-list-item-"]');
    await expect(item).toHaveCount(1);
    await expect(page.locator('[data-testid^="room-list-area-"]')).toHaveText('12 m²');
    await expect(page.getByTestId('room-list-total')).toContainText('12 m²');

    await item.click();
    const handle = page.locator('[data-testid^="room-handle-"][data-testid$="-e"]');
    await expect(handle).toBeVisible();
    const zoom = Number(await page.getByTestId('plan-svg').getAttribute('data-zoom'));
    const hb = (await handle.boundingBox())!;
    const hist = Number(await page.getByTestId('history-size').textContent());
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 1000 * zoom, hb.y + hb.height / 2, { steps: 10 });
    await page.mouse.up();
    // ~ +1000 mm pe lățime: 5000 × 3000 = 15 m² (grila poate rotunji cu o treaptă)
    await expect(page.locator('[data-testid^="room-list-area-"]')).not.toHaveText('12 m²');
    await expect(page.getByTestId('room-width')).not.toHaveValue('4000');
    await expect(page.getByTestId('history-size')).toHaveText(String(hist + 1));
    const area = await page.locator('[data-testid^="room-list-area-"]').innerText();
    await expect(page.getByTestId('room-list-total')).toHaveText(`Total ${area}`);

    await page.getByTestId('undo').click();
    await expect(page.locator('[data-testid^="room-list-area-"]')).toHaveText('12 m²');
    expect(errors).toEqual([]);
  });
});
