// Etapa 6a: operații pe bugetul din document (linii manuale, setări), proprietatea „Σ linii = total” și exportul CSV.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PRICE_SOURCE_LABELS_RO,
  addManualLine,
  computeBudget,
  removeManualLine,
  setBudgetSettings,
  updateManualLine,
  type ManualLineInput,
} from '@/domain/budget';
import { CSV_HEADER, budgetToCsv, csvCell } from '@/domain';
import { setLineOverride } from '@/domain/cascade';
import type { ProjectDocument } from '@/domain/schema';
import { studioProject } from '../reference/projects';

const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const fail = (r: { ok: boolean; error?: string }): string => {
  if (r.ok) throw new Error('operația trebuia respinsă');
  return r.error ?? '';
};
let n = 0;
const genId = () => `ml${++n}`;
const BASE: ManualLineInput = {
  category: 'labor',
  description: 'Montaj gresie',
  unit: 'h',
  quantity: 8,
  unitPriceMinor: 5000,
  vatBp: 1900,
};
const frozen = (d: ProjectDocument) => JSON.stringify(d);

/** Parser CSV minimal (RFC 4180) pentru verificarea textului exportat. */
function parseCsv(text: string, sep: string): string[][] {
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
    else if (c === sep) {
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
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

describe('addManualLine / updateManualLine / removeManualLine', () => {
  it('adaugă o linie validă fără să modifice documentul primit; apare în buget cu totalul calculat', () => {
    const doc = studioProject();
    const before = frozen(doc);
    const next = ok(addManualLine(doc, genId, { ...BASE, roomId: 'rA' }));
    expect(frozen(doc)).toBe(before);
    const [id] = Object.keys(next.budget.manualLines);
    expect(next.budget.manualLines[id!]).toMatchObject({
      description: 'Montaj gresie',
      roomId: 'rA',
    });
    const line = computeBudget(next).lines.find((l) => l.key === `manual:${id}`)!;
    expect(line.origin).toBe('manual');
    expect(line.priceSource).toBe('user');
    expect(line.byRoom).toHaveProperty('rA');
  });

  it('respinge, cu mesaj în română și fără efect, date invalide', () => {
    const doc = studioProject();
    const cases: Array<[Partial<ManualLineInput>, RegExp]> = [
      [{ description: '   ' }, /Descrierea/],
      [{ description: 'x'.repeat(201) }, /cel mult 200/],
      [{ quantity: -1 }, /Cantitatea/],
      [{ quantity: Number.NaN }, /Cantitatea/],
      [{ unitPriceMinor: -5 }, /Prețul/],
      [{ unitPriceMinor: 10.5 }, /Prețul/],
      [{ vatBp: -1 }, /TVA/],
      [{ vatBp: 100_001 }, /TVA/],
      [{ roomId: 'nu-exista' }, /Camera/],
      [{ binding: { kind: 'roomFloorArea', roomId: 'nu-exista' } }, /Camera/],
      [{ binding: { kind: 'assignmentArea', assignmentId: 'nu-exista' } }, /Atribuirea/],
      [{ note: 'n'.repeat(1001) }, /Nota/],
    ];
    for (const [patch, re] of cases) {
      expect(fail(addManualLine(doc, genId, { ...BASE, ...patch }))).toMatch(re);
    }
    expect(Object.keys(doc.budget.manualLines)).toEqual(['mLabor']); // doar linia deja existentă în proiectul de referință
  });

  it('identificatorul generat nu se ciocnește cu unul existent; după prea multe ciocniri, eroare', () => {
    const doc = ok(addManualLine(studioProject(), () => 'fix', BASE));
    const seq = ['fix', 'fix', 'altul'];
    const next = ok(addManualLine(doc, () => seq.shift()!, BASE));
    expect(Object.keys(next.budget.manualLines).sort()).toEqual(['altul', 'fix', 'mLabor']);
    expect(fail(addManualLine(doc, () => 'fix', BASE))).toMatch(/identificator/);
    expect(fail(addManualLine(doc, () => '../rau', BASE))).toMatch(/identificator/);
  });

  it('update: modifică doar câmpurile date; `null` șterge câmpurile opționale; ID inexistent sau valoare invalidă => respins', () => {
    const doc = ok(
      addManualLine(studioProject(), () => 'a', {
        ...BASE,
        roomId: 'rA',
        note: 'inițială',
        binding: { kind: 'roomFloorArea', roomId: 'rA' },
      }),
    );
    const upd = ok(updateManualLine(doc, 'a', { unitPriceMinor: 7000, note: null, binding: null }));
    expect(upd.budget.manualLines.a).toMatchObject({
      unitPriceMinor: 7000,
      description: 'Montaj gresie',
      roomId: 'rA',
    });
    expect(upd.budget.manualLines.a).not.toHaveProperty('note');
    expect(upd.budget.manualLines.a).not.toHaveProperty('binding');
    expect(
      ok(updateManualLine(upd, 'a', { roomId: null })).budget.manualLines.a,
    ).not.toHaveProperty('roomId');
    expect(fail(updateManualLine(doc, 'zzz', { quantity: 1 }))).toMatch(/nu mai există/);
    expect(fail(updateManualLine(doc, 'a', { quantity: -3 }))).toMatch(/Cantitatea/);
    expect(doc.budget.manualLines.a!.unitPriceMinor).toBe(5000); // originalul neatins
  });

  it('excluded: true/false se păstrează; o linie exclusă nu intră în total', () => {
    const doc = ok(addManualLine(studioProject(), () => 'a', BASE));
    const total = computeBudget(doc).total.grossMinor;
    const excl = ok(updateManualLine(doc, 'a', { excluded: true }));
    const without = computeBudget(studioProject()).total.grossMinor;
    expect(computeBudget(excl).total.grossMinor).toBe(without);
    expect(computeBudget(excl).lines.find((l) => l.key === 'manual:a')!.excluded).toBe(true);
    expect(total).toBeGreaterThan(without);
    expect(
      computeBudget(ok(updateManualLine(excl, 'a', { excluded: false }))).total.grossMinor,
    ).toBe(total);
  });

  it('remove: șterge linia; inexistentă => respins', () => {
    const doc = ok(addManualLine(studioProject(), () => 'a', BASE));
    expect(Object.keys(ok(removeManualLine(doc, 'a')).budget.manualLines)).toEqual(['mLabor']);
    expect(fail(removeManualLine(doc, 'zzz'))).toMatch(/nu mai există/);
  });

  it('cantitate legată de aria podelei: se calculează din model, nu din câmpul `quantity`', () => {
    const doc = ok(
      addManualLine(studioProject(), () => 'a', {
        ...BASE,
        unit: 'm2',
        binding: { kind: 'roomFloorArea', roomId: 'rA' },
      }),
    );
    // legarea de arie se calculează din model: 11,31 m² (interior 3900×2900), preț 50 RON/m² fără TVA 19%
    const line = computeBudget(doc).lines.find((l) => l.key === 'manual:a')!;
    expect(line.effective.quantity).toBe(11.31);
  });
});

describe('setBudgetSettings', () => {
  it('schimbă moneda, modul TVA, TVA implicit și rezerva; documentul primit rămâne neatins', () => {
    const doc = { ...studioProject(), objects: {} } as ProjectDocument; // fără obiecte cu preț în RON, moneda se poate schimba
    const before = frozen(doc);
    const next = ok(
      setBudgetSettings(doc, {
        currency: 'EUR',
        pricesIncludeVat: !doc.settings.pricesIncludeVat,
        defaultVatBp: 900,
        contingencyBp: 500,
      }),
    );
    expect(frozen(doc)).toBe(before);
    expect(next.settings).toMatchObject({
      currency: 'EUR',
      defaultVatBp: 900,
      contingencyBp: 500,
      pricesIncludeVat: !doc.settings.pricesIncludeVat,
    });
    expect(next.budget).toEqual(doc.budget); // suprascrierile și liniile manuale rămân
  });

  it('respinge valori invalide', () => {
    const doc = studioProject();
    expect(fail(setBudgetSettings(doc, { currency: 'ron' }))).toMatch(/3 litere/);
    expect(fail(setBudgetSettings(doc, { currency: 'LEI1' }))).toMatch(/3 litere/);
    expect(fail(setBudgetSettings(doc, { contingencyBp: -1 }))).toMatch(/Rezerva/);
    expect(fail(setBudgetSettings(doc, { defaultVatBp: 1.5 }))).toMatch(/TVA implicit/);
  });

  it('modul TVA schimbă totalurile conform formulei, iar revenirea le readuce exact (reversibil)', () => {
    const doc = ok(setBudgetSettings(studioProject(), { pricesIncludeVat: false }));
    const a = computeBudget(doc);
    const b = computeBudget(ok(setBudgetSettings(doc, { pricesIncludeVat: true })));
    expect(b.total.grossMinor).not.toBe(a.total.grossMinor);
    expect(computeBudget(ok(setBudgetSettings(doc, { pricesIncludeVat: false }))).total).toEqual(
      a.total,
    );
  });
});

describe('proprietate: Σ liniilor incluse = total, pentru orice combinație de suprascrieri', () => {
  const base = studioProject();
  // doar liniile derivate au suprascrieri; proiectul de referință are și o linie manuală
  const keys = computeBudget(base)
    .lines.filter((l) => l.origin === 'derived')
    .map((l) => l.key);
  const overrideArb = fc.record(
    {
      quantity: fc.integer({ min: 0, max: 4000 }).map((x) => x / 100),
      unitPriceMinor: fc.integer({ min: 0, max: 1_000_000 }),
      vatBp: fc.integer({ min: 0, max: 3000 }),
      excluded: fc.boolean(),
    },
    { requiredKeys: [] },
  );
  const manualArb = fc.record({
    quantity: fc.integer({ min: 0, max: 2000 }).map((x) => x / 100),
    unitPriceMinor: fc.integer({ min: 0, max: 500_000 }),
    vatBp: fc.integer({ min: 0, max: 3000 }),
    excluded: fc.boolean(),
    roomId: fc.constantFrom('rA', 'rB', null),
  });

  it('subtotal, pe categorii, pe camere și total sunt consistente (ambele moduri TVA, orice rezervă)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...keys), overrideArb), { maxLength: 8 }),
        fc.array(manualArb, { maxLength: 3 }),
        fc.boolean(),
        fc.integer({ min: 0, max: 5000 }),
        (overrides, manuals, includeVat, contingencyBp) => {
          let doc = ok(setBudgetSettings(base, { pricesIncludeVat: includeVat, contingencyBp }));
          for (const [key, patch] of overrides) doc = ok(setLineOverride(doc, key, patch));
          let i = 0;
          for (const m of manuals)
            doc = ok(
              addManualLine(doc, () => `m${i++}`, {
                ...BASE,
                ...m,
                roomId: m.roomId,
              }),
            );
          const b = computeBudget(doc);
          const included = b.lines.filter((l) => !l.excluded);
          const sum = (f: (l: (typeof b.lines)[number]) => number) =>
            included.reduce((a, l) => a + f(l), 0);
          expect(b.subtotal.netMinor).toBe(sum((l) => l.totals.netMinor));
          expect(b.subtotal.vatMinor).toBe(sum((l) => l.totals.vatMinor));
          expect(b.subtotal.grossMinor).toBe(sum((l) => l.totals.grossMinor));
          for (const l of b.lines)
            expect(l.totals.netMinor + l.totals.vatMinor).toBe(l.totals.grossMinor);
          const cat = Object.values(b.perCategory).reduce((a, t) => a + t!.grossMinor, 0);
          const room = Object.values(b.perRoom).reduce((a, t) => a + t.grossMinor, 0);
          expect(cat).toBe(b.subtotal.grossMinor);
          expect(room).toBe(b.subtotal.grossMinor);
          expect(b.total.grossMinor).toBe(b.subtotal.grossMinor + b.contingency.grossMinor);
          // alocarea pe camere a fiecărei linii însumează exact totalul liniei
          for (const l of b.lines)
            expect(Object.values(l.byRoom).reduce((a, t) => a + t.grossMinor, 0)).toBe(
              l.totals.grossMinor,
            );
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe('budgetToCsv', () => {
  it('începe cu BOM, are antet, CRLF și o linie per linie de buget + subtotal/rezervă/total + avertisment', () => {
    const doc = studioProject();
    const summary = computeBudget(doc);
    const csv = budgetToCsv(doc, summary);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv).not.toMatch(/[^\r]\n/); // doar CRLF
    const rows = parseCsv(csv.slice(1), ';');
    expect(rows[0]).toEqual([...CSV_HEADER]);
    expect(rows.slice(1, 1 + summary.lines.length).map((r) => r[0])).toEqual(
      summary.lines.map((l) => l.key),
    );
    expect(rows.every((r) => r.length === CSV_HEADER.length)).toBe(true);
    const labels = rows.map((r) => r[3] ?? '');
    expect(labels.some((t) => t.startsWith('Subtotal'))).toBe(true);
    expect(labels.some((t) => t.startsWith('Rezervă'))).toBe(true);
    expect(labels.some((t) => t.startsWith('Total'))).toBe(true);
    expect(labels.some((t) => t.startsWith('Estimare orientativă'))).toBe(true);
    expect(budgetToCsv(doc, summary, { bom: false }).startsWith('﻿')).toBe(false);
  });

  it('format numeric: cu `;` virgulă zecimală, cu `,` punct zecimal; valori calculate manual (2,5 × 1234,50, TVA 19%, fără TVA în preț)', () => {
    const doc = ok(
      addManualLine(
        ok(setBudgetSettings(studioProject(), { pricesIncludeVat: false })),
        () => 'x',
        {
          ...BASE,
          description: 'Linie de verificare',
          quantity: 2.5,
          unit: 'm2',
          unitPriceMinor: 123450,
          vatBp: 1900,
        },
      ),
    );
    const summary = computeBudget(doc);
    // net = round(2,5 × 123450) = 308625; TVA = round(308625 × 1900 / 10000) = 58639 (58638,75); brut = 367264
    const semi = parseCsv(budgetToCsv(doc, summary).slice(1), ';').find(
      (r) => r[0] === 'manual:x',
    )!;
    expect(semi.slice(5, 12)).toEqual([
      '2,5',
      'm²',
      '1234,50',
      '19',
      '3086,25',
      '586,39',
      '3672,64',
    ]);
    const comma = parseCsv(budgetToCsv(doc, summary, { separator: ',' }).slice(1), ',').find(
      (r) => r[0] === 'manual:x',
    )!;
    expect(comma.slice(5, 12)).toEqual([
      '2.5',
      'm²',
      '1234.50',
      '19',
      '3086.25',
      '586.39',
      '3672.64',
    ]);
    const tab = parseCsv(budgetToCsv(doc, summary, { separator: '\t' }).slice(1), '\t').find(
      (r) => r[0] === 'manual:x',
    )!;
    expect(tab.length).toBe(CSV_HEADER.length);
  });

  it('rândurile de total reproduc exact sumarul', () => {
    const doc = studioProject();
    const summary = computeBudget(doc);
    const rows = parseCsv(budgetToCsv(doc, summary).slice(1), ';');
    const get = (prefix: string) => rows.find((r) => r[3]!.startsWith(prefix))!;
    const cents = (s: string) => Math.round(Number(s.replace(',', '.')) * 100);
    for (const [prefix, t] of [
      ['Subtotal', summary.subtotal],
      ['Rezervă', summary.contingency],
      ['Total', summary.total],
    ] as const) {
      const r = get(prefix);
      expect([cents(r[9]!), cents(r[10]!), cents(r[11]!)]).toEqual([
        t.netMinor,
        t.vatMinor,
        t.grossMinor,
      ]);
    }
  });

  it('protecție formule: =, +, -, @, tab și CR la început se prefixează cu apostrof (descriere, notă, nume cameră); HYPERLINK rămâne text', () => {
    let doc = ok(
      addManualLine(studioProject(), () => 'f', {
        ...BASE,
        description: '=HYPERLINK("http://exemplu.ro";"clic")',
        note: '@SUM(A1:A9)',
      }),
    );
    doc = ok(addManualLine(doc, () => 'g', { ...BASE, description: '+1+1', note: '-2' }));
    doc = ok(addManualLine(doc, () => 'h', { ...BASE, description: '\t=cmd', note: '\r=cmd' }));
    const rows = parseCsv(budgetToCsv(doc, computeBudget(doc)).slice(1), ';');
    const f = rows.find((r) => r[0] === 'manual:f')!;
    expect(f[3]).toBe(`'=HYPERLINK("http://exemplu.ro";"clic")`);
    expect(f[15]).toBe("'@SUM(A1:A9)");
    const g = rows.find((r) => r[0] === 'manual:g')!;
    expect([g[3], g[15]]).toEqual(["'+1+1", "'-2"]);
    const h = rows.find((r) => r[0] === 'manual:h')!;
    expect(h[3]!.startsWith("'")).toBe(true);
    expect(h[15]!.startsWith("'")).toBe(true);
    // nicio celulă de text din export nu începe cu un caracter de formulă
    for (const r of rows) for (const c of r) expect(c).not.toMatch(/^[=+\-@\t\r]/);
  });

  it('ghilimele, separator și rând nou în text se protejează; roundtrip prin parser', () => {
    const doc = ok(
      addManualLine(studioProject(), () => 'q', {
        ...BASE,
        description: 'Cu "ghilimele"; și separator',
        note: 'linia 1\nlinia 2',
      }),
    );
    const rows = parseCsv(budgetToCsv(doc, computeBudget(doc)).slice(1), ';');
    const q = rows.find((r) => r[0] === 'manual:q')!;
    expect(q[3]).toBe('Cu "ghilimele"; și separator');
    expect(q[15]).toBe('linia 1\nlinia 2');
    expect(csvCell('fără probleme', ';')).toBe('fără probleme');
    expect(csvCell('a;b', ';')).toBe('"a;b"');
    expect(csvCell('a;b', ',')).toBe('a;b');
  });

  it('marcare: fiecare linie cu preț demonstrativ e marcată „Preț demonstrativ”; o linie cu preț editat e „Introdus de utilizator”; modificările sunt listate', () => {
    let doc = studioProject();
    const before = computeBudget(doc);
    const demo = before.lines.filter((l) => l.priceSource === 'demo');
    expect(demo.length).toBeGreaterThan(0);
    const edited = demo[0]!.key;
    doc = ok(setLineOverride(doc, edited, { unitPriceMinor: 12345, quantity: 3 }));
    doc = ok(addManualLine(doc, () => 'm', BASE));
    const summary = computeBudget(doc);
    const rows = parseCsv(budgetToCsv(doc, summary).slice(1), ';');
    for (const l of summary.lines) {
      const r = rows.find((x) => x[0] === l.key)!;
      expect(r[12]).toBe(PRICE_SOURCE_LABELS_RO[l.priceSource]);
      if (l.priceSource === 'demo') expect(r[12]).toBe('Preț demonstrativ');
    }
    const row = rows.find((r) => r[0] === edited)!;
    expect(row[12]).toBe('Introdus de utilizator');
    expect(row[13]).toBe('cantitate, preț');
    expect(rows.find((r) => r[0] === 'manual:m')![13]).toBe('');
  });

  it('linie exclusă: apare cu „Nu”, iar totalul exportat nu o include', () => {
    let doc = studioProject();
    const key = computeBudget(doc).lines[0]!.key;
    doc = ok(setLineOverride(doc, key, { excluded: true }));
    const summary = computeBudget(doc);
    const rows = parseCsv(budgetToCsv(doc, summary).slice(1), ';');
    expect(rows.find((r) => r[0] === key)![14]).toBe('Nu');
    const total = rows.find((r) => r[3]!.startsWith('Total'))!;
    expect(Math.round(Number(total[11]!.replace(',', '.')) * 100)).toBe(summary.total.grossMinor);
  });
});

describe('setBudgetSettings: schimbarea monedei', () => {
  it('refuzată, cu explicație, dacă un obiect din proiect are preț de catalog în altă monedă; documentul rămâne neatins', () => {
    const doc = studioProject();
    const before = frozen(doc);
    const msg = fail(setBudgetSettings(doc, { currency: 'EUR' }));
    expect(msg).toMatch(/Moneda nu se poate schimba în EUR/);
    expect(msg).toMatch(/sunt în RON și nu se convertesc automat/);
    expect(frozen(doc)).toBe(before);
  });

  it('permisă când nu există obiecte cu preț în altă monedă, și când moneda rămâne aceeași', () => {
    const doc = studioProject();
    expect(ok(setBudgetSettings(doc, { currency: 'RON' })).settings.currency).toBe('RON');
    const empty = { ...doc, objects: {} } as ProjectDocument;
    expect(ok(setBudgetSettings(empty, { currency: 'EUR' })).settings.currency).toBe('EUR');
  });
});
