import { expect, test, type Page } from '@playwright/test';

// Memento periodic pentru copia de siguranță, în build-ul static și în cele trei browsere: apare doar pentru un proiect cu
// conținut, cu copie veche și modificări ulterioare; acțiunile lui se păstrează după reîncărcare.

async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('./');
  await page
    .getByRole('button', { name: /^(\+ Proiect nou|Creează primul proiect)$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Proiect nou' });
  await dialog.getByLabel('Numele proiectului').fill(name);
  await dialog.getByRole('button', { name: 'Creează' }).click();
  await expect(page.getByTestId('plan-editor')).toBeVisible();
  return new URL(page.url()).searchParams.get('p')!;
}

const reminder = (page: Page) => page.getByTestId('backup-reminder');
async function setRecord(page: Page, id: string, record: object): Promise<void> {
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key!, value!),
    [`rc:backup:${id}`, JSON.stringify(record)],
  );
}
const OLD = () => ({ lastExportAt: new Date(Date.now() - 30 * 86_400_000).toISOString() });

test.describe('memento copie de siguranță (build static)', () => {
  test('proiect nou și gol: nicio sugestie; cu conținut și copie veche: apare, iar „Mai târziu” se păstrează după reîncărcare', async ({
    page,
  }) => {
    const id = await createProject(page, 'Memento');
    await expect(reminder(page)).toHaveCount(0);
    await page.getByTestId('room-form-submit').click();
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await expect(reminder(page)).toHaveCount(0); // proiect proaspăt: nimic de amintit

    await setRecord(page, id, OLD());
    await page.reload();
    await expect(page.getByTestId('plan-editor')).toBeVisible();
    await expect(reminder(page)).toContainText('Ultima copie de siguranță are');
    await expect(reminder(page)).toContainText('doar în acest browser');

    await page.getByTestId('backup-reminder-later').click();
    await expect(reminder(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('plan-editor')).toBeVisible();
    await expect(reminder(page)).toHaveCount(0); // amânat
  });

  test('„Exportă copie acum” descarcă un fișier real și oprește mementoul; „Nu mai întreba” rămâne după reîncărcare', async ({
    page,
  }) => {
    const id = await createProject(page, 'Export memento');
    await page.getByTestId('room-form-submit').click();
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await setRecord(page, id, OLD());
    await page.reload();
    await expect(reminder(page)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('backup-reminder-export').click(),
    ]);
    expect(download.suggestedFilename()).toBe('export-memento.roomcraft.json');
    await expect(reminder(page)).toHaveCount(0);
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      `rc:backup:${id}`,
    );
    expect(Date.now() - Date.parse(saved.lastExportAt)).toBeLessThan(120_000);
    await page.reload();
    await expect(reminder(page)).toHaveCount(0); // copie proaspătă

    await setRecord(page, id, { ...OLD(), never: true });
    await page.reload();
    await expect(page.getByTestId('plan-editor')).toBeVisible();
    await expect(reminder(page)).toHaveCount(0); // „nu mai întreba”
  });
});
