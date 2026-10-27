import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate, computeBudget } from '@/domain/budget';
import { referenceProject } from '@/domain/fixtures';

// Valorile așteptate sunt calculate MANUAL (în comentarii), independent de cod:
//  Gresie: 11,31 m² × 1,10 = 12,441 → /0,36 = 34,56 → 35 buc → /4 = 8,75 → 9 cutii × 89,00 lei = 801,00 lei (brut, TVA inclus 21%)
//          net = round(80100·10000/12100) = 66198 ; TVA = 13902
//  Vopsea: fețe A = 8,70 + 5,65 + 10,14 + 7,54 = 32,03 m² ; ×1,05 = 33,6315 ; ×2/10 = 6,7263 L ; /2,5 = 2,69 → 3 doze × 140,00 = 420,00 lei
//          net = round(42000·10000/12100) = 34711 ; TVA = 7289
//  Canapea: 2200,00 brut → net 181818, TVA 38182. Lustră (preț suprascris 250,00): net 20661, TVA 4339.
//  Manoperă: 11,31 m² × 60,00 = 678,60 → net 56083, TVA 11777
//  Subtotal brut = 80100+42000+220000+25000+67860 = 434960 ; net 359471 ; TVA 75489
//  Rezervă 5%: net round(17973,55)=17974 ; TVA round(3774,45)=3774 → 21748. Total brut 456708 (net 377445 + TVA 79263).
describe('buget — proiect de referință (golden, calcul manual)', () => {
  const b = computeBudget(referenceProject());
  const line = (k: string) => b.lines.find((l) => l.key === k)!;

  it('gresie', () => {
    const l = line('finish:fin.tile.600');
    expect(l.purchaseQuantity).toBe(9); expect(l.unit).toBe('cutie');
    expect([l.netMinor, l.vatMinor, l.grossMinor]).toEqual([66198, 13902, 80100]);
    expect(l.trace.some((s) => s.label === 'Plăci necesare' && s.result === 35)).toBe(true);
  });
  it('vopsea: cantitatea se agregă ÎNAINTE de rotunjire (3 doze, nu 4)', () => {
    const l = line('finish:fin.paint.white');
    expect(l.purchaseQuantity).toBe(3);
    expect([l.netMinor, l.vatMinor, l.grossMinor]).toEqual([34711, 7289, 42000]);
    // alternativa naivă (rotunjire per atribuire) ar da 4 doze:
    const perAssign = [8.7, 5.65, 10.14, 7.54].map((a) => Math.ceil(((a * 1.05 * 2) / 10 / 2.5) - 1e-9));
    expect(perAssign.reduce((x, y) => x + y, 0)).toBe(4);
  });
  it('obiecte, suprascriere, manoperă legată de arie', () => {
    expect([line('object:oSofa').netMinor, line('object:oSofa').vatMinor]).toEqual([181818, 38182]);
    expect(line('object:oLamp').priceSource).toBe('user');
    expect([line('object:oLamp').netMinor, line('object:oLamp').vatMinor]).toEqual([20661, 4339]);
    expect(line('object:oSofa').priceSource).toBe('demo');
    expect(line('manual:mLabor').purchaseQuantity).toBeCloseTo(11.31, 9);
    expect([line('manual:mLabor').netMinor, line('manual:mLabor').vatMinor]).toEqual([56083, 11777]);
  });
  it('totaluri', () => {
    expect(b.subtotal).toEqual({ netMinor: 359471, vatMinor: 75489, grossMinor: 434960 });
    expect(b.contingency).toEqual({ netMinor: 17974, vatMinor: 3774, grossMinor: 21748 });
    expect(b.total).toEqual({ netMinor: 377445, vatMinor: 79263, grossMinor: 456708 });
    expect(b.perRoom.rA).toEqual(b.subtotal); // tot ce e în referință este în camera A
  });
  it('suprascriere de cantitate și excludere', () => {
    const d = referenceProject();
    d.budget.overrides['finish:fin.tile.600'] = { quantity: 10 };
    d.budget.overrides['object:oSofa'] = { excluded: true };
    const x = computeBudget(d);
    expect(x.lines.find((l) => l.key === 'finish:fin.tile.600')!.grossMinor).toBe(89000);
    expect(x.subtotal.grossMinor).toBe(434960 - 80100 + 89000 - 220000);
  });
  it('preț fără TVA inclus: net = q×preț, TVA adăugat', () => {
    const d = referenceProject(); d.settings.pricesIncludeVat = false;
    const l = computeBudget(d).lines.find((x) => x.key === 'finish:fin.tile.600')!;
    expect([l.netMinor, l.vatMinor, l.grossMinor]).toEqual([80100, 16821, 96921]);
  });
});

describe('alocare pe camere', () => {
  it('proprietate: suma părților = totalul, oricare ar fi ponderile', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1_000_000 }), fc.array(fc.double({ min: 0.001, max: 100, noNaN: true }), { minLength: 1, maxLength: 8 }), (total, ws) => {
      const w = Object.fromEntries(ws.map((x, i) => [`r${i}`, x]));
      const out = allocate(total, w);
      expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(total);
      expect(Object.values(out).every((v) => v >= 0)).toBe(true);
    }));
  });
  it('vopsea în două camere: Σ pe camere = totalul liniei', () => {
    const d = referenceProject();
    d.finishAssignments.fPaintB = { id: 'fPaintB', target: { kind: 'wallSide', wallId: 'w6', side: 'right' }, finishId: 'fin.paint.white', wastePct: 5 };
    const b = computeBudget(d);
    const l = b.lines.find((x) => x.key === 'finish:fin.paint.white')!;
    expect(Object.keys(l.byRoom).sort()).toEqual(['rA', 'rB']);
    const sum = Object.values(l.byRoom).reduce((a, r) => a + r.grossMinor, 0);
    expect(sum).toBe(l.grossMinor);
    expect(b.perRoom.rA!.grossMinor + b.perRoom.rB!.grossMinor).toBe(b.subtotal.grossMinor);
  });
});

describe('proprietate: Σ linii = subtotal pentru orice combinație de suprascrieri', () => {
  it('random', () => {
    fc.assert(fc.property(fc.record({ p: fc.integer({ min: 0, max: 500000 }), q: fc.integer({ min: 0, max: 40 }), ex: fc.boolean() }), ({ p, q, ex }) => {
      const d = referenceProject();
      d.budget.overrides['finish:fin.paint.white'] = { unitPriceMinor: p, quantity: q, excluded: ex };
      const b = computeBudget(d);
      const s = b.lines.filter((l) => !l.excluded).reduce((a, l) => a + l.grossMinor, 0);
      expect(b.subtotal.grossMinor).toBe(s);
      expect(Object.values(b.perRoom).reduce((a, t) => a + t.grossMinor, 0)).toBe(s);
      for (const l of b.lines) expect(l.netMinor + l.vatMinor).toBe(l.grossMinor);
    }), { numRuns: 200 });
  });
});
