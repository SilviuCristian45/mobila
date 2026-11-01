import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

// Etapa 6a, în build-ul static și în cele trei browsere: tabelul de buget, editarea, persistența, linia manuală legată de
// aria camerei, exportul CSV și marcarea prețurilor demonstrative (în tabel și în fișier).

interface FflateLike {
  unzipSync(data: Uint8Array): Record<string, Uint8Array>;
  strFromU8(data: Uint8Array): string;
}
// `fflate` e dependența bibliotecii XLSX (nu a proiectului): se rezolvă din locul ei
const { unzipSync, strFromU8 } = createRequire(require.resolve('write-excel-file/node'))(
  'fflate',
) as FflateLike;

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

const objects2d = (page: Page) => page.locator('g[data-testid^="object-"]');
const priceInputs = (page: Page) => page.locator('[data-testid^="budget-price-object:"]');
const demoBadges = (page: Page) => page.locator('[data-testid^="budget-demo-"]');

async function openBudget(page: Page): Promise<void> {
  await page.getByTestId('mode-budget').click();
  await expect(page.getByTestId('budget-panel')).toBeVisible();
}

/** „1.234,50 RON” → 123450 (bani). */
const minorOf = (text: string): number =>
  Math.round(Number(text.replace(/[^\d,]/g, '').replace(',', '.')) * 100);

/** Parser CSV minimal (separator `;`, ghilimele RFC 4180). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  return rows;
}

test.describe('buget (build static)', () => {
  test('două canapele → buget: marcaj demonstrativ, editare de preț, linie manuală, persistență după reîncărcare, export CSV coerent cu tabelul', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await createProject(page, 'Buget E2E');
    await page.getByTestId('room-form-submit').click();
    await expect(page.locator('[data-testid^="room-area-"]')).toHaveText('12 m²');
    await page.getByTestId('catalog-toggle').click();
    // clicul poate fi pierdut sub încărcare (hidratare): se reîncearcă până apare obiectul
    await expect(async () => {
      await page.getByTestId('catalog-item-living.sofa-3').click();
      await expect(objects2d(page)).toHaveCount(1, { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await page.getByTestId('catalog-item-living.sofa-3').click();
    await expect(objects2d(page)).toHaveCount(2);

    await openBudget(page);
    await expect(page.getByTestId('budget-disclaimer')).toContainText('Estimare orientativă');
    await expect(priceInputs(page)).toHaveCount(2);
    await expect(demoBadges(page)).toHaveCount(2); // ambele prețuri vin din catalog (demonstrative)
    const inputs = priceInputs(page);
    const firstKey = (await inputs.first().getAttribute('data-testid'))!.replace(
      'budget-price-',
      '',
    );
    const catalogPrice = await inputs.first().inputValue();

    // editez prețul primei canapele: brut = 1.999,99 (preț cu TVA)
    await inputs.first().fill('1999,99');
    await inputs.first().press('Enter');
    await expect(page.getByTestId(`budget-total-${firstKey}`)).toContainText('1.999,99');
    await expect(page.getByTestId(`budget-modified-${firstKey}`)).toBeVisible();
    await expect(demoBadges(page)).toHaveCount(1); // doar cealaltă linie rămâne demonstrativă

    // linie manuală legată de aria podelei (12 m²), 50 lei/m² cu TVA => 600,00
    await page.getByTestId('budget-add-manual').click();
    const dialog = page.getByTestId('manual-line-form');
    await dialog.getByTestId('manual-description').fill('Montaj parchet');
    await dialog.getByTestId('manual-category').selectOption('labor');
    await dialog.getByTestId('manual-unit').selectOption('m2');
    await dialog.getByTestId('manual-binding').selectOption('roomFloorArea');
    await dialog.getByTestId('manual-price').fill('50');
    await dialog.getByTestId('manual-submit').click();
    await expect(dialog).toHaveCount(0);
    const manualRow = page.locator('[data-testid^="budget-line-manual:"]');
    await expect(manualRow).toHaveCount(1);
    await expect(manualRow.locator('[data-testid^="budget-total-"]')).toContainText('600,00');
    await expect(manualRow.locator('[data-testid^="budget-qty-"]')).toBeDisabled();

    // se salvează; după reîncărcare editările sunt acolo
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await page.reload();
    await openBudget(page);
    await expect(page.getByTestId(`budget-price-${firstKey}`)).toHaveValue('1999.99');
    await expect(page.getByTestId(`budget-modified-${firstKey}`)).toBeVisible();
    await expect(page.locator('[data-testid^="budget-line-manual:"]')).toHaveCount(1);
    await expect(demoBadges(page)).toHaveCount(1);
    expect(catalogPrice).not.toBe('1999.99');

    // export CSV: coerent cu tabelul și cu marcajele
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('budget-export-csv').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('buget-e2e-buget.csv');
    const text = readFileSync((await download.path())!, 'utf8');
    expect(text.startsWith('﻿')).toBe(true);
    const rows = parseCsv(text.slice(1));
    expect(rows[0]![0]).toBe('Cheie linie');
    const objectRows = rows.filter((r) => r[0]?.startsWith('object:'));
    expect(objectRows).toHaveLength(2);
    // niciun preț demonstrativ nu apare nemarcat: numărul din fișier = numărul din tabel
    const demoInCsv = objectRows.filter((r) => r[12] === 'Preț demonstrativ').length;
    expect(demoInCsv).toBe(await demoBadges(page).count());
    expect(objectRows.filter((r) => r[12] === 'Introdus de utilizator')).toHaveLength(1);
    const edited = rows.find((r) => `object:${firstKey.replace('object:', '')}` === r[0])!;
    expect(edited[7]).toBe('1999,99');
    // totalul din fișier = totalul din tabel
    const totalRow = rows.find((r) => r[3]?.startsWith('Total ('))!;
    const uiTotal = minorOf((await page.getByTestId('budget-total').textContent())!);
    expect(Math.round(Number(totalRow[11]!.replace(',', '.')) * 100)).toBe(uiTotal);

    // export XLSX: zip valid cu cele 3 foi; aceleași linii demonstrative și același total ca în tabel
    const xlsxPromise = page.waitForEvent('download');
    await page.getByTestId('budget-export-xlsx').click();
    const xlsx = await xlsxPromise;
    expect(xlsx.suggestedFilename()).toBe('buget-e2e-buget.xlsx');
    const files = unzipSync(new Uint8Array(readFileSync((await xlsx.path())!)));
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('name="Linii"');
    const xml = Object.keys(files)
      .filter((n) => /^xl\/(worksheets\/sheet\d+|sharedStrings)\.xml$/.test(n))
      .map((n) => strFromU8(files[n]!))
      .join(' ');
    // textele repetate sunt deduplicate în sharedStrings: aici doar prezența marcajului (numărul exact e verificat în CSV)
    expect(xml).toContain('Preț demonstrativ');
    expect(xml).toContain(String(uiTotal / 100));
    expect(errors).toEqual([]);
  });

  test('setări și undo: modul TVA, rezerva și excluderea unei linii schimbă totalul; undo le readuce', async ({
    page,
  }) => {
    await createProject(page, 'Setări buget');
    await page.getByTestId('room-form-submit').click();
    await page.getByTestId('catalog-toggle').click();
    await expect(async () => {
      await page.getByTestId('catalog-item-living.sofa-3').click();
      await expect(objects2d(page)).toHaveCount(1, { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await openBudget(page);
    const total = page.getByTestId('budget-total');
    const initial = minorOf((await total.textContent())!);

    await page.getByTestId('budget-settings').locator('summary').click();
    await page.getByTestId('budget-setting-vat-mode').selectOption('net');
    await expect.poll(async () => minorOf((await total.textContent())!)).toBeGreaterThan(initial);
    await page.getByTestId('undo').click();
    await expect.poll(async () => minorOf((await total.textContent())!)).toBe(initial);

    const key = (await priceInputs(page).first().getAttribute('data-testid'))!.replace(
      'budget-price-',
      '',
    );
    await page.getByTestId(`budget-include-${key}`).uncheck();
    await expect(page.getByTestId(`budget-line-${key}`)).toHaveAttribute('data-excluded', 'true');
    await expect(page.getByTestId('budget-subtotal')).toContainText('0,00');
    await page.getByTestId('undo').click();
    await expect.poll(async () => minorOf((await total.textContent())!)).toBe(initial);
  });
});
