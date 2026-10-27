import { describe, expect, it } from 'vitest';
import { analyzeGeometry, MAX_WALLS_FOR_VALIDATION, MIN_WALL_ANGLE_DEG } from '@/domain/geometry';
import { InvalidDocumentError } from '@/domain/errors';
import { buildScene } from '@/domain/scene';
import { computeBudget } from '@/domain/budget';
import { mk } from '../reference/builders';
import { lShapeProject, studioProject } from '../reference/projects';

const codes = (doc: ReturnType<typeof mk>) =>
  analyzeGeometry(doc)
    .issues.map((i) => i.code)
    .sort();
const square = (extra: Parameters<typeof mk>[1] = []) =>
  mk(
    [
      ['a', 0, 0],
      ['b', 4000, 0],
      ['c', 4000, 3000],
      ['d', 0, 3000],
    ],
    [['w1', 'a', 'b'], ['w2', 'b', 'c'], ['w3', 'c', 'd'], ['w4', 'd', 'a'], ...extra],
    { r: ['a', 'b', 'c', 'd'] },
  );

describe('date invalide: respinse controlat, cu coduri explicite (nu aruncă, nu calculează)', () => {
  it('documentele de referință sunt valide', () => {
    expect(codes(studioProject())).toEqual([]);
    expect(codes(lShapeProject())).toEqual([]);
    expect(codes(square())).toEqual([]);
  });
  it('perete cu nod inexistent', () => {
    expect(codes(square([['x', 'a', 'zzz']]))).toEqual(['node-missing']);
  });
  it('perete degenerat (același nod) și noduri suprapuse', () => {
    expect(codes(square([['x', 'a', 'a']]))).toEqual(['wall-degenerate']);
    const d = square();
    d.nodes.e = { id: 'e', levelId: 'L1', x: 0, y: 0 };
    expect(codes(d)).toContain('nodes-coincide'); // și 'node-on-wall': nodul suprapus stă pe pereții din a
  });
  it('doi pereți între aceleași noduri', () => {
    expect(codes(square([['x', 'b', 'a']]))).toEqual(['wall-duplicate']);
  });
  it('pereți care se încrucișează fără nod comun', () => {
    const d = square();
    d.nodes.p = { id: 'p', levelId: 'L1', x: 1000, y: -500 };
    d.nodes.q = { id: 'q', levelId: 'L1', x: 1000, y: 500 };
    d.walls.x = {
      id: 'x',
      levelId: 'L1',
      startNodeId: 'p',
      endNodeId: 'q',
      thicknessMm: 100,
      heightMm: 2600,
      baseOffsetMm: 0,
    };
    expect(codes(d)).toContain('wall-crossing');
  });
  it('nod așezat pe un perete fără să-l împartă (T fără nod)', () => {
    const d = square();
    d.nodes.t = { id: 't', levelId: 'L1', x: 2000, y: 0 }; // pe w1
    d.nodes.u = { id: 'u', levelId: 'L1', x: 2000, y: 1500 };
    d.walls.x = {
      id: 'x',
      levelId: 'L1',
      startNodeId: 't',
      endNodeId: 'u',
      thicknessMm: 100,
      heightMm: 2600,
      baseOffsetMm: 0,
    };
    expect(codes(d)).toContain('node-on-wall');
  });
  it('pereți suprapuți colinear din același nod (unghi 0°): nodul capătului scurt stă pe peretele lung', () => {
    const d = mk(
      [
        ['o', 0, 0],
        ['a', 3000, 0],
        ['b', 1500, 0],
      ],
      [
        ['w1', 'o', 'a'],
        ['w2', 'o', 'b'],
      ],
    );
    expect(codes(d)).toContain('node-on-wall');
  });
  it(`unghi < ${MIN_WALL_ANGLE_DEG}° între pereți → respins; peste prag → acceptat`, () => {
    const at = (deg: number) => {
      const r = (deg * Math.PI) / 180;
      return mk(
        [
          ['o', 0, 0],
          ['a', 3000, 0],
          ['b', Math.round(3000 * Math.cos(r)), Math.round(3000 * Math.sin(r))],
        ],
        [
          ['w1', 'o', 'a'],
          ['w2', 'o', 'b'],
        ],
      );
    };
    expect(codes(at(9))).toContain('wall-angle-too-sharp');
    expect(codes(at(11))).toEqual([]);
  });
  it('perete prea scurt pentru grosimile îmbinărilor', () => {
    const d = mk(
      [
        ['a', 0, 0],
        ['b', 60, 0],
        ['c', 60, 3000],
      ],
      [
        ['w1', 'a', 'b', 200],
        ['w2', 'b', 'c', 200],
      ],
    );
    expect(codes(d)).toContain('wall-too-short-for-joins');
  });
  it('cameră: perete lipsă pe o muchie, noduri repetate, buclă autointersectată (fundă), arie zero', () => {
    const miss = square();
    delete miss.walls.w4;
    expect(codes(miss)).toEqual(['room-wall-missing']);
    const dup = square();
    dup.rooms.r!.nodeLoop = ['a', 'b', 'c', 'd', 'a'];
    expect(codes(dup)).toEqual(['room-loop-invalid']);
    const bow = square([
      ['x1', 'a', 'c'],
      ['x2', 'b', 'd'],
    ]);
    expect(codes(bow)).toContain('wall-crossing');
    const bowRoom = mk(
      [
        ['a', 0, 0],
        ['b', 4000, 3000],
        ['c', 4000, 0],
        ['d', 0, 3000],
      ],
      [
        ['w1', 'a', 'b'],
        ['w2', 'b', 'c'],
        ['w3', 'c', 'd'],
        ['w4', 'd', 'a'],
      ],
      { r: ['a', 'b', 'c', 'd'] },
    );
    expect(codes(bowRoom).length).toBeGreaterThan(0);
    const flat = mk(
      [
        ['a', 0, 0],
        ['b', 2000, 0],
        ['c', 4000, 0],
      ],
      [
        ['w1', 'a', 'b'],
        ['w2', 'b', 'c'],
        ['w3', 'c', 'a'],
      ],
      { r: ['a', 'b', 'c'] },
    );
    expect(codes(flat).length).toBeGreaterThan(0);
  });
  it('cameră „consumată” de grosimile pereților (latură interioară ≤ 0)', () => {
    const d = mk(
      [
        ['a', 0, 0],
        ['b', 200, 0],
        ['c', 200, 3000],
        ['d', 0, 3000],
      ],
      [
        ['w1', 'a', 'b', 300],
        ['w2', 'b', 'c', 300],
        ['w3', 'c', 'd', 300],
        ['w4', 'd', 'a', 300],
      ],
      { r: ['a', 'b', 'c', 'd'] },
    );
    expect(codes(d)).toContain('room-collapsed');
  });
  it('nivel: exact unul în MVP', () => {
    const d = square();
    d.levels.L2 = { id: 'L2', name: 'Etaj', elevationMm: 2800, ceilingHeightMm: 2600 };
    expect(codes(d)).toEqual(['level-count']);
  });
  it('prea mulți pereți → validare refuzată (limită documentată)', () => {
    const nodes: Array<[string, number, number]> = [];
    const walls: Array<[string, string, string]> = [];
    for (let i = 0; i <= MAX_WALLS_FOR_VALIDATION; i++) nodes.push([`n${i}`, i * 1000, 0]);
    for (let i = 0; i < MAX_WALLS_FOR_VALIDATION + 1 - 1 + 1; i++)
      if (i + 1 < nodes.length) walls.push([`w${i}`, `n${i}`, `n${i + 1}`]);
    walls.push(['extra', 'n0', `n${nodes.length - 1}`]);
    expect(codes(mk(nodes, walls))).toEqual(['too-many-walls']);
  });
});

describe('regresie: un model de geometrie primit din exterior este verificat și el', () => {
  it('computeBudget și buildScene refuză un GeometryModel cu probleme, nu doar un document invalid', () => {
    const bad = studioProject();
    bad.openings.oDoor!.offsetMm = 100;
    const model = analyzeGeometry(bad);
    expect(model.issues.length).toBeGreaterThan(0);
    expect(() => computeBudget(bad, model)).toThrow(InvalidDocumentError);
    expect(() => buildScene(bad, model)).toThrow(InvalidDocumentError);
  });
});

describe('calculele din aval refuză documentele invalide (excepție tipată, nu rezultate false)', () => {
  const bad = (() => {
    const d = studioProject();
    d.openings.oDoor!.offsetMm = 100; // gol prea aproape de îmbinare
    return d;
  })();
  it('computeBudget și buildScene aruncă InvalidDocumentError cu lista problemelor', () => {
    for (const run of [() => computeBudget(bad), () => buildScene(bad)]) {
      try {
        run();
        expect.unreachable('trebuia să arunce');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidDocumentError);
        expect((e as InvalidDocumentError).issues.map((i) => i.code)).toEqual([
          'opening-out-of-range',
        ]);
      }
    }
  });
});
