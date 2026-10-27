import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate, ceilEps, lineMoney, roundHalfAway, roundQty } from '@/domain/money';
import { finishConfigProblems, m2OfMm2, purchaseQuantity } from '@/domain/quantities';
import { finish, netToGrossOracle, splitGrossOracle } from '../reference/builders';

describe('rotunjiri', () => {
  it('half away from zero', () => {
    expect([0.5, 1.5, 2.5, 2.4999999, -0.5, -1.5, 0].map(roundHalfAway)).toEqual([
      1, 2, 3, 2, -1, -2, 0,
    ]);
    expect(Object.is(roundHalfAway(-0.2), 0)).toBe(true); // regresie: nu produce −0
    expect(Object.is(roundQty(-0.0004), 0)).toBe(true);
  });
  it('cantități la 1e-3', () => {
    expect([11.3099999, 11.31, 0.0005, 0.0004999].map(roundQty)).toEqual([11.31, 11.31, 0.001, 0]);
  });
  it('ceilEps: o valoare ușor peste un întreg din cauza virgulei mobile NU urcă la următorul', () => {
    expect(1.08 / 0.36).toBeGreaterThan(3); // 3.0000000000000004 în IEEE-754
    expect(Math.ceil(1.08 / 0.36)).toBe(4); // capcana
    expect(ceilEps(1.08 / 0.36)).toBe(3);
    expect(ceilEps(2.16 / 0.36)).toBe(6);
    expect(ceilEps(10.000001)).toBe(11); // peste toleranță rămâne în sus
    expect(ceilEps(0)).toBe(0);
  });
  it('m2OfMm2 elimină zgomotul de virgulă mobilă', () => {
    expect(m2OfMm2(11_310_000.000000002)).toBe(11.31);
  });
});

describe('banii unei linii (preț cu TVA / fără TVA)', () => {
  it('preț cu TVA 21%: 9 × 89,00 lei → brut 80100, net 66198, TVA 13902 (calcul manual: 80100/1,21 = 66198,35)', () => {
    expect(lineMoney(9, 8900, 2100, true).value).toEqual({
      netMinor: 66198,
      vatMinor: 13902,
      grossMinor: 80100,
    });
  });
  it('preț fără TVA: net = q × preț, TVA se adaugă (9 × 8900 = 80100; 21% = 16821)', () => {
    expect(lineMoney(9, 8900, 2100, false).value).toEqual({
      netMinor: 80100,
      vatMinor: 16821,
      grossMinor: 96921,
    });
  });
  it('rotunjirea pe linie: o singură dată, half away (0,5 × 3 bani = 1,5 → 2)', () => {
    expect(lineMoney(0.5, 3, 0, true).value.grossMinor).toBe(2);
    expect(lineMoney(1.005, 1000, 0, true).value.grossMinor).toBe(1005);
  });
  it('urma conține fiecare pas al calculului', () => {
    const t = lineMoney(11.31, 6000, 2100, true).trace;
    expect(t.map((s) => s.label)).toEqual([
      'Total brut linie',
      'Net linie (preț cu TVA)',
      'TVA linie',
    ]);
    expect(t[0]!.result).toBe(67860);
  });
  it('intrări invalide → excepție (preț ne-întreg, valori negative)', () => {
    expect(() => lineMoney(1, 10.5, 2100, true)).toThrow(RangeError);
    expect(() => lineMoney(-1, 100, 2100, true)).toThrow(RangeError);
    expect(() => lineMoney(1, 100, 21.5, true)).toThrow(RangeError);
  });
  it('proprietate (oracol BigInt independent): net + TVA = brut și rezultatele coincid cu rotunjirea exactă pe raționale', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.constantFrom(0, 500, 900, 1100, 1900, 2100),
        (gross, bp) => {
          const m = lineMoney(1, gross, bp, true).value;
          expect(m.netMinor + m.vatMinor).toBe(m.grossMinor);
          const o = splitGrossOracle(gross, bp);
          expect([m.netMinor, m.vatMinor]).toEqual([o.net, o.vat]);
        },
      ),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.constantFrom(0, 500, 1100, 2100),
        (net, bp) => {
          const m = lineMoney(1, net, bp, false).value;
          const o = netToGrossOracle(net, bp);
          expect([m.vatMinor, m.grossMinor]).toEqual([o.vat, o.gross]);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('alocarea pe camere (cea mai mare rămășiță)', () => {
  it('exemplu: 100 bani în părți egale 1:1:1 → 34/33/33 (rămășițele egale se rezolvă după cheie)', () => {
    expect(allocate(100, { a: 1, b: 1, c: 1 })).toEqual({ a: 34, b: 33, c: 33 });
  });
  it('proprietate: suma părților = totalul, părți ≥ 0, independentă de ordinea cheilor', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(fc.double({ min: 0.001, max: 100, noNaN: true }), { minLength: 1, maxLength: 8 }),
        (total, ws) => {
          const w = Object.fromEntries(ws.map((x, i) => [`r${i}`, x]));
          const rev = Object.fromEntries(Object.entries(w).reverse());
          const out = allocate(total, w);
          expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(total);
          expect(Object.values(out).every((v) => v >= 0)).toBe(true);
          expect(allocate(total, rev)).toEqual(out);
        },
      ),
      { numRuns: 300 },
    );
  });
  it('ponderi toate zero → totul la prima cheie; total ne-întreg → excepție', () => {
    expect(allocate(7, { b: 0, a: 0 })).toEqual({ a: 7, b: 0 });
    expect(() => allocate(7.5, { a: 1 })).toThrow(RangeError);
  });
});

describe('cantități de achiziție', () => {
  const tile = finish({ id: 't', kind: 'tile' }); // 600×600, rost 3, 4 buc/cutie
  it('gresie: pasul include rostul (603×603 = 0,363609 m²) → 12,441 m² → 35 buc → 9 cutii', () => {
    const q = purchaseQuantity(tile, 11.31 * 1.1);
    expect(q.value).toMatchObject({ purchase: 9, unit: 'cutie' });
    expect(q.trace.map((s) => s.result)).toEqual([35, 9]);
  });
  it('limită: aria netă = exact N bucăți → N (nu N+1)', () => {
    const exact = finish({
      id: 'e',
      kind: 'tile',
      tile: { pieceWidthMm: 600, pieceHeightMm: 600, groutMm: 0, piecesPerBox: 5 },
    });
    expect(purchaseQuantity(exact, 1.08).trace[0]!.result).toBe(3); // 1,08 / 0,36 = 3,0000000000000004
    expect(purchaseQuantity(exact, 1.0801).trace[0]!.result).toBe(4);
  });
  it('cutie definită pe m² (parchet): ceil(arie / m² per cutie)', () => {
    const parquet = finish({
      id: 'p',
      kind: 'parquet',
      tile: { pieceWidthMm: 1200, pieceHeightMm: 190, groutMm: 0, boxCoverageM2: 2.28 },
    });
    expect(purchaseQuantity(parquet, 22.91 * 1.07).value.purchase).toBe(11); // 24,5137 / 2,28 = 10,75
    expect(purchaseQuantity(parquet, 2.28).value.purchase).toBe(1);
    expect(purchaseQuantity(parquet, 2.2801).value.purchase).toBe(2);
  });
  it('preț pe bucată și pe m²', () => {
    const piece = finish({
      id: 'pc',
      kind: 'wall_tile',
      priceUnit: 'piece',
      tile: { pieceWidthMm: 300, pieceHeightMm: 600, groutMm: 3 },
    });
    expect(purchaseQuantity(piece, 7.392).value).toMatchObject({ purchase: 41, unit: 'buc' }); // 7,392 / 0,182709 = 40,46
    const m2 = finish({ id: 'm', kind: 'tile', priceUnit: 'm2' });
    expect(purchaseQuantity(m2, 12.441).value).toMatchObject({ purchase: 12.45, unit: 'm2' });
  });
  it('vopsea: doze (3 doze pentru 33,6315 m²) sau litri (rotunjit în sus la 0,1 L)', () => {
    const paint = finish({ id: 'v', kind: 'paint' }); // 2 straturi, 10 m²/L, doză 2,5 L
    expect(purchaseQuantity(paint, 33.6315).value).toMatchObject({ purchase: 3, unit: 'doza' }); // 6,7263 L / 2,5 = 2,69
    expect(purchaseQuantity(paint, 12.5).value.purchase).toBe(1); // 2,5 L = exact o doză
    const liters = finish({ id: 'l', kind: 'paint', priceUnit: 'liter' });
    expect(purchaseQuantity(liters, 33.6315).value).toMatchObject({ purchase: 6.8, unit: 'l' }); // 6,7263 → 6,8
  });
  it('configurări incoerente sunt semnalate și refuzate', () => {
    const noBox = finish({
      id: 'x',
      kind: 'tile',
      tile: { pieceWidthMm: 600, pieceHeightMm: 600, groutMm: 0 },
    });
    expect(finishConfigProblems(noBox)).toHaveLength(1);
    expect(() => purchaseQuantity(noBox, 10)).toThrow(/invalid/);
    const paintPerBox = finish({ id: 'y', kind: 'paint', priceUnit: 'box' });
    expect(finishConfigProblems(paintPerBox)).toHaveLength(1);
    const tileCan = finish({ id: 'z', kind: 'tile', priceUnit: 'can' });
    expect(finishConfigProblems(tileCan)).toHaveLength(1);
  });
});
