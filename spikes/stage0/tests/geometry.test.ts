import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeJoins, faceBandAreaMm2, faceLength, interiorPolygon, isSimplePolygon, polygonArea, rectAxesFromInterior, roomWallSides, signedArea, validateOpenings, wallFootprint } from '@/domain/geometry';
import { referenceProject } from '@/domain/fixtures';
import { fromWorld, planRotationToThree, toWorld } from '@/domain/scene';
import { mk } from './helpers';

function rectDoc(W: number, D: number, t: { n: number; e: number; s: number; w: number }) {
  const [a, b, c, d] = rectAxesFromInterior(W, D, t, { x: 0, y: 0 });
  const doc = mk([['a', a!.x, a!.y], ['b', b!.x, b!.y], ['c', c!.x, c!.y], ['d', d!.x, d!.y]],
    [['wN', 'a', 'b', t.n], ['wE', 'b', 'c', t.e], ['wS', 'c', 'd', t.s], ['wW', 'd', 'a', t.w]], { r: ['a', 'b', 'c', 'd'] });
  return doc;
}

describe('A.4/A.2 — dimensiuni interioare → axe → arie utilă', () => {
  it('3900×2900 cu pereți de 100 → axe 4000×3000, arie 11.31 m²', () => {
    const doc = rectDoc(3900, 2900, { n: 100, e: 100, s: 100, w: 100 });
    const xs = Object.values(doc.nodes).map((n) => n.x), ys = Object.values(doc.nodes).map((n) => n.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(4000);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(3000);
    expect(polygonArea(interiorPolygon(doc, 'r'))).toBeCloseTo(3900 * 2900, 6);
  });
  it('proprietate: pentru orice W×D și grosimi PARE, cota interioară e exactă (fără abatere)', () => {
    const even = fc.integer({ min: 30, max: 150 }).map((x) => x * 2);
    fc.assert(fc.property(fc.integer({ min: 800, max: 9000 }), fc.integer({ min: 800, max: 9000 }), even, even, even, even, (W, D, n, e, s, w) => {
      const doc = rectDoc(W, D, { n, e, s, w });
      expect(Object.values(doc.nodes).every((p) => Number.isInteger(p.x) && Number.isInteger(p.y))).toBe(true);
      const poly = interiorPolygon(doc, 'r');
      expect(poly.length).toBe(4);
      expect(polygonArea(poly)).toBeCloseTo(W * D, 4);
      expect(isSimplePolygon(poly)).toBe(true);
    }), { numRuns: 300 });
  });
  it('CONSTATARE: grosime IMPARĂ → axe la jumătăți de mm (violează „mm întregi”)', () => {
    const axes = rectAxesFromInterior(3900, 2900, { n: 75, e: 75, s: 75, w: 75 });
    expect(axes.some((p) => !Number.isInteger(p.x) || !Number.isInteger(p.y))).toBe(true);
  });
  it('treaptă la grosimi diferite pe aceeași latură (A.2): arie = 11.2125 m²', () => {
    const doc = mk([['n1', 0, 0], ['n2', 2000, 0], ['n3', 4000, 0], ['n4', 4000, 3000], ['n5', 0, 3000]],
      [['a', 'n1', 'n2', 100], ['b', 'n2', 'n3', 200], ['c', 'n3', 'n4'], ['d', 'n4', 'n5'], ['e', 'n5', 'n1']], { r: ['n1', 'n2', 'n3', 'n4', 'n5'] });
    const poly = interiorPolygon(doc, 'r');
    expect(poly.length).toBe(6);
    expect(polygonArea(poly)).toBeCloseTo(11_212_500, 4);
  });
});

describe('A.3 — îmbinări: miter / bevel / T', () => {
  const corner = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return mk([['o', 0, 0], ['a', 3000, 0], ['b', Math.round(3000 * Math.cos(r)), Math.round(3000 * Math.sin(r))]], [['wa', 'o', 'a'], ['wb', 'o', 'b']]);
  };
  it('90°: miter exact, fără bevel', () => {
    const j = computeJoins(corner(90));
    expect(j.get('wa:start')!.bevel).toBe(false);
    const pts = [j.get('wa:start')!.left, j.get('wa:start')!.right];
    // colțul exterior (-50,-50) și cel interior (50,50) trebuie să existe
    const all = [...pts, j.get('wb:start')!.left, j.get('wb:start')!.right].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`);
    expect(all).toContain('-50,-50'); expect(all).toContain('50,50');
  });
  it('limita de miter: bevel sub ≈29°, miter peste', () => {
    expect(computeJoins(corner(20)).get('wa:start')!.bevel).toBe(true);
    expect(computeJoins(corner(28)).get('wa:start')!.bevel).toBe(true);
    expect(computeJoins(corner(31)).get('wa:start')!.bevel).toBe(false);
    expect(computeJoins(corner(60)).get('wa:start')!.bevel).toBe(false);
  });
  it('referință: T în n2 — fețele interioare ale camerei A au 3900 / 2900', () => {
    const doc = referenceProject(); const j = computeJoins(doc);
    expect(faceLength(wallFootprint(doc, j, doc.walls.w1!), 'right')).toBeCloseTo(3900, 6);
    expect(faceLength(wallFootprint(doc, j, doc.walls.w2!), 'right')).toBeCloseTo(2900, 6);
    expect(roomWallSides(doc, 'rA').every((s) => s.side === 'right')).toBe(true);
    expect(polygonArea(interiorPolygon(doc, 'rA'))).toBeCloseTo(11_310_000, 4);
    expect(polygonArea(interiorPolygon(doc, 'rB'))).toBeCloseTo(2900 * 2900, 4);
  });
});

describe('A.5/A.6 — goluri', () => {
  it('golurile din referință sunt valide', () => {
    const doc = referenceProject(); const j = computeJoins(doc);
    expect(validateOpenings(doc, j, 'w1')).toEqual([]); expect(validateOpenings(doc, j, 'w2')).toEqual([]);
  });
  it('gol prea aproape de îmbinare → out-of-range (marjă 50 + îmbinare)', () => {
    const doc = referenceProject(); doc.openings.oDoor!.offsetMm = 500; // a = 50 < 100
    expect(validateOpenings(doc, computeJoins(doc), 'w2').map((i) => i.code)).toEqual(['out-of-range']);
  });
  it('goluri suprapuse / prea înalte', () => {
    const doc = referenceProject();
    doc.openings.o2 = { id: 'o2', wallId: 'w1', type: 'window', offsetMm: 2800, widthMm: 1000, heightMm: 3000, sillHeightMm: 0 };
    const codes = validateOpenings(doc, computeJoins(doc), 'w1').map((i) => i.code).sort();
    expect(codes).toEqual(['overlap', 'too-tall']);
  });
  it('arie față cu goluri scăzute: w1 față interioară = 10.14 − 1.44 = 8.70 m²; bandă parțială 0–1200 scade doar partea ferestrei sub 1200', () => {
    const doc = referenceProject(); const j = computeJoins(doc);
    expect(faceBandAreaMm2(doc, j, 'w1', 'right')).toBeCloseTo(8_700_000, 3);
    // fereastră sill 900, h 1200: în banda 0..1200 intersecția = 300 mm × 1200 lățime
    expect(faceBandAreaMm2(doc, j, 'w1', 'right', 0, 1200)).toBeCloseTo(3900 * 1200 - 1200 * 300, 3);
    expect(faceBandAreaMm2(doc, j, 'w2', 'right')).toBeCloseTo(5_650_000, 3);
  });
});

describe('2D↔3D', () => {
  it('dus-întors', () => {
    fc.assert(fc.property(fc.integer({ min: -50000, max: 50000 }), fc.integer({ min: -50000, max: 50000 }), fc.integer({ min: 0, max: 5000 }), (x, y, e) => {
      const r = fromWorld(toWorld({ x, y }, e)); expect(r.p.x).toBeCloseTo(x, 6); expect(r.p.y).toBeCloseTo(y, 6); expect(r.elevMm).toBeCloseTo(e, 6);
    }));
  });
  it('rotația orară din plan (est→sud) = rotation.y negativă în Three (x→+Z)', () => {
    const a = planRotationToThree(90); // (1,0,0) rotit cu a în jurul Y
    const x = Math.cos(a), z = -Math.sin(a);
    expect(x).toBeCloseTo(0, 9); expect(z).toBeCloseTo(1, 9); // +Z = sud (plan +y)
  });
  it('orientare: bucla camerei A este orară pe ecran (arie semnată > 0, Y în jos)', () => {
    const doc = referenceProject();
    expect(signedArea(doc.rooms.rA!.nodeLoop.map((i) => doc.nodes[i]!))).toBeGreaterThan(0);
  });
});
