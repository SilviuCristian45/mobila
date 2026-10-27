import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  analyzeGeometry,
  computeJoins,
  faceLengthMm,
  openingRange,
  polygonArea,
  wallFootprint,
  MITER_LIMIT_FACTOR,
} from '@/domain/geometry';
import { crossProject, lShapeProject, studioProject } from '../reference/projects';
import { mk } from '../reference/builders';

const deg = (d: number) => (d * Math.PI) / 180;
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
/** Unghiul REAL (grade) al peretelui `wb` după rotunjirea nodului la mm întregi. */
const actualAngle = (doc: ReturnType<typeof mk>) =>
  (Math.atan2(doc.nodes.b!.y, doc.nodes.b!.x) * 180) / Math.PI;

/** Două pereți de la nodul O=(0,0): unul spre +X (3000 mm), celălalt la `theta` grade orar pe ecran. */
function corner(theta: number, tA = 100, tB = 100) {
  const L = 3000;
  return mk(
    [
      ['o', 0, 0],
      ['a', L, 0],
      ['b', Math.round(L * Math.cos(deg(theta))), Math.round(L * Math.sin(deg(theta)))],
    ],
    [
      ['wa', 'o', 'a', tA],
      ['wb', 'o', 'b', tB],
    ],
  );
}

describe('colțuri: miter analitic la unghiuri ascuțite, drepte și obtuze', () => {
  // Oracol: la grosimi egale t, vârful miterului stă pe bisectoare la distanța (t/2)/sin(θ/2) de nod, pe AMBELE părți.
  for (const theta of [30, 45, 60, 90, 120, 135, 150]) {
    it(`θ = ${theta}°: ambele vârfuri la (t/2)/sin(θ/2) de nod, fără bevel`, () => {
      const t = 100;
      const doc = corner(theta, t, t);
      const joins = computeJoins(doc);
      const expected = t / 2 / Math.sin(deg(actualAngle(doc) / 2));
      const c = joins.get('wa:start')!;
      near(Math.hypot(c.left.x, c.left.y), expected, 1e-4);
      near(Math.hypot(c.right.x, c.right.y), expected, 1e-4);
      expect(c.bevel).toBe(false);
    });
  }

  it('unghi drept: colțurile sunt exact (−50,−50) și (50,50)', () => {
    const j = computeJoins(corner(90));
    const pts = [j.get('wa:start')!.left, j.get('wa:start')!.right]
      .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
      .sort();
    expect(pts).toEqual(['-50,-50', '50,50']);
  });

  it('pragul de bevel: sub ≈ 28,955° (distanță > 2·t) se teșește, peste se face miter', () => {
    // sin(θ/2) = (t/2)/(2t) = 1/4 → θ = 2·asin(1/4) ≈ 28,955°
    const critical = (2 * Math.asin(1 / (2 * MITER_LIMIT_FACTOR)) * 180) / Math.PI;
    expect(critical).toBeCloseTo(28.955, 2);
    for (const theta of [12, 20, 28])
      expect(computeJoins(corner(theta)).get('wa:start')!.bevel, `${theta}°`).toBe(true);
    for (const theta of [30, 45, 90])
      expect(computeJoins(corner(theta)).get('wa:start')!.bevel, `${theta}°`).toBe(false);
  });

  it('bevel pe partea reflexă: capătul rămâne drept la nod; pe partea îngustă (pana) vârful rămâne miter', () => {
    const doc = corner(20);
    const c = computeJoins(doc).get('wa:start')!;
    // peretele wb coboară spre sud (y>0): pana e pe fața dreaptă (sud), partea reflexă pe fața stângă (nord)
    near(c.left.x, 0);
    near(c.left.y, -50);
    near(Math.hypot(c.right.x, c.right.y), 50 / Math.sin(deg(actualAngle(doc) / 2)), 1e-3);
  });

  it('grosimi diferite într-un colț de 90°: vârfurile sunt la (±tB/2, ±tA/2) calculate analitic', () => {
    // A orizontal (t=100): fețe la y=±50; B vertical (t=200): fețe la x=±100 → colțurile (100,50) și (−100,−50)
    const j = computeJoins(corner(90, 100, 200));
    const pts = [j.get('wa:start')!.left, j.get('wa:start')!.right]
      .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
      .sort();
    expect(pts).toEqual(['-100,-50', '100,50']);
  });
});

describe('nod cu PATRU pereți (X)', () => {
  const doc = crossProject();
  const model = analyzeGeometry(doc);

  it('geometria este validă', () => {
    expect(model.issues).toEqual([]);
  });
  it('în nodul central cei 4 pereți au colțuri simetrice la (±50,±50) față de nod', () => {
    // n11 = (3000, 2500); pereții h01 (spre vest), h11 (spre est), v10 (spre nord), v11 (spre sud)
    const corners = new Set<string>();
    for (const [w, end] of [
      ['h01', 'end'],
      ['h11', 'start'],
      ['v10', 'end'],
      ['v11', 'start'],
    ] as const) {
      const c = model.joins.get(`${w}:${end}`)!;
      for (const p of [c.left, c.right])
        corners.add(`${Math.round(p.x - 3000)},${Math.round(p.y - 2500)}`);
    }
    expect([...corners].sort()).toEqual(['-50,-50', '-50,50', '50,-50', '50,50']);
  });
  it('fiecare cameră are interior 2900×2400 = 6,96 m², cu laturi de 2900 și 2400', () => {
    for (const id of ['r00', 'r01', 'r10', 'r11']) {
      const r = model.rooms.get(id)!;
      near(r.areaMm2, 2900 * 2400, 1e-3);
      expect(r.edges.map((e) => Math.round(e.lengthMm)).sort()).toEqual([2400, 2400, 2900, 2900]);
    }
  });
  it('lungimea feței unui perete cu 4 pereți la un capăt și 3 la celălalt', () => {
    // h01: (0,2500)→(3000,2500), între n01 (3 pereți: T) și n11 (4 pereți). Fața dinspre r00 (nord) are 2900.
    const fp = model.footprints.get('h01')!;
    near(Math.min(faceLengthMm(fp, 'left'), faceLengthMm(fp, 'right')), 2900, 1e-6);
  });
});

describe('pereți cu grosimi diferite', () => {
  it('cameră cu grosimi N=250, E=250, S=250, V=100: interior = (5000−50−125)×(4000−250) calculat independent', () => {
    const doc = mk(
      [
        ['a', 0, 0],
        ['b', 5000, 0],
        ['c', 5000, 4000],
        ['d', 0, 4000],
      ],
      [
        ['wN', 'a', 'b', 250],
        ['wE', 'b', 'c', 250],
        ['wS', 'c', 'd', 250],
        ['wW', 'd', 'a', 100],
      ],
      { r: ['a', 'b', 'c', 'd'] },
    );
    const m = analyzeGeometry(doc);
    expect(m.issues).toEqual([]);
    // x: de la 0+50 la 5000−125 → 4825; y: de la 0+125 la 4000−125 → 3750
    near(m.rooms.get('r')!.areaMm2, 4825 * 3750, 1e-3);
  });
  it('treaptă: latură cu două grosimi (100 și 200) → poligon cu 6 vârfuri și aria calculată analitic', () => {
    const doc = mk(
      [
        ['n1', 0, 0],
        ['n2', 2000, 0],
        ['n3', 4000, 0],
        ['n4', 4000, 3000],
        ['n5', 0, 3000],
      ],
      [
        ['a', 'n1', 'n2', 100],
        ['b', 'n2', 'n3', 200],
        ['c', 'n3', 'n4'],
        ['d', 'n4', 'n5'],
        ['e', 'n5', 'n1'],
      ],
      { r: ['n1', 'n2', 'n3', 'n4', 'n5'] },
    );
    const r = analyzeGeometry(doc).rooms.get('r')!;
    expect(r.polygon).toHaveLength(6);
    // dreptunghi 3900×2900 minus „nișa” 1950×50 (x∈[2000,3950], y∈[50,100])
    near(r.areaMm2, 3900 * 2900 - 1950 * 50, 1e-3);
  });
  it('T cu perete subțire pe perete gros: colțurile fiecărei fețe folosesc grosimea proprie', () => {
    // perete orizontal gros (300) n1–n2–n3, stem vertical subțire (100) din n2 în jos
    const doc = mk(
      [
        ['n1', 0, 0],
        ['n2', 3000, 0],
        ['n3', 6000, 0],
        ['n4', 3000, 3000],
      ],
      [
        ['h1', 'n1', 'n2', 300],
        ['h2', 'n2', 'n3', 300],
        ['v', 'n2', 'n4', 100],
      ],
    );
    const j = computeJoins(doc);
    // v începe în n2: fețele sale se opresc pe fața de jos a peretelui gros (y = +150) la x = 3000 ± 50
    const c = j.get('v:start')!;
    expect([c.left, c.right].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).sort()).toEqual([
      '2950,150',
      '3050,150',
    ]);
  });
});

describe('camere neconvexe', () => {
  const doc = lShapeProject();
  const model = analyzeGeometry(doc);

  it('forma în L este validă; aria interioară 22,91 m² (calcul manual)', () => {
    expect(model.issues).toEqual([]);
    near(model.rooms.get('rL')!.areaMm2, 5900 * 2900 + 2900 * 2000, 1e-3);
  });
  it('colțul reflex: vârful interior este la (2950,2950)', () => {
    const poly = model.rooms.get('rL')!.polygon.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`);
    expect(poly).toContain('2950,2950');
    expect(poly).toContain('50,50');
    expect(poly).toContain('5950,50');
  });
  it('formula analitică A(d) = A − P·d + d²·Σcot(θ/2) se potrivește (colț reflex: cot(135°) = −1)', () => {
    const A = 24_000_000,
      P = 22_000,
      d = 50,
      sumCot = 5 * 1 + -1;
    near(model.rooms.get('rL')!.areaMm2, A - P * d + d * d * sumCot, 1e-3);
  });
  it('octogon cu colțuri de 135° (obtuze): aria interioară după formula analitică', () => {
    const pts: Array<[number, number]> = [
      [1000, 0],
      [3000, 0],
      [4000, 1000],
      [4000, 3000],
      [3000, 4000],
      [1000, 4000],
      [0, 3000],
      [0, 1000],
    ];
    const nodes = pts.map(([x, y], i) => [`n${i}`, x, y] as [string, number, number]);
    const walls = pts.map(
      (_, i) => [`w${i}`, `n${i}`, `n${(i + 1) % 8}`] as [string, string, string],
    );
    const doc2 = mk(nodes, walls, { r: nodes.map((n) => n[0]) });
    const A = 14_000_000,
      P = 4 * 2000 + 4 * Math.hypot(1000, 1000),
      d = 50;
    const expected = A - P * d + d * d * 8 * (1 / Math.tan(deg(135 / 2)));
    near(analyzeGeometry(doc2).rooms.get('r')!.areaMm2, expected, 1e-3);
  });
  it('triunghi dreptunghic 3-4-5 (unghiuri 36,87°/53,13°/90°): interior = A·((r−d)/r)², r = 1000', () => {
    const doc3 = mk(
      [
        ['p', 0, 0],
        ['q', 4000, 0],
        ['s', 0, 3000],
      ],
      [
        ['a', 'p', 'q'],
        ['b', 'q', 's'],
        ['c', 's', 'p'],
      ],
      { r: ['p', 'q', 's'] },
    );
    const m = analyzeGeometry(doc3);
    expect(m.issues).toEqual([]);
    near(m.rooms.get('r')!.areaMm2, 6_000_000 * ((1000 - 50) / 1000) ** 2, 1e-3);
  });
  it('proprietate: pentru dreptunghiuri și forme în L cu aceeași grosime, aria = A − P·d + d²·Σcot (oracol independent)', () => {
    const even = fc.integer({ min: 20, max: 150 }).map((x) => x * 2);
    fc.assert(
      fc.property(
        fc.integer({ min: 3000, max: 9000 }),
        fc.integer({ min: 3000, max: 9000 }),
        fc.integer({ min: 1000, max: 2500 }),
        fc.integer({ min: 1000, max: 2500 }),
        even,
        (W, H, cutW, cutH, t) => {
          // L: dreptunghi W×H din care se scoate colțul de jos-dreapta cutW×cutH
          const pts: Array<[number, number]> = [
            [0, 0],
            [W, 0],
            [W, H - cutH],
            [W - cutW, H - cutH],
            [W - cutW, H],
            [0, H],
          ];
          const nodes = pts.map(([x, y], i) => [`n${i}`, x, y] as [string, number, number]);
          const walls = pts.map(
            (_, i) => [`w${i}`, `n${i}`, `n${(i + 1) % 6}`, t] as [string, string, string, number],
          );
          const m = analyzeGeometry(mk(nodes, walls, { r: nodes.map((n) => n[0]) }));
          expect(m.issues).toEqual([]);
          const A = W * H - cutW * cutH;
          const P = 2 * (W + H);
          const d = t / 2;
          near(m.rooms.get('r')!.areaMm2, A - P * d + d * d * (5 - 1), 1e-3);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('goluri apropiate de colțuri (A.5) — limite calculate analitic', () => {
  it('colț convex exterior (w1, capătul de la b): interval admis [lo, hi] din îmbinări + marjă', () => {
    const doc = lShapeProject();
    const fp = analyzeGeometry(doc).footprints.get('w1')!;
    // w1: a(0,0)→b(6000,0). La a: fața interioară (dreapta, sud) începe la s=50, cea exterioară la s=−50 → lo = 50+50
    // La b: fața interioară se termină la 5950, cea exterioară la 6050 → hi = 5950−50
    const r = openingRange(fp, 50);
    near(r.lo, 100);
    near(r.hi, 5900);
  });
  it('colț reflex (w3: c(6000,3000)→d(3000,3000)): hi = 2900 calculat pe fețele diferite', () => {
    // La d (reflex) fața interioară (nord) se termină la x=2950 → s=3050; cea exterioară (sud) la x=3050 → s=2950
    // hi = min(3050, 2950) − 50 = 2900; la c (convex): lo = max(−50, 50) + 50 = 100
    const doc = lShapeProject();
    const fp = analyzeGeometry(doc).footprints.get('w3')!;
    const r = openingRange(fp, 50);
    near(r.lo, 100);
    near(r.hi, 2900);
    // ușă de 900 mm: centrul maxim = 2900 − 450 = 2450
    const ok = structuredCloneDoc(doc);
    ok.openings.door = {
      id: 'door',
      wallId: 'w3',
      type: 'door',
      offsetMm: 2450,
      widthMm: 900,
      heightMm: 2100,
      sillHeightMm: 0,
    };
    expect(analyzeGeometry(ok).issues).toEqual([]);
    const bad = structuredCloneDoc(doc);
    bad.openings.door = {
      id: 'door',
      wallId: 'w3',
      type: 'door',
      offsetMm: 2451,
      widthMm: 900,
      heightMm: 2100,
      sillHeightMm: 0,
    };
    expect(analyzeGeometry(bad).issues.map((i) => i.code)).toEqual(['opening-out-of-range']);
  });
  it('perete care întâlnește altul la 60°: lo = 136,6 (miter la 100 mm de nod pe bisectoare)', () => {
    const doc = corner(60);
    const fp = wallFootprint(doc, computeJoins(doc), doc.walls.wa!);
    // vârfurile sunt la distanța (t/2)/sin(30°) = 100 pe bisectoarea de 30°: s = 100·cos(30°) = 86,60 (față sud) și −86,60 (nord)
    const half = actualAngle(doc) / 2;
    near(openingRange(fp, 50).lo, (50 / Math.sin(deg(half))) * Math.cos(deg(half)) + 50, 1e-3);
  });
  it('perete la 20° (bevel pe partea reflexă): lo = (t/2)/sin(10°)·cos(10°) + marjă pe fața din pană', () => {
    const doc = corner(20);
    const fp = wallFootprint(doc, computeJoins(doc), doc.walls.wa!);
    // pana (sud): vârf la 50/sin(10°) de nod pe bisectoare → s = 50/sin(10°)·cos(10°); fața exterioară (nord) teșită: s = 0
    const half = actualAngle(doc) / 2;
    const wedge = (50 / Math.sin(deg(half))) * Math.cos(deg(half));
    near(openingRange(fp, 50).lo, wedge + 50, 1e-3);
  });
  it('gol lipit de capăt, suprapus sau prea înalt → coduri controlate', () => {
    const base = lShapeProject();
    const touch = structuredCloneDoc(base);
    touch.openings.x = {
      id: 'x',
      wallId: 'w1',
      type: 'window',
      offsetMm: 600,
      widthMm: 1000,
      heightMm: 1000,
      sillHeightMm: 900,
    }; // a = 100 → exact la limită, valid
    expect(analyzeGeometry(touch).issues).toEqual([]);
    touch.openings.x.offsetMm = 599; // 1 mm prea aproape
    expect(analyzeGeometry(touch).issues.map((i) => i.code)).toEqual(['opening-out-of-range']);
    const overlap = structuredCloneDoc(base);
    overlap.openings.y = {
      id: 'y',
      wallId: 'w1',
      type: 'window',
      offsetMm: 4000,
      widthMm: 1000,
      heightMm: 1000,
      sillHeightMm: 900,
    };
    overlap.openings.z = {
      id: 'z',
      wallId: 'w1',
      type: 'window',
      offsetMm: 4500,
      widthMm: 1000,
      heightMm: 3000,
      sillHeightMm: 0,
    };
    // y se suprapune cu fereastra existentă oWin (2400–3600), z se suprapune cu y; z e și prea înaltă
    expect(
      analyzeGeometry(overlap)
        .issues.map((i) => i.code)
        .sort(),
    ).toEqual(['opening-overlap', 'opening-overlap', 'opening-too-tall']);
  });
});

describe('studio: fețe și T', () => {
  it('fețele interioare ale camerei A au 3900 și 2900; poligon B 2900×2900', () => {
    const m = analyzeGeometry(studioProject());
    expect(m.issues).toEqual([]);
    expect(m.rooms.get('rA')!.edges.map((e) => Math.round(e.lengthMm))).toEqual([
      3900, 2900, 3900, 2900,
    ]);
    near(polygonArea(m.rooms.get('rB')!.polygon), 2900 * 2900, 1e-3);
    expect(m.rooms.get('rA')!.edges.every((e) => e.side === 'right')).toBe(true);
  });
});

function structuredCloneDoc<T>(d: T): T {
  return JSON.parse(JSON.stringify(d)) as T;
}
