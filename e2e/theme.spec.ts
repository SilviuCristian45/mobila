import { expect, test } from '@playwright/test';

// Tema, în build-ul static: „Sistem” urmează preferința browserului, alegerea se păstrează după reîncărcare și se aplică
// înainte de prima afișare (fără clipire în tema greșită).
const theme = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.dataset.theme);
const pageBg = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('tema', () => {
  test.use({ colorScheme: 'dark' });
  test('sistem întunecat → întunecată; alegerea „Luminoasă” se păstrează după reîncărcare', async ({
    page,
  }) => {
    await page.goto('./');
    expect(await theme(page)).toBe('dark');
    const dark = await pageBg(page);
    await page.getByTestId('theme-select').selectOption('light');
    expect(await theme(page)).toBe('light');
    expect(await pageBg(page)).not.toBe(dark);
    await page.reload();
    expect(await theme(page)).toBe('light');
    await expect(page.getByTestId('theme-select')).toHaveValue('light');
    await page.getByTestId('theme-select').selectOption('system');
    expect(await theme(page)).toBe('dark');
  });

  test('pagina Despre respectă tema aleasă', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('theme-select').selectOption('light');
    await page.getByTestId('about-link').click();
    await expect(page.getByTestId('about-page')).toBeVisible();
    expect(await theme(page)).toBe('light');
  });
});
