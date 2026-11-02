import { expect, test } from '@playwright/test';

// Rulat doar cu anteturile din vercel.json active (`pnpm e2e:csp`): fluxurile principale (proiect, plan, 3D, buget + XLSX)
// nu trebuie să încalce Content-Security-Policy și nu fac cereri către alte origini.
test.skip(process.env.RC_VERCEL_HEADERS !== '1', 'necesită RC_VERCEL_HEADERS=1');

test('fluxurile principale rulează sub CSP-ul din vercel.json, fără încălcări', async ({
  page,
}) => {
  const violations: string[] = [];
  const external: string[] = [];
  // încălcările se raportează imediat către test (nu se pierd la navigarea între pagini)
  await page.exposeFunction('__reportCsp', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __reportCsp: (v: string) => void }).__reportCsp(
        `${e.violatedDirective} ${e.blockedURI}`,
      ),
    );
  });
  page.on('console', (m) => {
    if (/content security policy|refused to/i.test(m.text())) violations.push(m.text());
  });
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && u.hostname !== 'localhost') external.push(r.url());
  });

  await page.goto('./');
  const res = await page.request.get('./');
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'");

  await page
    .getByRole('button', { name: /^(\+ Proiect nou|Creează primul proiect)$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Proiect nou' });
  await dialog.getByLabel('Numele proiectului').fill('CSP');
  await dialog.getByRole('button', { name: 'Creează' }).click();
  await expect(page.getByTestId('plan-editor')).toBeVisible();
  await page.getByTestId('room-form-submit').click();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');

  await page.getByTestId('mode-3d').click();
  await expect(
    page.locator('[data-testid="viewer3d-box"] canvas').or(page.getByTestId('viewer3d-nowebgl')),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('mode-budget').click();
  await expect(page.getByTestId('budget-panel')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('budget-export-xlsx').click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);

  await page.goto('./despre/');
  await expect(page.getByTestId('about-page')).toBeVisible();

  expect(violations).toEqual([]);
  expect(external).toEqual([]);
});
