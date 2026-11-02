import { expect, test, type Page } from '@playwright/test';

// F-12 (audit), în build-ul static și în cele trei browsere: navigare cu tastatura, scurtături controlabile, anunțarea
// selecției pentru cititoare de ecran, preferințe de sistem (mișcare redusă, contrast forțat).

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
      errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
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

test.describe('accesibilitate (build static)', () => {
  test('tab-urile se navighează cu săgeți (focusul real se mută), iar tastele de pe un buton nu acționează asupra planului', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Tastatură');
    await page.getByTestId('room-form-submit').click();

    // tab-uri: focus pe tabul activ, apoi săgeți
    await page.getByTestId('mode-2d').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('mode-3d')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('mode-3d')).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByTestId('mode-budget')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('mode-2d')).toBeFocused();
    await expect(page.getByTestId('plan-editor')).toBeVisible();

    // focus pe un buton al barei de unelte: W și săgețile nu mută unealta, nici planul
    const panBefore = await page.getByTestId('plan-svg').getAttribute('data-pan-x');
    await page.getByTestId('zoom-fit').focus();
    await page.keyboard.press('w');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.getByTestId('plan-svg').getAttribute('data-pan-x')).toBe(panBefore);

    // dar cu focus pe zona planului, aceleași taste funcționează
    await page.getByTestId('plan-box').focus();
    await page.keyboard.press('w');
    await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('v');
    await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });

  test('comutatorul „Scurtături de tastă” oprește tastele imprimabile și se păstrează la reîncărcare', async ({
    page,
  }) => {
    await createProject(page, 'Scurtături');
    await page.getByTestId('room-form-submit').click();
    await page.getByTestId('plan-box').focus();
    await page.keyboard.press('w');
    await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');

    await page.getByTestId('shortcuts-toggle').uncheck();
    await page.getByTestId('plan-box').focus();
    await page.keyboard.press('w');
    await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await expect(page.getByTestId('plan-editor')).toBeVisible();
    await expect(page.getByTestId('shortcuts-toggle')).not.toBeChecked();
    await page.getByTestId('shortcuts-toggle').check();
    await page.getByTestId('plan-box').focus();
    await page.keyboard.press('w');
    await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
  });

  test('selecția se anunță în regiunea aria-live; o cameră din listă se alege cu tastatura și se rotește cu R', async ({
    page,
  }) => {
    await createProject(page, 'Anunț');
    await page.getByTestId('room-form-submit').click();
    const live = page.getByTestId('selection-announcer');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    // formularul a creat camera și a selectat-o
    await expect(live).toContainText('Cameră selectată');
    await expect(live).toContainText('12 m²');
    await page.getByTestId('plan-box').focus();
    await page.keyboard.press('Escape'); // deselectează
    await expect(live).toHaveText('Nimic selectat.');
    // lista de camere: element focalizabil, activat cu Enter
    const item = page.locator('[data-testid^="room-list-item-"]').first();
    await item.focus();
    await page.keyboard.press('Enter');
    await expect(live).toContainText('Cameră selectată');
    // rotire cu R de pe zona planului (tastatură): dimensiunile se inversează
    await page.getByTestId('plan-box').focus();
    await page.keyboard.press('r');
    await expect(page.getByTestId('room-width')).toHaveValue('3000');
  });

  test('zona planului are un contur de focus vizibil la navigarea cu tastatura', async ({
    page,
  }) => {
    await createProject(page, 'Focus');
    await page.getByTestId('plan-box').focus();
    await page.keyboard.press('ArrowDown'); // o tastă apăsată face focusul „din tastatură” (focus-visible)
    const outline = await page
      .getByTestId('plan-box')
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('mișcarea redusă (preferința sistemului) dezactivează tranzițiile', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await createProject(page, 'Mișcare redusă');
    const duration = await page
      .getByTestId('tool-select')
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    // 0,01 ms (sau 0 secunde, după rotunjirea motorului)
    expect(parseFloat(duration)).toBeLessThanOrEqual(0.001);
  });

  test('contrastul forțat marchează starea aleasă cu un contur (nu doar cu culoarea)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'forced-colors se poate emula doar în Chromium');
    await createProject(page, 'Contrast forțat');
    await page.emulateMedia({ forcedColors: 'active' });
    const style = await page
      .getByTestId('mode-2d')
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(style).toBe('solid');
  });
});
