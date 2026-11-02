import { expect, test } from '@playwright/test';

// Pagina „Despre” din build-ul static: se ajunge din lista de proiecte, se întoarce și nu face cereri către alte origini.
test('Despre: din lista de proiecte, fără cereri externe, cu întoarcere', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!/^https?:$/.test(u.protocol)) return;
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') external.push(r.url());
  });

  await page.goto('./');
  await page.getByTestId('about-link').click();
  await expect(page.getByTestId('about-page')).toBeVisible();
  await expect(page.getByTestId('about-license-summary')).toContainText('pachete');
  await page.getByTestId('about-packages').locator('summary').click();
  await expect(page.getByTestId('about-packages').locator('li').first()).toBeVisible();

  await page.getByTestId('about-back').click();
  await expect(page).not.toHaveURL(/despre/);
  expect(external).toEqual([]);
});
