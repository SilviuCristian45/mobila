// Export CSV al bugetului (funcție pură: textul se descarcă în interfață). Reguli: BOM UTF-8 pentru Excel, separator
// configurabil (`;` implicit, cu virgulă zecimală, ca în Excel RO), CRLF, ghilimele pentru câmpuri speciale și protecție
// împotriva formulelor (o celulă de text care începe cu = + - @ sau tab/CR e prefixată cu apostrof).
import type { ProjectDocument } from '../schema';
import type { BudgetLine, BudgetSummary } from './index';
import { CATEGORY_LABELS_RO, PRICE_SOURCE_LABELS_RO, UNIT_LABELS_RO, roomLabel } from './labels';

export type CsvSeparator = ';' | ',' | '\t';

export interface CsvOptions {
  separator?: CsvSeparator;
  /** Cu BOM UTF-8 (implicit da). */
  bom?: boolean;
}

export const CSV_HEADER = [
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

const FORMULA_START = /^[=+\-@\t\r]/;

/** Text → celulă CSV: protecție formule, apoi ghilimele dacă e nevoie. */
export function csvCell(value: string, separator: CsvSeparator): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /["\r\n]/.test(safe) || safe.includes(separator) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Cu virgulă zecimală când separatorul de câmpuri nu e virgula, altfel cu punct. */
const decimalOf = (separator: CsvSeparator): string => (separator === ',' ? '.' : ',');

/** `x` cu cel mult `digits` zecimale, fără zerouri finale, cu separatorul zecimal ales. */
function number(x: number, digits: number, decimal: string): string {
  let s = x.toFixed(digits);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', decimal);
}
const money = (minor: number, decimal: string): string => {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}${decimal}${String(abs % 100).padStart(2, '0')}`;
};
const quantity = (q: number, decimal: string): string => number(q, 3, decimal);

const OVERRIDE_LABELS: Record<keyof BudgetLine['overridden'], string> = {
  quantity: 'cantitate',
  unitPriceMinor: 'preț',
  vatBp: 'TVA',
};

/** Numele camerelor unei linii, separate prin „; ”. */
export const lineRoomsText = (line: BudgetLine, doc: ProjectDocument): string =>
  Object.keys(line.byRoom)
    .sort()
    .map((r) => roomLabel(doc.rooms, r))
    .join('; ');

/** Ce a modificat utilizatorul la o linie derivată (gol pentru linii manuale sau nemodificate). */
export const lineModifiedText = (line: BudgetLine): string =>
  line.origin === 'manual'
    ? ''
    : (Object.keys(OVERRIDE_LABELS) as Array<keyof BudgetLine['overridden']>)
        .filter((k) => line.overridden[k])
        .map((k) => OVERRIDE_LABELS[k])
        .join(', ');

function rowOf(line: BudgetLine, doc: ProjectDocument, decimal: string): string[] {
  const rooms = lineRoomsText(line, doc);
  const modified = lineModifiedText(line);
  return [
    line.key,
    line.origin === 'manual' ? 'Manuală' : 'Derivată din model',
    CATEGORY_LABELS_RO[line.category],
    line.description,
    rooms,
    quantity(line.effective.quantity, decimal),
    UNIT_LABELS_RO[line.unit],
    money(line.effective.unitPriceMinor, decimal),
    number(line.effective.vatBp / 100, 2, decimal),
    money(line.totals.netMinor, decimal),
    money(line.totals.vatMinor, decimal),
    money(line.totals.grossMinor, decimal),
    PRICE_SOURCE_LABELS_RO[line.priceSource],
    modified,
    line.excluded ? 'Nu' : 'Da',
    line.note ?? '',
  ];
}

/** Textul CSV al bugetului: liniile, apoi subtotal / rezervă / total și un avertisment. */
export function budgetToCsv(
  doc: ProjectDocument,
  summary: BudgetSummary,
  options: CsvOptions = {},
): string {
  const sep = options.separator ?? ';';
  const decimal = decimalOf(sep);
  const rows: string[][] = [[...CSV_HEADER]];
  for (const line of summary.lines) rows.push(rowOf(line, doc, decimal));
  const blank = Array<string>(CSV_HEADER.length).fill('');
  const totalRow = (
    label: string,
    t: { netMinor: number; vatMinor: number; grossMinor: number },
  ) => {
    const r = [...blank];
    r[3] = label;
    r[9] = money(t.netMinor, decimal);
    r[10] = money(t.vatMinor, decimal);
    r[11] = money(t.grossMinor, decimal);
    return r;
  };
  rows.push([...blank]);
  rows.push(totalRow('Subtotal (liniile incluse)', summary.subtotal));
  rows.push(
    totalRow(
      `Rezervă (${number(doc.settings.contingencyBp / 100, 2, decimal)}%)`,
      summary.contingency,
    ),
  );
  rows.push(totalRow(`Total (${doc.settings.currency})`, summary.total));
  const note = [...blank];
  note[3] =
    'Estimare orientativă. Liniile marcate „Preț demonstrativ” au prețuri arbitrare, nu prețuri de piață; manopera, transportul și pierderile de șantier nu sunt incluse decât dacă au fost adăugate manual.';
  rows.push([...blank]);
  rows.push(note);
  const text = rows.map((r) => r.map((c) => csvCell(c, sep)).join(sep)).join('\r\n') + '\r\n';
  return (options.bom ?? true) ? `﻿${text}` : text;
}
