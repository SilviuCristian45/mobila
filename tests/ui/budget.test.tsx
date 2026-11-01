// @vitest-environment jsdom
// Etapa 6a: tab-ul „Buget” (tabel editabil, linii manuale, setări, urmă de calcul, export CSV) peste aceeași sesiune.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidDocumentError, budgetToCsv, computeBudget, exportProject } from '@/domain';
import { EditorClient } from '@/app/editor/EditorClient';
import { formatMoney } from '@/lib/format';
import { studioProject } from '../reference/projects';
import { settle } from '../helpers/env';
import { renderWithRuntime, uiEnv, type UiEnv } from '../helpers/ui';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));
const downloads: Array<{ name: string; text: string; mime?: string }> = [];
const blobs: Array<{ name: string; blob: Blob }> = [];
vi.mock('@/lib/download', async (orig) => ({
  ...(await orig<typeof import('@/lib/download')>()),
  downloadTextFile: (name: string, text: string, mime?: string) =>
    downloads.push({ name, text, mime }),
  downloadBlob: (name: string, blob: Blob) => blobs.push({ name, blob }),
}));
const invalid = vi.hoisted(() => ({ on: false }));
vi.mock('@/state/selectors', async (orig) => {
  const real = await orig<typeof import('@/state/selectors')>();
  const { InvalidDocumentError: Err } = await import('@/domain');
  return {
    ...real,
    selectBudget: (d: Parameters<typeof real.selectBudget>[0]) => {
      if (invalid.on)
        throw new Err('Geometrie invalidă (1 probleme): bugetul nu se poate calcula.', [
          { code: 'wall-crossing', path: 'walls.w1', message: 'Un perete se intersectează' },
        ]);
      return real.selectBudget(d);
    },
  };
});

beforeEach(() => {
  query = '';
  downloads.length = 0;
  blobs.length = 0;
  invalid.on = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };
async function openBudget(e: UiEnv, doc = studioProject()) {
  const r = await e.tab.manager.importFile(exportProject(doc, META));
  if (!r.ok) throw new Error('seed');
  query = `p=${r.value.id}`;
  renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
  await screen.findByTestId('editor');
  await userEvent.click(screen.getByTestId('mode-budget'));
  await screen.findByTestId('budget-panel');
  return r.value.id;
}
const autosave = async (e: UiEnv) => {
  await act(async () => {
    await e.clock.advance(800);
    await settle();
  });
};
const stored = async (e: UiEnv, id: string) =>
  (await e.tab.repo.load(id)) as Extract<Awaited<ReturnType<typeof e.tab.repo.load>>, { ok: true }>;
const type = async (testId: string, text: string) => {
  const input = screen.getByTestId(testId);
  await userEvent.clear(input);
  await userEvent.type(input, `${text}{Enter}`);
};
const RON = (minor: number) => formatMoney(minor, 'RON');
const SOFA = 'object:oSofa';
const money = (id: string) => screen.getByTestId(id).textContent;

describe('tab-ul Buget: afișare', () => {
  it('arată liniile modelului cu totalurile calculate de domeniu, avertismentul și, fără butoanele de panouri ale planului', async () => {
    const e = uiEnv();
    await openBudget(e);
    const expected = computeBudget(studioProject());
    expect(screen.getByTestId('budget-disclaimer').textContent).toMatch(/Estimare orientativă/);
    expect(screen.getByTestId('budget-disclaimer').textContent).toMatch(/Preț demonstrativ/);
    for (const l of expected.lines) {
      expect(screen.getByTestId(`budget-line-${l.key}`)).toBeTruthy();
      expect(money(`budget-total-${l.key}`)).toBe(RON(l.totals.grossMinor));
    }
    expect(money('budget-subtotal')).toBe(RON(expected.subtotal.grossMinor));
    expect(money('budget-contingency')).toBe(RON(expected.contingency.grossMinor));
    expect(money('budget-total')).toBe(RON(expected.total.grossMinor));
    expect(screen.queryByTestId('materials-toggle')).toBeNull();
    expect(screen.queryByTestId('plan-editor')).toBeNull();
    expect(within(screen.getByTestId('budget-by-room')).getByText('Living')).toBeTruthy();
    expect(within(screen.getByTestId('budget-by-category')).getByText('Mobilier')).toBeTruthy();
  });

  it('marchează prețurile demonstrative; o linie cu preț editat de utilizator nu mai e marcată demonstrativ', async () => {
    const e = uiEnv();
    await openBudget(e);
    expect(screen.getByTestId(`budget-demo-${SOFA}`)).toBeTruthy(); // preț din catalog, demonstrativ
    expect(screen.queryByTestId('budget-demo-object:oLamp')).toBeNull(); // proiectul de referință îi editează prețul
    expect(screen.getByTestId('budget-modified-object:oLamp')).toBeTruthy();
    expect(screen.queryByTestId('budget-demo-manual:mLabor')).toBeNull(); // linie manuală
    expect(screen.getByTestId('budget-line-manual:mLabor').textContent).toMatch(/Manuală/);
  });

  it('proiect fără linii: mesaj de stare goală', async () => {
    const e = uiEnv();
    const c = await e.tab.manager.create('Gol');
    if (!c.ok) throw new Error('create');
    query = `p=${c.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    await userEvent.click(screen.getByTestId('mode-budget'));
    expect(await screen.findByTestId('budget-empty')).toBeTruthy();
  });

  it('plan invalid: mesaj cu motivele, fără tabel, iar exportul e dezactivat', async () => {
    const e = uiEnv();
    invalid.on = true;
    await openBudget(e);
    const box = screen.getByTestId('budget-invalid');
    expect(box.textContent).toMatch(/Un perete se intersectează/);
    expect(screen.queryByTestId('budget-table')).toBeNull();
    expect((screen.getByTestId('budget-export-csv') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('tab-ul Buget: editare (un pas de undo, autosave)', () => {
  it('prețul unei linii derivate: totalul se recalculează (brut 1.999,99 → net/TVA din formulă), apare „Modificat”, dispare marca demonstrativă; undo readuce totul; se salvează', async () => {
    const e = uiEnv();
    const id = await openBudget(e);
    const before = computeBudget(studioProject());
    await type(`budget-price-${SOFA}`, '1999,99');
    // preț cu TVA: brut = 199999 bani
    expect(money(`budget-total-${SOFA}`)).toBe(RON(199999));
    expect(screen.getByTestId(`budget-modified-${SOFA}`)).toBeTruthy();
    expect(screen.queryByTestId(`budget-demo-${SOFA}`)).toBeNull();
    expect(money('budget-subtotal')).toBe(RON(before.subtotal.grossMinor - 220000 + 199999));
    await autosave(e);
    const row = (await stored(e, id)).value.doc.budget.overrides[SOFA];
    expect(row).toEqual({ unitPriceMinor: 199999 });

    await userEvent.click(screen.getByTestId('undo'));
    expect(money(`budget-total-${SOFA}`)).toBe(RON(220000));
    expect(screen.getByTestId(`budget-demo-${SOFA}`)).toBeTruthy();
    expect(screen.queryByTestId(`budget-modified-${SOFA}`)).toBeNull();
  });

  it('cantitate și TVA: 2 canapele de 2.200 RON (cu TVA) = 4.400 RON; TVA 9% schimbă doar partea de TVA, nu brutul', async () => {
    const e = uiEnv();
    await openBudget(e);
    await type(`budget-qty-${SOFA}`, '2');
    expect(money(`budget-total-${SOFA}`)).toBe(RON(440000));
    await type(`budget-vat-${SOFA}`, '9');
    expect(money(`budget-total-${SOFA}`)).toBe(RON(440000)); // preț cu TVA: brutul nu se schimbă
  });

  it('valori invalide: mesaj la câmp, valoarea revine, documentul nu se modifică', async () => {
    const e = uiEnv();
    await openBudget(e);
    await type(`budget-price-${SOFA}`, '-5');
    expect(screen.getByRole('alert').textContent).toMatch(/negativ/);
    expect((screen.getByTestId(`budget-price-${SOFA}`) as HTMLInputElement).value).toBe('2200');
    await type(`budget-price-${SOFA}`, '10,555');
    expect(
      screen.getAllByRole('alert').some((a) => /două zecimale/.test(a.textContent ?? '')),
    ).toBe(true);
    await type(`budget-qty-${SOFA}`, '-1');
    expect(screen.getAllByRole('alert').some((a) => /negativă/.test(a.textContent ?? ''))).toBe(
      true,
    );
    await type(`budget-vat-${SOFA}`, '5000');
    expect(
      screen.getAllByRole('alert').some((a) => /între 0% și 1000%/.test(a.textContent ?? '')),
    ).toBe(true);
    expect(money(`budget-total-${SOFA}`)).toBe(RON(220000));
    expect(screen.getByTestId('history-size').textContent).toBe('0');
  });

  it('o valoare egală cu cea calculată șterge suprascrierea (nu rămâne „Modificat” degeaba)', async () => {
    const e = uiEnv();
    await openBudget(e);
    await type(`budget-price-${SOFA}`, '1000');
    expect(screen.getByTestId(`budget-modified-${SOFA}`)).toBeTruthy();
    await type(`budget-price-${SOFA}`, '2200'); // prețul din catalog
    expect(screen.queryByTestId(`budget-modified-${SOFA}`)).toBeNull();
    expect(screen.getByTestId(`budget-demo-${SOFA}`)).toBeTruthy();
  });

  it('„Revino” readuce valorile calculate; excluderea scoate linia din total și se poate anula', async () => {
    const e = uiEnv();
    await openBudget(e);
    const before = computeBudget(studioProject());
    await type(`budget-qty-${SOFA}`, '3');
    await userEvent.click(screen.getByTestId(`budget-reset-${SOFA}`));
    expect(money(`budget-total-${SOFA}`)).toBe(RON(220000));
    expect(screen.queryByTestId(`budget-reset-${SOFA}`)).toBeNull();

    await userEvent.click(screen.getByTestId(`budget-include-${SOFA}`));
    expect(screen.getByTestId(`budget-line-${SOFA}`).getAttribute('data-excluded')).toBe('true');
    expect(money('budget-subtotal')).toBe(RON(before.subtotal.grossMinor - 220000));
    expect(money(`budget-total-${SOFA}`)).toBe(RON(220000)); // linia își păstrează totalul, dar nu intră în subtotal
    await userEvent.click(screen.getByTestId('undo'));
    expect(screen.getByTestId(`budget-line-${SOFA}`).getAttribute('data-excluded')).toBe('false');
    expect(money('budget-subtotal')).toBe(RON(before.subtotal.grossMinor));
  });

  it('nota unei linii se salvează în suprascriere și apare în export', async () => {
    const e = uiEnv();
    const id = await openBudget(e);
    await type(`budget-note-${SOFA}`, 'cu livrare gratuită');
    await autosave(e);
    expect((await stored(e, id)).value.doc.budget.overrides[SOFA]?.note).toBe(
      'cu livrare gratuită',
    );
    await userEvent.click(screen.getByTestId('budget-export-csv'));
    expect(downloads[0]!.text).toContain('cu livrare gratuită');
  });
});

describe('tab-ul Buget: linii manuale', () => {
  async function addLine(over: Partial<Record<string, string>> = {}) {
    await userEvent.click(screen.getByTestId('budget-add-manual'));
    const dialog = await screen.findByTestId('manual-line-form');
    const set = async (testId: string, v: string) => {
      const el = within(dialog).getByTestId(testId);
      await userEvent.clear(el);
      await userEvent.type(el, v);
    };
    await set('manual-description', over.description ?? 'Transport mobilier');
    await userEvent.selectOptions(
      within(dialog).getByTestId('manual-category'),
      over.category ?? 'transport',
    );
    await userEvent.selectOptions(within(dialog).getByTestId('manual-unit'), over.unit ?? 'lot');
    await set('manual-quantity', over.quantity ?? '1');
    await set('manual-price', over.price ?? '150');
    await set('manual-vat', over.vat ?? '21');
    await userEvent.click(within(dialog).getByTestId('manual-submit'));
    return dialog;
  }

  it('adăugare: linia apare, intră în total (150 RON cu TVA), se salvează; undo o scoate', async () => {
    const e = uiEnv();
    const id = await openBudget(e);
    const before = computeBudget(studioProject());
    await addLine();
    await waitFor(() => expect(screen.queryByTestId('manual-line-form')).toBeNull());
    const keys = Object.keys((await stored(e, id)).value.doc.budget.manualLines);
    expect(keys).toHaveLength(1); // mLabor e încă în documentul salvat până la autosave
    await autosave(e);
    const manuals = Object.keys((await stored(e, id)).value.doc.budget.manualLines);
    expect(manuals).toHaveLength(2);
    const newKey = manuals.find((k) => k !== 'mLabor')!;
    expect(money(`budget-total-manual:${newKey}`)).toBe(RON(15000));
    expect(money('budget-subtotal')).toBe(RON(before.subtotal.grossMinor + 15000));
    expect(within(screen.getByTestId('budget-by-category')).getByText('Transport')).toBeTruthy();
    await userEvent.click(screen.getByTestId('undo'));
    expect(screen.queryByTestId(`budget-line-manual:${newKey}`)).toBeNull();
    expect(money('budget-subtotal')).toBe(RON(before.subtotal.grossMinor));
  });

  it('date invalide în formular: mesaj, dialogul rămâne deschis, nimic nu se adaugă', async () => {
    const e = uiEnv();
    await openBudget(e);
    const dialog = await addLine({ description: '   ' });
    expect(within(dialog).getByTestId('manual-error').textContent).toMatch(/Descrierea/);
    expect(screen.getByTestId('manual-line-form')).toBeTruthy();
    expect(screen.getByTestId('history-size').textContent).toBe('0');
    await userEvent.clear(within(dialog).getByTestId('manual-description'));
    await userEvent.type(within(dialog).getByTestId('manual-description'), 'Ok');
    await userEvent.clear(within(dialog).getByTestId('manual-price'));
    await userEvent.type(within(dialog).getByTestId('manual-price'), '1,234');
    await userEvent.click(within(dialog).getByTestId('manual-submit'));
    expect(within(dialog).getByTestId('manual-error').textContent).toMatch(/două zecimale/);
  });

  it('editare și ștergere cu confirmare; linia legată de aria podelei are cantitatea calculată (11,31 m²) și blocată', async () => {
    const e = uiEnv();
    await openBudget(e);
    const qty = screen.getByTestId('budget-qty-manual:mLabor') as HTMLInputElement;
    expect(qty.value).toBe('11.31');
    expect(qty.disabled).toBe(true);
    // 11,31 m² × 60 RON, TVA 21% inclus: brut = round(11,31 × 6000) = 67860
    expect(money('budget-total-manual:mLabor')).toBe(RON(67860));

    await userEvent.click(screen.getByTestId('budget-edit-manual:mLabor'));
    const dialog = await screen.findByTestId('manual-line-form');
    await userEvent.clear(within(dialog).getByTestId('manual-price'));
    await userEvent.type(within(dialog).getByTestId('manual-price'), '100');
    await userEvent.click(within(dialog).getByTestId('manual-submit'));
    await waitFor(() => expect(money('budget-total-manual:mLabor')).toBe(RON(113100))); // 11,31 × 10000

    await userEvent.click(screen.getByTestId('budget-remove-manual:mLabor'));
    const confirm = await screen.findByRole('dialog', { name: 'Ștergi linia?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Șterge linia' }));
    await waitFor(() => expect(screen.queryByTestId('budget-line-manual:mLabor')).toBeNull());
    await userEvent.click(screen.getByTestId('undo'));
    expect(screen.getByTestId('budget-line-manual:mLabor')).toBeTruthy();
  });
});

describe('tab-ul Buget: setări', () => {
  it('moneda: refuzată cu explicație când proiectul are obiecte cu preț în altă monedă; o monedă scrisă greșit e respinsă la câmp', async () => {
    const e = uiEnv();
    await openBudget(e);
    await userEvent.click(screen.getByText(/Setări buget/));
    await type('budget-setting-currency', 'eur');
    expect(
      screen
        .getAllByRole('alert')
        .some((a) => /sunt în RON și nu se convertesc automat/.test(a.textContent ?? '')),
    ).toBe(true);
    expect(money(`budget-total-${SOFA}`)).toBe(RON(220000)); // nimic nu s-a schimbat
    await type('budget-setting-currency', 'ab');
    expect(screen.getAllByRole('alert').some((a) => /3 litere/.test(a.textContent ?? ''))).toBe(
      true,
    );
    expect(screen.getByTestId('history-size').textContent).toBe('0');
  });

  it('moneda: într-un proiect fără obiecte cu preț de catalog se schimbă (litere mari) și se vede în sume; undo o readuce', async () => {
    const e = uiEnv();
    const c = await e.tab.manager.create('Fără obiecte');
    if (!c.ok) throw new Error('create');
    query = `p=${c.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    await userEvent.click(screen.getByTestId('mode-budget'));
    await userEvent.click(await screen.findByTestId('budget-add-manual'));
    const dialog = await screen.findByTestId('manual-line-form');
    await userEvent.type(within(dialog).getByTestId('manual-description'), 'Manoperă');
    await userEvent.clear(within(dialog).getByTestId('manual-price'));
    await userEvent.type(within(dialog).getByTestId('manual-price'), '100');
    await userEvent.click(within(dialog).getByTestId('manual-submit'));
    await waitFor(() => expect(screen.queryByTestId('manual-line-form')).toBeNull());
    expect(money('budget-subtotal')).toBe(RON(10000));
    await userEvent.click(screen.getByText(/Setări buget/));
    await type('budget-setting-currency', 'eur');
    expect(money('budget-subtotal')).toBe(formatMoney(10000, 'EUR'));
    await userEvent.click(screen.getByTestId('undo'));
    expect(money('budget-subtotal')).toBe(RON(10000));
  });

  it('modul TVA: „nu includ TVA” adaugă TVA (2.200 + 21% = 2.662 RON); revenirea e exactă', async () => {
    const e = uiEnv();
    await openBudget(e);
    await userEvent.click(screen.getByText(/Setări buget/));
    await userEvent.selectOptions(screen.getByTestId('budget-setting-vat-mode'), 'net');
    // net = 220000; TVA = round(220000 × 2100 / 10000) = 46200; brut = 266200
    expect(money(`budget-total-${SOFA}`)).toBe(RON(266200));
    await userEvent.selectOptions(screen.getByTestId('budget-setting-vat-mode'), 'gross');
    expect(money(`budget-total-${SOFA}`)).toBe(RON(220000));
  });

  it('rezerva: 10% din subtotal se vede în total; undo o readuce', async () => {
    const e = uiEnv();
    await openBudget(e);
    await userEvent.click(screen.getByText(/Setări buget/));
    await type('budget-setting-contingency', '10');
    const after = computeBudget({
      ...studioProject(),
      settings: { ...studioProject().settings, contingencyBp: 1000 },
    });
    expect(money('budget-contingency')).toBe(RON(after.contingency.grossMinor));
    expect(money('budget-total')).toBe(RON(after.total.grossMinor));
    await userEvent.click(screen.getByTestId('undo'));
    expect(money('budget-total')).toBe(RON(computeBudget(studioProject()).total.grossMinor));
  });
});

describe('tab-ul Buget: urma de calcul', () => {
  it('pentru fiecare linie, „Total brut linie” din urmă = totalul afișat (recalculare independentă din urmă)', async () => {
    const e = uiEnv();
    await openBudget(e);
    for (const l of computeBudget(studioProject()).lines) {
      await userEvent.click(screen.getByTestId(`budget-trace-${l.key}`));
      const dialog = await screen.findByTestId('trace-dialog');
      const cell = dialog.querySelector('[data-step="Total brut linie"]');
      expect(cell?.textContent, l.key).toBe(String(l.totals.grossMinor));
      expect(RON(Number(cell!.textContent))).toBe(money(`budget-total-${l.key}`));
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Închide' }),
      );
      await waitFor(() => expect(screen.queryByTestId('trace-dialog')).toBeNull());
    }
  });

  it('urma urmărește modificările: după o editare de cantitate apare pasul „Cantitate suprascrisă de utilizator”', async () => {
    const e = uiEnv();
    await openBudget(e);
    const finishKey = computeBudget(studioProject()).lines.find((l) =>
      l.key.startsWith('finish:'),
    )!.key;
    await type(`budget-qty-${finishKey}`, '7');
    await userEvent.click(screen.getByTestId(`budget-trace-${finishKey}`));
    const dialog = await screen.findByTestId('trace-dialog');
    expect(dialog.textContent).toMatch(/Cantitate suprascrisă de utilizator/);
  });
});

describe('tab-ul Buget: export CSV', () => {
  it('descarcă un CSV cu BOM și nume clar; conține marcajul „Preț demonstrativ”; separatorul se alege din interfață', async () => {
    const e = uiEnv();
    await openBudget(e);
    await userEvent.click(screen.getByTestId('budget-export-csv'));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toBe('studio-buget.csv');
    expect(downloads[0]!.mime).toBe('text/csv');
    const text = downloads[0]!.text;
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('Preț demonstrativ');
    expect(text).toContain('Cheie linie;Origine;Categorie');

    await userEvent.selectOptions(screen.getByTestId('budget-csv-separator'), ',');
    await userEvent.click(screen.getByTestId('budget-export-csv'));
    expect(downloads[1]!.text).toContain('Cheie linie,Origine,Categorie');
  });

  it('exportul reflectă editările făcute în interfață (identic cu `budgetToCsv` peste documentul curent)', async () => {
    const e = uiEnv();
    const id = await openBudget(e);
    await type(`budget-price-${SOFA}`, '1999,99');
    await userEvent.click(screen.getByTestId('budget-export-csv'));
    await autosave(e);
    const doc = (await stored(e, id)).value.doc;
    expect(downloads[0]!.text).toBe(budgetToCsv(doc, computeBudget(doc)));
    expect(downloads[0]!.text).toContain('1999,99');
    expect(downloads[0]!.text).toContain('Introdus de utilizator');
  });

  it('o notă cu formulă (=HYPERLINK) apare în export ca text, cu apostrof', async () => {
    const e = uiEnv();
    await openBudget(e);
    await type(`budget-note-${SOFA}`, '=HYPERLINK("http://x.ro";"clic")');
    await userEvent.click(screen.getByTestId('budget-export-csv'));
    expect(downloads[0]!.text).toContain(`'=HYPERLINK`);
    expect(downloads[0]!.text).not.toMatch(/;=HYPERLINK/);
  });
});

describe('tab-ul Buget: doar citire', () => {
  it('când proiectul e deschis în alt tab, toate câmpurile și butoanele de editare sunt dezactivate; exportul rămâne', async () => {
    const e = uiEnv();
    const seeded = await e.tab.manager.importFile(exportProject(studioProject(), META));
    if (!seeded.ok) throw new Error('seed');
    const holder = await e.newTab().manager.open(seeded.value.id);
    expect(holder.ok).toBe(true);
    query = `p=${seeded.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    await userEvent.click(screen.getByTestId('mode-budget'));
    await screen.findByTestId('budget-panel');
    for (const id of [
      `budget-price-${SOFA}`,
      `budget-qty-${SOFA}`,
      `budget-include-${SOFA}`,
      'budget-add-manual',
    ])
      expect((screen.getByTestId(id) as HTMLInputElement | HTMLButtonElement).disabled, id).toBe(
        true,
      );
    expect((screen.getByTestId('budget-export-csv') as HTMLButtonElement).disabled).toBe(false);
    void InvalidDocumentError;
  });
});

describe('tab-ul Buget: export XLSX', () => {
  it('descarcă un fișier .xlsx (zip valid, tip și nume corecte) și biblioteca se încarcă abia la clic', async () => {
    const e = uiEnv();
    await openBudget(e);
    expect(blobs).toHaveLength(0);
    await userEvent.click(screen.getByTestId('budget-export-xlsx'));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(blobs[0]!.name).toBe('studio-buget.xlsx');
    expect(blobs[0]!.blob.size).toBeGreaterThan(500);
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blobs[0]!.blob);
    });
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]); // „PK”: antet de zip
    expect(screen.queryByTestId('budget-error')).toBeNull();
  });

  it('este dezactivat când bugetul nu se poate calcula', async () => {
    const e = uiEnv();
    invalid.on = true;
    await openBudget(e);
    expect((screen.getByTestId('budget-export-xlsx') as HTMLButtonElement).disabled).toBe(true);
  });
});
