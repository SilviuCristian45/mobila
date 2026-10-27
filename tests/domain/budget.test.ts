import { describe, expect, it } from 'vitest';
import {
  clearLineOverride,
  pruneOrphanOverrides,
  removeFinishAssignment,
  removeObject,
  setLineOverride,
} from '@/domain/cascade';
import { computeBudget } from '@/domain/budget';
import { resizeRectInterior, withNodePositions } from '@/domain/geometry';
import { cloneDocument } from '@/domain/factory';
import type { ProjectDocument } from '@/domain/schema';
import { buildScene } from '@/domain/scene';
import { splitGrossOracle } from '../reference/builders';
import { lShapeProject, studioProject } from '../reference/projects';

const line = (b: ReturnType<typeof computeBudget>, key: string) => {
  const l = b.lines.find((x) => x.key === key);
  if (!l) throw new Error(`linie lipsă: ${key}`);
  return l;
};
const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const reverseKeys = (d: ProjectDocument): ProjectDocument => {
  const rev = <T>(o: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(o).reverse());
  return {
    ...d,
    nodes: rev(d.nodes),
    walls: rev(d.walls),
    openings: rev(d.openings),
    rooms: rev(d.rooms),
    objects: rev(d.objects),
    finishAssignments: rev(d.finishAssignments),
    catalogSnapshot: {
      items: rev(d.catalogSnapshot.items),
      finishes: rev(d.catalogSnapshot.finishes),
    },
    budget: { overrides: rev(d.budget.overrides), manualLines: rev(d.budget.manualLines) },
  };
};

// ───────────────────────── Proiect de referință 1: „garsonieră” ─────────────────────────
// Calcul manual (independent de cod):
//  Gresie 60×60, rost 3, 4 buc/cutie, 89,00 lei/cutie (TVA 21% inclus), rebut 10%:
//    aria podelei A = 3900×2900 = 11,31 m²; net = 11,31×1,10 = 12,441 m²; pas 603×603 = 0,363609 m²;
//    12,441/0,363609 = 34,21 → 35 buc → 35/4 = 8,75 → 9 cutii → 9×8900 = 80 100 bani brut.
//  Vopsea (2 straturi, 10 m²/L, doză 2,5 L, 140,00 lei, rebut 5%) pe fețele interioare ale camerei A:
//    w1: 3900×2600 − fereastră 1200×1200 = 10,14 − 1,44 = 8,70; w2: 2900×2600 − ușă 900×2100 = 7,54 − 1,89 = 5,65;
//    w3: 10,14; w4: 7,54; Σ = 32,03 m²; ×1,05 = 33,6315; litri = 33,6315×2/10 = 6,7263; doze = ceil(2,69) = 3 → 42 000 bani.
//  Canapea 2 200,00 lei; lustră (preț suprascris) 250,00 lei; manoperă 11,31 m² × 60,00 lei = 678,60 lei = 67 860 bani.
//  Subtotal brut = 80 100 + 42 000 + 220 000 + 25 000 + 67 860 = 434 960; rezerva 5% se calculează pe net și pe TVA separat.
describe('buget — proiect de referință „garsonieră” (golden, calcul manual)', () => {
  const b = computeBudget(studioProject());

  it('gresie: 35 buc → 9 cutii → 80 100 bani', () => {
    const l = line(b, 'finish:fin.tile.600');
    expect(l.effective.quantity).toBe(9);
    expect(l.unit).toBe('cutie');
    expect(l.totals.grossMinor).toBe(80100);
    const split = splitGrossOracle(80100, 2100);
    expect(l.totals).toEqual({ netMinor: split.net, vatMinor: split.vat, grossMinor: 80100 });
    expect(l.trace.some((s) => s.label === 'Bucăți necesare' && s.result === 35)).toBe(true);
    expect(l.category).toBe('flooring');
  });
  it('vopsea: ariile se însumează ÎNAINTE de rotunjire → 3 doze (rotunjirea per perete ar da 4)', () => {
    const l = line(b, 'finish:fin.paint.white');
    expect(l.effective.quantity).toBe(3);
    expect(l.totals.grossMinor).toBe(42000);
    const areas = [8.7, 5.65, 10.14, 7.54];
    const perWall = areas
      .map((a) => Math.ceil((a * 1.05 * 2) / 10 / 2.5 - 1e-9))
      .reduce((x, y) => x + y, 0);
    expect(perWall).toBe(4); // regresie: varianta naivă ar cumpăra o doză în plus
    expect(l.trace.some((s) => s.label === 'Arie netă totală' && s.result === 33.6315)).toBe(true);
  });
  it('obiecte, suprascriere și manoperă legată de arie', () => {
    expect(line(b, 'object:oSofa').totals.grossMinor).toBe(220000);
    expect(line(b, 'object:oSofa').priceSource).toBe('demo');
    expect(line(b, 'object:oLamp').totals.grossMinor).toBe(25000);
    expect(line(b, 'object:oLamp').priceSource).toBe('user');
    expect(line(b, 'object:oLamp').note).toBe('ales în magazin');
    const labor = line(b, 'manual:mLabor');
    expect(labor.effective.quantity).toBe(11.31);
    expect(labor.totals.grossMinor).toBe(67860);
  });
  it('totaluri: subtotal 434 960, rezervă pe net și TVA separat, total brut 456 708', () => {
    const sub = [80100, 42000, 220000, 25000, 67860].map((g) => splitGrossOracle(g, 2100));
    const net = sub.reduce((a, s) => a + s.net, 0);
    const vat = sub.reduce((a, s) => a + s.vat, 0);
    expect(b.subtotal).toEqual({ netMinor: net, vatMinor: vat, grossMinor: 434960 });
    const cNet = Math.round(net * 0.05);
    const cVat = Math.round(vat * 0.05);
    expect(b.contingency).toEqual({ netMinor: cNet, vatMinor: cVat, grossMinor: cNet + cVat });
    expect(b.total.grossMinor).toBe(456708);
    expect(b.total).toEqual({
      netMinor: net + cNet,
      vatMinor: vat + cVat,
      grossMinor: 434960 + cNet + cVat,
    });
  });
  it('totaluri pe cameră și pe categorie însumează exact subtotalul', () => {
    expect(b.perRoom.rA).toEqual(b.subtotal); // toate liniile din referință sunt în camera A
    const cat = Object.values(b.perCategory).reduce((s, t) => s + t.grossMinor, 0);
    expect(cat).toBe(b.subtotal.grossMinor);
    expect(b.perCategory.labor?.grossMinor).toBe(67860);
  });
  it('fiecare linie are urmă; ultimul pas monetar coincide cu totalul liniei; sumarul are urmă', () => {
    for (const l of b.lines) {
      expect(l.trace.length).toBeGreaterThan(0);
      expect(l.trace.some((s) => s.result === l.totals.grossMinor)).toBe(true);
    }
    expect(b.trace.map((s) => s.label)).toEqual(['Subtotal', 'Rezervă', 'Total']);
    expect(b.trace[2]!.result).toBe(b.total.grossMinor);
  });
  it('linii ordonate după cheie; rezultatul nu depinde de ordinea cheilor din document', () => {
    expect(b.lines.map((l) => l.key)).toEqual([...b.lines.map((l) => l.key)].sort());
    const doc = studioProject();
    expect(computeBudget(reverseKeys(doc))).toEqual(b);
    expect(buildScene(reverseKeys(doc)).hash).toBe(buildScene(doc).hash);
  });
  it('preț fără TVA: net = q×preț, TVA adăugat (9×89,00 = 801,00 → +21% = 168,21)', () => {
    const d = studioProject();
    d.settings.pricesIncludeVat = false;
    expect(line(computeBudget(d), 'finish:fin.tile.600').totals).toEqual({
      netMinor: 80100,
      vatMinor: 16821,
      grossMinor: 96921,
    });
  });
  it('rezervă 0 și TVA 0', () => {
    const d = studioProject();
    d.settings.contingencyBp = 0;
    const z = computeBudget(d);
    expect(z.contingency).toEqual({ netMinor: 0, vatMinor: 0, grossMinor: 0 });
    expect(z.total).toEqual(z.subtotal);
  });
  it('proiect fără conținut → zerouri, fără erori', () => {
    const d = studioProject();
    d.objects = {};
    d.finishAssignments = {};
    d.budget = { overrides: {}, manualLines: {} };
    d.catalogSnapshot = { items: {}, finishes: {} };
    const z = computeBudget(d);
    expect(z.lines).toEqual([]);
    expect(z.total).toEqual({ netMinor: 0, vatMinor: 0, grossMinor: 0 });
  });
});

// ───────────────────────── Proiect de referință 2: cameră în L ─────────────────────────
// Calcul manual:
//  Podea: 22,91 m² (vezi geometrie). Parchet 1200×190, cutie 2,28 m², 150,00 lei/cutie, rebut 7%:
//    22,91×1,07 = 24,5137 m² → /2,28 = 10,75 → 11 cutii → 165 000 bani.
//  Fața de sus w1 are 5900 mm lungime; fereastra 1200×1200 cu pragul la 900 mm, centrată.
//  Faianță 300×600, rost 3 → pas 303×603 = 0,182709 m², 12,00 lei/buc, rebut 10%, bandă 0–1200:
//    5900×1200 = 7,08 m² − fereastră (900..1200 → 300 mm × 1200) 0,36 = 6,72 m²; ×1,10 = 7,392; /0,182709 = 40,46 → 41 buc → 49 200 bani.
//  Vopsea 12 m²/L, 2 straturi, doză 2,5 L, 120,00 lei, rebut 5%, bandă 1200–2600 (1400 mm):
//    5900×1400 = 8,26 − fereastră (1200..2100 → 900 × 1200 = 1,08) = 7,18 m²; ×1,05 = 7,539; litri = 7,539×2/12 = 1,2565 → 1 doză → 12 000 bani.
//  Canapea 2 200,00 lei. Manoperă 22,91 m² × 45,00 lei = 1 030,95 lei = 103 095 bani.
//  Subtotal brut = 165 000 + 49 200 + 12 000 + 220 000 + 103 095 = 549 295 bani.
describe('buget — cameră în L, benzi de finisaj și pachete pe m² (golden, calcul manual)', () => {
  const b = computeBudget(lShapeProject());
  it('parchet pe cutii definite în m²', () => {
    const l = line(b, 'finish:fin.parquet');
    expect(l.effective.quantity).toBe(11);
    expect(l.totals.grossMinor).toBe(165000);
  });
  it('faianță pe bucăți, bandă 0–1200, gol scăzut doar pe porțiunea din bandă', () => {
    const l = line(b, 'finish:fin.faianta');
    expect(l.effective.quantity).toBe(41);
    expect(l.unit).toBe('buc');
    expect(l.totals.grossMinor).toBe(49200);
    expect(l.category).toBe('wall_finish');
  });
  it('vopsea deasupra faianței, bandă 1200–2600', () => {
    const l = line(b, 'finish:fin.paint.12');
    expect(l.effective.quantity).toBe(1);
    expect(l.totals.grossMinor).toBe(12000);
    expect(
      l.trace.some(
        (s) => s.label === 'Arie netă totală' && Math.abs(Number(s.result) - 7.539) < 1e-9,
      ),
    ).toBe(true);
  });
  it('totaluri', () => {
    expect(b.subtotal.grossMinor).toBe(549295);
    const parts = [165000, 49200, 12000, 220000, 103095].map((g) => splitGrossOracle(g, 2100));
    expect(b.subtotal.netMinor).toBe(parts.reduce((s, p) => s + p.net, 0));
    expect(b.subtotal.vatMinor).toBe(parts.reduce((s, p) => s + p.vat, 0));
    expect(Object.keys(b.perRoom)).toEqual(['rL']);
  });
});

// ───────────────────────── Alocare pe camere ─────────────────────────
describe('finisaj folosit în mai multe camere', () => {
  it('Σ pe camere = totalul liniei, la bani; totalurile pe cameră însumează subtotalul', () => {
    const d = studioProject();
    d.finishAssignments.fPaintB = {
      id: 'fPaintB',
      target: { kind: 'wallSide', wallId: 'w6', side: 'right' },
      finishId: 'fin.paint.white',
      wastePct: 5,
    };
    const b = computeBudget(d);
    const l = line(b, 'finish:fin.paint.white');
    expect(Object.keys(l.byRoom).sort()).toEqual(['rA', 'rB']);
    expect(Object.values(l.byRoom).reduce((s, t) => s + t.grossMinor, 0)).toBe(l.totals.grossMinor);
    expect(Object.values(l.byRoom).reduce((s, t) => s + t.netMinor, 0)).toBe(l.totals.netMinor);
    expect(Object.values(b.perRoom).reduce((s, t) => s + t.grossMinor, 0)).toBe(
      b.subtotal.grossMinor,
    );
    // aria pe w6 (fața interioară a camerei B) = 2900×2600 = 7,54 m² din 32,03 + 7,54 → B primește ≈ 19% din linie
    const shareB = l.byRoom.rB!.grossMinor / l.totals.grossMinor;
    expect(Math.abs(shareB - 7.54 / (32.03 + 7.54))).toBeLessThan(1e-3);
  });
});

// ───────────────────────── Separarea suprascrierilor de cantitățile recalculate ─────────────────────────
describe('suprascrieri editabile, separate de valorile recalculate', () => {
  const KEY = 'finish:fin.paint.white';
  it('suprascrierea de cantitate: efectiv ≠ calculat, calculatul rămâne cel din model', () => {
    const d = ok(setLineOverride(studioProject(), KEY, { quantity: 5 }));
    const l = line(computeBudget(d), KEY);
    expect(l.computed.quantity).toBe(3);
    expect(l.effective.quantity).toBe(5);
    expect(l.overridden).toEqual({ quantity: true, unitPriceMinor: false, vatBp: false });
    expect(l.totals.grossMinor).toBe(70000); // 5 × 140,00 lei
    expect(l.trace.some((s) => s.label === 'Cantitate suprascrisă de utilizator')).toBe(true);
  });
  it('modificarea modelului recalculează valoarea calculată, dar suprascrierea rămâne', () => {
    const base = ok(setLineOverride(studioProject(), KEY, { quantity: 5 }));
    const wider = withNodePositions(base, ok(resizeRectInterior(base, 'rA', 'e', 5900))); // camera se lărgește → aria pereților crește (4 doze)
    const l = line(computeBudget(wider), KEY);
    expect(l.computed.quantity).not.toBe(3);
    expect(l.effective.quantity).toBe(5);
    expect(wider.budget.overrides[KEY]).toEqual({ quantity: 5 });
  });
  it('ștergerea suprascrierii readuce valorile calculate', () => {
    const d = clearLineOverride(
      ok(setLineOverride(studioProject(), KEY, { quantity: 5, unitPriceMinor: 1 })),
      KEY,
    );
    expect(line(computeBudget(d), KEY).effective).toEqual(
      line(computeBudget(studioProject()), KEY).computed,
    );
  });
  it('preț demonstrativ → „introdus de utilizator” după editare; revine la demonstrativ după ștergere', () => {
    const base = studioProject();
    expect(line(computeBudget(base), 'object:oSofa').priceSource).toBe('demo');
    const edited = ok(setLineOverride(base, 'object:oSofa', { unitPriceMinor: 199900 }));
    const l = line(computeBudget(edited), 'object:oSofa');
    expect(l.priceSource).toBe('user');
    expect(l.computed.unitPriceMinor).toBe(220000);
    expect(l.effective.unitPriceMinor).toBe(199900);
    expect(
      line(computeBudget(clearLineOverride(edited, 'object:oSofa')), 'object:oSofa').priceSource,
    ).toBe('demo');
  });
  it('excludere: linia rămâne în listă, dispare din totaluri', () => {
    const d = ok(setLineOverride(studioProject(), 'object:oSofa', { excluded: true }));
    const b = computeBudget(d);
    expect(line(b, 'object:oSofa').excluded).toBe(true);
    expect(b.subtotal.grossMinor).toBe(434960 - 220000);
  });
  it('un câmp setat pe null se șterge; o suprascriere goală dispare; chei fără sursă sunt refuzate', () => {
    let d = ok(setLineOverride(studioProject(), 'object:oSofa', { unitPriceMinor: 5, note: 'x' }));
    d = ok(setLineOverride(d, 'object:oSofa', { unitPriceMinor: null, note: null }));
    expect(d.budget.overrides['object:oSofa']).toBeUndefined();
    expect(setLineOverride(studioProject(), 'object:fantoma', { excluded: true }).ok).toBe(false);
    expect(setLineOverride(studioProject(), 'manual:mLabor', { excluded: true }).ok).toBe(false);
  });
  it('ștergerea unui obiect elimină și suprascrierea lui, într-o singură operație', () => {
    const d = ok(removeObject(studioProject(), 'oLamp'));
    expect(d.objects.oLamp).toBeUndefined();
    expect(d.budget.overrides['object:oLamp']).toBeUndefined();
    expect(removeObject(studioProject(), 'nu-exista').ok).toBe(false);
  });
  it('ștergerea ultimei atribuiri a unui finisaj elimină suprascrierea finisajului; atribuirea legată de o linie manuală nu se poate șterge', () => {
    let d = ok(setLineOverride(studioProject(), 'finish:fin.tile.600', { quantity: 12 }));
    d = ok(removeFinishAssignment(d, 'fFloorA'));
    expect(d.budget.overrides['finish:fin.tile.600']).toBeUndefined();
    const bound = studioProject();
    bound.budget.manualLines.mBound = {
      id: 'mBound',
      category: 'labor',
      description: 'x',
      unit: 'm2',
      quantity: 0,
      binding: { kind: 'assignmentArea', assignmentId: 'fFloorA' },
      unitPriceMinor: 100,
      vatBp: 2100,
    };
    expect(removeFinishAssignment(bound, 'fFloorA').ok).toBe(false);
  });
  it('pruneOrphanOverrides curăță doar suprascrierile fără sursă', () => {
    const d = cloneDocument(studioProject());
    d.budget.overrides['object:fantoma'] = { excluded: true };
    d.budget.overrides['finish:fantoma'] = { excluded: true };
    const pruned = pruneOrphanOverrides(d);
    expect(Object.keys(pruned.budget.overrides)).toEqual(['object:oLamp']);
  });
  it('operațiile nu modifică documentul original (imutabilitate)', () => {
    const d = studioProject();
    const snap = JSON.stringify(d);
    setLineOverride(d, 'object:oSofa', { excluded: true });
    removeObject(d, 'oSofa');
    clearLineOverride(d, 'object:oLamp');
    expect(JSON.stringify(d)).toBe(snap);
  });
});

describe('linii manuale', () => {
  it('cantitate introdusă manual sau legată de arii (podea, pereți, atribuire)', () => {
    const d = studioProject();
    d.budget.manualLines.mFree = {
      id: 'mFree',
      category: 'transport',
      description: 'Transport',
      unit: 'lot',
      quantity: 2,
      unitPriceMinor: 15000,
      vatBp: 2100,
    };
    d.budget.manualLines.mWalls = {
      id: 'mWalls',
      category: 'labor',
      description: 'Zugrăvit',
      roomId: 'rA',
      unit: 'm2',
      quantity: 0,
      binding: { kind: 'roomWallArea', roomId: 'rA' },
      unitPriceMinor: 1000,
      vatBp: 2100,
    };
    d.budget.manualLines.mAssign = {
      id: 'mAssign',
      category: 'labor',
      description: 'Un perete',
      unit: 'm2',
      quantity: 0,
      binding: { kind: 'assignmentArea', assignmentId: 'fPaint0' },
      unitPriceMinor: 1000,
      vatBp: 2100,
    };
    const b = computeBudget(d);
    expect(line(b, 'manual:mFree').totals.grossMinor).toBe(30000);
    expect(line(b, 'manual:mWalls').effective.quantity).toBe(32.03); // Σ fețe interioare − goluri (calcul manual)
    expect(line(b, 'manual:mAssign').effective.quantity).toBe(8.7); // w1: 3900×2600 − 1200×1200
    expect(line(b, 'manual:mAssign').byRoom).toHaveProperty('rA');
  });
  it('linia manuală legată urmărește modelul', () => {
    const base = studioProject();
    const grown = withNodePositions(base, ok(resizeRectInterior(base, 'rA', 'e', 4900)));
    expect(line(computeBudget(grown), 'manual:mLabor').effective.quantity).toBe(14.21); // 4900×2900 = 14,21 m²
  });
});
