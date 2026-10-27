import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  analyzeGeometry,
  rectAxesFromInterior,
  rectInteriorSize,
  resizeRectInterior,
  withNodePositions,
} from '@/domain/geometry';
import { mk } from '../reference/builders';
import { studioProject } from '../reference/projects';

const even = fc.integer({ min: 20, max: 150 }).map((x) => x * 2);

function rectDoc(W: number, D: number, t: { n: number; e: number; s: number; w: number }) {
  const r = rectAxesFromInterior(W, D, t);
  if (!r.ok) throw new Error(r.error);
  const [nw, ne, se, sw] = r.value;
  return mk(
    [
      ['a', nw.x, nw.y],
      ['b', ne.x, ne.y],
      ['c', se.x, se.y],
      ['d', sw.x, sw.y],
    ],
    [
      ['wN', 'a', 'b', t.n],
      ['wE', 'b', 'c', t.e],
      ['wS', 'c', 'd', t.s],
      ['wW', 'd', 'a', t.w],
    ],
    { r: ['a', 'b', 'c', 'd'] },
  );
}

describe('dimensiuni interioare → axe (A.4)', () => {
  it('3900×2900 cu pereți de 100 → axe 4000×3000 și aria 11,31 m²', () => {
    const doc = rectDoc(3900, 2900, { n: 100, e: 100, s: 100, w: 100 });
    const xs = Object.values(doc.nodes).map((n) => n.x);
    const ys = Object.values(doc.nodes).map((n) => n.y);
    expect([Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]).toEqual([
      4000, 3000,
    ]);
    expect(Math.abs(analyzeGeometry(doc).rooms.get('r')!.areaMm2 - 3900 * 2900)).toBeLessThan(1e-3);
  });
  it('proprietate: pentru orice W×D și grosimi PARE, nodurile sunt întregi iar cotele interioare exacte', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 800, max: 9000 }),
        fc.integer({ min: 800, max: 9000 }),
        even,
        even,
        even,
        even,
        (W, D, n, e, s, w) => {
          const doc = rectDoc(W, D, { n, e, s, w });
          expect(
            Object.values(doc.nodes).every((p) => Number.isInteger(p.x) && Number.isInteger(p.y)),
          ).toBe(true);
          const room = analyzeGeometry(doc).rooms.get('r')!;
          expect(Math.abs(room.areaMm2 - W * D)).toBeLessThan(1e-3);
          const lens = room.edges.map((x) => Math.round(x.lengthMm)).sort((a, b) => a - b);
          expect(lens).toEqual([D, D, W, W].sort((a, b) => a - b));
          expect(rectInteriorSize(doc, 'r')).toEqual({
            ok: true,
            value: { widthMm: W, depthMm: D },
          });
        },
      ),
      { numRuns: 300 },
    );
  });
  it('grosime impară, nulă sau dimensiuni ne-întregi → respinse (nu se rotunjește în tăcere)', () => {
    expect(rectAxesFromInterior(3900, 2900, { n: 75, e: 100, s: 100, w: 100 }).ok).toBe(false);
    expect(rectAxesFromInterior(3900, 2900, { n: 0, e: 100, s: 100, w: 100 }).ok).toBe(false);
    expect(rectAxesFromInterior(3900.5, 2900, { n: 100, e: 100, s: 100, w: 100 }).ok).toBe(false);
    expect(rectAxesFromInterior(-1, 2900, { n: 100, e: 100, s: 100, w: 100 }).ok).toBe(false);
  });
});

describe('editarea ulterioară a unei dimensiuni interioare', () => {
  const t = { n: 100, e: 200, s: 100, w: 100 };
  for (const side of ['n', 'e', 's', 'w'] as const) {
    it(`mută latura ${side}: dimensiunea cerută se obține exact, latura opusă rămâne fixă`, () => {
      const doc = rectDoc(3900, 2900, t);
      const target = side === 'n' || side === 's' ? 3300 : 4500;
      const r = resizeRectInterior(doc, 'r', side, target);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const next = withNodePositions(doc, r.value);
      const size = rectInteriorSize(next, 'r');
      expect(
        size.ok && (side === 'n' || side === 's' ? size.value.depthMm : size.value.widthMm),
      ).toBe(target);
      expect(
        size.ok && (side === 'n' || side === 's' ? size.value.widthMm : size.value.depthMm),
      ).toBe(side === 'n' || side === 's' ? 3900 : 2900);
      expect(analyzeGeometry(next).issues).toEqual([]);
      // latura opusă nemodificată
      const opposite = { n: 's', s: 'n', e: 'w', w: 'e' }[side];
      const moved = new Set(Object.keys(r.value));
      expect(moved.size).toBe(2);
      const oppNodes = Object.values(doc.nodes).filter((n) => !moved.has(n.id));
      for (const n of oppNodes) expect(next.nodes[n.id]).toEqual(n);
      expect(opposite).toBeDefined();
    });
  }
  it('camerele vecine care partajează nodurile mutate se modifică (revalidare necesară)', () => {
    const doc = studioProject();
    const r = resizeRectInterior(doc, 'rA', 'e', 4900); // mută peretele comun cu 1000 mm
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const next = withNodePositions(doc, r.value);
    const m = analyzeGeometry(next);
    expect(m.issues).toEqual([]);
    expect(Math.abs(m.rooms.get('rB')!.areaMm2 - 1900 * 2900)).toBeLessThan(1e-3); // 2900 − 1000 = 1900
    // golul din peretele mutat rămâne valid (aici: da)
  });
  it('forme care nu sunt dreptunghiuri aliniate cu axele sau valori invalide → eroare controlată', () => {
    const tri = mk(
      [
        ['a', 0, 0],
        ['b', 4000, 0],
        ['c', 0, 3000],
      ],
      [
        ['x', 'a', 'b'],
        ['y', 'b', 'c'],
        ['z', 'c', 'a'],
      ],
      { r: ['a', 'b', 'c'] },
    );
    expect(resizeRectInterior(tri, 'r', 'e', 3000).ok).toBe(false);
    expect(rectInteriorSize(tri, 'r').ok).toBe(false);
    const doc = rectDoc(3900, 2900, t);
    expect(resizeRectInterior(doc, 'r', 'e', 0).ok).toBe(false);
    expect(resizeRectInterior(doc, 'r', 'e', 1.5).ok).toBe(false);
    expect(resizeRectInterior(doc, 'zzz', 'e', 1000).ok).toBe(false);
  });
  it('micșorarea care scoate un gol din perete este prinsă de validarea ulterioară (nu se șterge tăcut)', () => {
    const doc = studioProject();
    const r = resizeRectInterior(doc, 'rA', 'e', 2000); // peretele de sus se scurtează la 2100; fereastra (1400–2600) nu mai încape
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const issues = analyzeGeometry(withNodePositions(doc, r.value)).issues.map((i) => i.code);
    expect(issues).toContain('opening-out-of-range');
  });
});
