// Export XLSX al bugetului, partea pură: construiește foile (rânduri de celule) fără nicio bibliotecă. Scrierea efectivă a
// fișierului se face în interfață, cu o bibliotecă încărcată la cerere. Valorile sunt numere reale cu format, nu text.
// Textul introdus de utilizator se scrie mereu ca șir (niciodată ca formulă), deci `=HYPERLINK(...)` apare ca text.
import type { ProjectDocument } from '../schema';
import type { BudgetLine, BudgetSummary } from './index';
import { lineModifiedText, lineRoomsText } from './csv';
import { CATEGORY_LABELS_RO, PRICE_SOURCE_LABELS_RO, UNIT_LABELS_RO, roomLabel } from './labels';

export interface XlsxCellObject {
  value: string | number;
  type?: StringConstructor | NumberConstructor;
  format?: string;
  fontWeight?: 'bold';
  wrap?: boolean;
}
export type XlsxCell = XlsxCellObject | null;

export interface XlsxSheet {
  sheet: string;
  data: XlsxCell[][];
  /** Lățimi de coloană (în caractere). */
  columns: Array<{ width: number }>;
}

export const MONEY_FORMAT = '#,##0.00';
export const QUANTITY_FORMAT = '#,##0.###';
export const PERCENT_FORMAT = '0.##';

const text = (value: string, fontWeight?: 'bold'): XlsxCell => ({
  value,
  type: String,
  ...(fontWeight ? { fontWeight } : {}),
});
const head = (value: string): XlsxCell => text(value, 'bold');
const money = (minor: number): XlsxCell => ({
  value: minor / 100,
  type: Number,
  format: MONEY_FORMAT,
});
const boldMoney = (minor: number): XlsxCell => ({
  value: minor / 100,
  type: Number,
  format: MONEY_FORMAT,
  fontWeight: 'bold',
});
const quantity = (q: number): XlsxCell => ({ value: q, type: Number, format: QUANTITY_FORMAT });
const percent = (bp: number): XlsxCell => ({
  value: bp / 100,
  type: Number,
  format: PERCENT_FORMAT,
});

export const XLSX_DISCLAIMER =
  'Estimare orientativă. Liniile marcate „Preț demonstrativ” au prețuri arbitrare, nu prețuri de piață; manopera, transportul și pierderile de șantier nu sunt incluse decât dacă au fost adăugate manual.';

export const XLSX_LINE_HEADER = [
  'Cheie linie',
  'Origine',
  'Categorie',
  'Descriere',
  'Camere',
  'Cantitate',
  'UM',
  'Preț unitar',
  'TVA (%)',
  'Net',
  'TVA',
  'Brut',
  'Sursă preț',
  'Modificat',
  'Inclusă în total',
  'Notă',
] as const;

type TotalsLike = { netMinor: number; vatMinor: number; grossMinor: number };

function lineRow(line: BudgetLine, doc: ProjectDocument): XlsxCell[] {
  return [
    text(line.key),
    text(line.origin === 'manual' ? 'Manuală' : 'Derivată din model'),
    text(CATEGORY_LABELS_RO[line.category]),
    text(line.description),
    text(lineRoomsText(line, doc)),
    quantity(line.effective.quantity),
    text(UNIT_LABELS_RO[line.unit]),
    money(line.effective.unitPriceMinor),
    percent(line.effective.vatBp),
    money(line.totals.netMinor),
    money(line.totals.vatMinor),
    money(line.totals.grossMinor),
    text(PRICE_SOURCE_LABELS_RO[line.priceSource]),
    text(lineModifiedText(line)),
    text(line.excluded ? 'Nu' : 'Da'),
    text(line.note ?? ''),
  ];
}

const totalsCells = (t: TotalsLike, bold = false): XlsxCell[] =>
  bold
    ? [boldMoney(t.netMinor), boldMoney(t.vatMinor), boldMoney(t.grossMinor)]
    : [money(t.netMinor), money(t.vatMinor), money(t.grossMinor)];

/** Foaia „Rezumat”: proiect, monedă, setări, subtotal / rezervă / total, avertisment. */
function summarySheet(doc: ProjectDocument, summary: BudgetSummary): XlsxSheet {
  const s = doc.settings;
  const demoLines = summary.lines.filter((l) => l.priceSource === 'demo' && !l.excluded).length;
  return {
    sheet: 'Rezumat',
    columns: [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }],
    data: [
      [head(`Buget — ${doc.name}`)],
      [text('Moneda'), text(s.currency)],
      [text('Prețuri introduse'), text(s.pricesIncludeVat ? 'cu TVA' : 'fără TVA')],
      [text('TVA implicit (%)'), percent(s.defaultVatBp)],
      [text('Procent rezervă (%)'), percent(s.contingencyBp)],
      [text('Linii cu preț demonstrativ'), { value: demoLines, type: Number }],
      [],
      [null, head('Net'), head('TVA'), head('Brut')],
      [text('Subtotal (liniile incluse)'), ...totalsCells(summary.subtotal)],
      [text('Rezervă'), ...totalsCells(summary.contingency)],
      [head(`Total (${s.currency})`), ...totalsCells(summary.total, true)],
      [],
      [{ value: XLSX_DISCLAIMER, type: String, wrap: true }],
    ],
  };
}

/** Foaia „Pe cameră”: totalurile pe cameră, apoi pe categorie. */
function breakdownSheet(doc: ProjectDocument, summary: BudgetSummary): XlsxSheet {
  const data: XlsxCell[][] = [[head('Camera'), head('Net'), head('TVA'), head('Brut')]];
  for (const id of Object.keys(summary.perRoom).sort()) {
    data.push([text(roomLabel(doc.rooms, id)), ...totalsCells(summary.perRoom[id]!)]);
  }
  data.push([], [head('Categoria'), head('Net'), head('TVA'), head('Brut')]);
  for (const cat of Object.keys(summary.perCategory).sort() as Array<
    keyof typeof CATEGORY_LABELS_RO
  >) {
    data.push([text(CATEGORY_LABELS_RO[cat]), ...totalsCells(summary.perCategory[cat]!)]);
  }
  return {
    sheet: 'Pe cameră',
    columns: [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }],
    data,
  };
}

/** Foaia „Linii”: aceleași coloane ca în CSV, cu numere reale. */
function linesSheet(doc: ProjectDocument, summary: BudgetSummary): XlsxSheet {
  return {
    sheet: 'Linii',
    columns: [
      { width: 26 },
      { width: 18 },
      { width: 18 },
      { width: 40 },
      { width: 24 },
      { width: 11 },
      { width: 8 },
      { width: 13 },
      { width: 9 },
      { width: 13 },
      { width: 13 },
      { width: 13 },
      { width: 22 },
      { width: 22 },
      { width: 11 },
      { width: 36 },
    ],
    data: [XLSX_LINE_HEADER.map((h) => head(h)), ...summary.lines.map((l) => lineRow(l, doc))],
  };
}

/** Foile exportului XLSX: Rezumat, Pe cameră, Linii. */
export function budgetToSheets(doc: ProjectDocument, summary: BudgetSummary): XlsxSheet[] {
  return [summarySheet(doc, summary), breakdownSheet(doc, summary), linesSheet(doc, summary)];
}
