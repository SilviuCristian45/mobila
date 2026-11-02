import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Import de proiecte din fișiere (F-02 din auditul tehnic), în build-ul static și în cele trei browsere: circuitul complet
// export → import, fișiere respinse cu mesaj clar, drag & drop; proiectele existente nu se ating.

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

const cards = (page: Page) => page.getByTestId('project-card');

test.describe('import de proiecte (build static)', () => {
  test('export din editor → import în tablou: copie nouă, proiectul original neatins; apoi fișiere respinse cu mesaj', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await createProject(page, 'Apartament');
    await page.getByTestId('room-form-submit').click(); // 4000 × 3000
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');

    // export copie (fișier real)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportă copie' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('apartament.roomcraft.json');
    const path = testInfo.outputPath('apartament.roomcraft.json');
    await download.saveAs(path);

    // tablou: importăm fișierul
    await page.getByTestId('back-to-dashboard').click();
    await expect(cards(page)).toHaveCount(1);
    await page.getByTestId('import-input').setInputFiles(path);
    const ok = page.getByTestId('import-notice-success');
    await expect(ok).toContainText('Am importat „Apartament”');
    await expect(ok).toContainText('copie nouă'); // același identificator: copie, originalul nu se atinge
    await expect(cards(page)).toHaveCount(2);

    // copia se deschide cu aceeași cameră
    await cards(page)
      .first()
      .getByRole('link', { name: /Deschide/ })
      .click();
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');
    await page.getByTestId('back-to-dashboard').click();

    // fișiere respinse: nimic nu se creează, mesajele rămân
    const bad = testInfo.outputPath('stricat.json');
    const fs = await import('node:fs/promises');
    await fs.writeFile(bad, '{ nu e json');
    const other = testInfo.outputPath('altceva.json');
    await fs.writeFile(other, '{"a":1}');
    const newer = testInfo.outputPath('nou.roomcraft.json');
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { formatVersion: number };
    parsed.formatVersion = 99;
    await fs.writeFile(newer, JSON.stringify(parsed));
    await page.getByTestId('import-input').setInputFiles([bad, other, newer]);
    const results = page.getByTestId('import-results');
    await expect(results).toContainText('nu e JSON valid');
    await expect(results).toContainText('Nu e un fișier RoomCraft');
    await expect(results).toContainText('versiune mai nouă a aplicației');
    await expect(cards(page)).toHaveCount(2);
    await page.getByTestId('import-dismiss').click();
    await expect(page.getByTestId('import-results')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('drag & drop pe pagină importă fișierul (cu indicație vizuală)', async ({
    page,
  }, testInfo) => {
    await createProject(page, 'Tras');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportă copie' }).click(),
    ]);
    const path = testInfo.outputPath('tras.roomcraft.json');
    await download.saveAs(path);
    await page.getByTestId('back-to-dashboard').click();
    await expect(cards(page)).toHaveCount(1);

    // eveniment de drop sintetic cu un fișier real (Playwright nu poate trage fișiere din sistemul de operare)
    const text = readFileSync(path, 'utf8');
    const dt = await page.evaluateHandle((t) => {
      const d = new DataTransfer();
      d.items.add(new File([t], 'tras.roomcraft.json', { type: 'application/json' }));
      return d;
    }, text);
    await page.getByTestId('projects-dropzone').dispatchEvent('dragover', { dataTransfer: dt });
    await expect(page.getByTestId('drop-overlay')).toBeVisible();
    await page.getByTestId('projects-dropzone').dispatchEvent('drop', { dataTransfer: dt });
    await expect(page.getByTestId('import-notice-success')).toContainText('Am importat „Tras”');
    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByTestId('drop-overlay')).toHaveCount(0);
  });
});
