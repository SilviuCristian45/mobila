// Etapa 6b: exportul XLSX al bugetului. Foile (funcție pură) se verifică față de buget; fișierul real se scrie cu
// biblioteca (intrarea Node) și se desface ca să se vadă că textul de utilizator nu devine formulă.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { computeBudget, addManualLine } from '@/domain/budget';
import { XLSX_LINE_HEADER, budgetToSheets, type XlsxCell, type XlsxSheet } from '@/domain';
import { setLineOverride } from '@/domain/cascade';
import { studioProject } from '../reference/projects';

const req = createRequire(import.meta.url);
interface FflateLike {
  unzipSync(data: Uint8Array): Record<string, Uint8Array>;
  strFromU8(data: Uint8Array): string;
}
// `fflate` e dependența bibliotecii XLSX (nu a proiectului): se rezolvă din locul ei
const { unzipSync, strFromU8 } = createRequire(req.resolve('write-excel-file/node'))(
  'fflate',
) as FflateLike;

const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const valueOf = (c: XlsxCell | undefined): string | number | undefined => c?.value;
const sheetNamed = (sheets: XlsxSheet[], name: string): XlsxSheet =>
  sheets.find((s) => s.sheet === name)!;

function projectWithTrickyText() {
  let doc = ok(
    addManualLine(studioProject(), () => 'f', {
      category: 'labor',
      description: '=HYPERLINK("http://exemplu.ro";"clic")',
      unit: 'h',
      quantity: 8,
      unitPriceMinor: 5000,
      vatBp: 1900,
      note: '@SUM(A1:A9)',
    }),
  );
  const derived = computeBudget(doc).lines.find((l) => l.origin === 'derived')!;
  doc = ok(setLineOverride(doc, derived.key, { note: '=1+1' }));
  return doc;
}

describe('XLSX: foile din buget', () => {
  const doc = studioProject();
  const summary = computeBudget(doc);
  const sheets = budgetToSheets(doc, summary);

  it('trei foi, în ordine: Rezumat, Pe cameră, Linii', () => {
    expect(sheets.map((s) => s.sheet)).toEqual(['Rezumat', 'Pe cameră', 'Linii']);
  });

  it('Linii: antetul din CSV, un rând per linie, sume exacte în unități principale (bani / 100)', () => {
    const lines = sheetNamed(sheets, 'Linii');
    expect(lines.data[0]!.map(valueOf)).toEqual([...XLSX_LINE_HEADER]);
    expect(lines.data).toHaveLength(1 + summary.lines.length);
    summary.lines.forEach((l, i) => {
      const row = lines.data[i + 1]!;
      expect(valueOf(row[0])).toBe(l.key);
      expect(valueOf(row[5])).toBe(l.effective.quantity);
      expect(valueOf(row[7])).toBe(l.effective.unitPriceMinor / 100);
      expect(valueOf(row[9])).toBe(l.totals.netMinor / 100);
      expect(valueOf(row[10])).toBe(l.totals.vatMinor / 100);
      expect(valueOf(row[11])).toBe(l.totals.grossMinor / 100);
      expect(row[11]!.type).toBe(Number);
      expect(valueOf(row[12])).toBe(
        l.priceSource === 'demo' ? 'Preț demonstrativ' : 'Introdus de utilizator',
      );
      expect(valueOf(row[14])).toBe(l.excluded ? 'Nu' : 'Da');
    });
  });

  it('Rezumat: subtotal, rezervă și total = sumarul; numărul de linii demonstrative', () => {
    const rows = sheetNamed(sheets, 'Rezumat').data;
    const find = (label: string) => rows.find((r) => String(valueOf(r[0])).startsWith(label))!;
    const gross = (r: XlsxCell[]) => valueOf(r[3]);
    expect(gross(find('Subtotal'))).toBe(summary.subtotal.grossMinor / 100);
    expect(gross(find('Rezervă'))).toBe(summary.contingency.grossMinor / 100);
    expect(gross(find(`Total (${doc.settings.currency})`))).toBe(summary.total.grossMinor / 100);
    const demo = summary.lines.filter((l) => l.priceSource === 'demo' && !l.excluded).length;
    expect(valueOf(find('Linii cu preț demonstrativ')[1])).toBe(demo);
  });

  it('Pe cameră: totalul camerelor = subtotalul', () => {
    const rows = sheetNamed(sheets, 'Pe cameră').data;
    const blank = rows.findIndex((r) => r.length === 0);
    const perRoom = rows.slice(1, blank);
    const sum = perRoom.reduce((s, r) => s + Math.round((valueOf(r[3]) as number) * 100), 0);
    expect(sum).toBe(summary.subtotal.grossMinor);
    const perCat = rows.slice(blank + 2);
    expect(perCat.reduce((s, r) => s + Math.round((valueOf(r[3]) as number) * 100), 0)).toBe(
      summary.subtotal.grossMinor,
    );
  });
});

describe('XLSX: fișierul real', () => {
  it('este un zip valid cu 3 foi; textul care începe cu = sau @ este șir, nu formulă', async () => {
    const doc = projectWithTrickyText();
    const sheets = budgetToSheets(doc, computeBudget(doc));
    const buffer = await writeXlsxFile(sheets).toBuffer();
    const files = unzipSync(new Uint8Array(buffer));
    const names = Object.keys(files);
    expect(names).toContain('[Content_Types].xml');
    expect(names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))).toHaveLength(3);
    const workbook = strFromU8(files['xl/workbook.xml']!);
    for (const s of ['Rezumat', 'Pe cameră', 'Linii']) expect(workbook).toContain(`name="${s}"`);
    const allXml = names
      .filter((n) => n.startsWith('xl/') && n.endsWith('.xml'))
      .map((n) => strFromU8(files[n]!))
      .join('\n');
    expect(allXml).toContain('HYPERLINK'); // textul e păstrat
    expect(allXml).toContain('@SUM(A1:A9)');
    expect(allXml).not.toMatch(/<f[ >]/); // nicio celulă-formulă în tot fișierul
  });
});
