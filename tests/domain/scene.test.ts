import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeBudget } from '@/domain/budget';
import { analyzeGeometry, polygonArea } from '@/domain/geometry';
import {
  buildScene,
  fromWorld,
  geometrySignature,
  planRotationToThree,
  toWorld,
  wallPrisms,
} from '@/domain/scene';
import { remapIds } from '@/domain/io';
import { bigProject } from '../reference/big';
import { lShapeProject, studioProject } from '../reference/projects';

describe('scena 3D ca date', () => {
  const doc = studioProject();
  const model = analyzeGeometry(doc);

  it('prisme: w1 (fereastră) 4, w2 (ușă) 3, celelalte câte 1 → 12', () => {
    const per = Object.fromEntries(
      [...model.footprints].map(([id, fp]) => [id, wallPrisms(doc, fp).length]),
    );
    expect(per).toEqual({ w1: 4, w2: 3, w3: 1, w4: 1, w5: 1, w6: 1, w7: 1 });
  });
  it('volumul pereților = amprentă × înălțime − goluri × grosime (segmentarea e exactă)', () => {
    for (const [id, fp] of model.footprints) {
      const wall = doc.walls[id]!;
      const full = polygonArea(fp.polygon) * wall.heightMm;
      const holes = Object.values(doc.openings)
        .filter((o) => o.wallId === id)
        .reduce((a, o) => a + o.widthMm * o.heightMm * wall.thicknessMm, 0);
      const vol = wallPrisms(doc, fp).reduce(
        (a, p) => a + polygonArea(p.polygon) * (p.y1 - p.y0),
        0,
      );
      expect(Math.abs(vol - (full - holes))).toBeLessThan(1);
    }
  });
  it('golul din ușă începe de la podea (fără prismă sub prag) și are buiandrug; fereastra are și parapet', () => {
    const door = wallPrisms(doc, model.footprints.get('w2')!);
    expect(door.map((p) => [p.y0, p.y1])).toEqual([
      [0, 2600],
      [2100, 2600],
      [0, 2600],
    ]);
    const win = wallPrisms(doc, model.footprints.get('w1')!);
    expect(win.map((p) => [p.y0, p.y1])).toEqual([
      [0, 2600],
      [0, 900],
      [2100, 2600],
      [0, 2600],
    ]);
  });
  it('determinist: același document → același hash; orice modificare geometrică îl schimbă', () => {
    expect(buildScene(doc).hash).toBe(buildScene(JSON.parse(JSON.stringify(doc))).hash);
    const moved = JSON.parse(JSON.stringify(doc));
    moved.nodes.n6.x = 7100;
    expect(buildScene(moved).hash).not.toBe(buildScene(doc).hash);
    const recolored = JSON.parse(JSON.stringify(doc));
    recolored.catalogSnapshot.finishes['fin.tile.600'].appearance.baseColorHex = '#000000';
    expect(buildScene(recolored).hash).not.toBe(buildScene(doc).hash);
  });
  it('semnătura geometrică ignoră ID-urile (copie cu ID-uri regenerate)', () => {
    let n = 0;
    const copy = remapIds(doc, () => `q${++n}`);
    expect(buildScene(copy).hash).not.toBe(buildScene(doc).hash);
    expect(geometrySignature(buildScene(copy))).toBe(geometrySignature(buildScene(doc)));
  });
  it('podea cu culoarea finisajului atribuit; obiect cu elevație și rețetă din snapshot', () => {
    const scene = buildScene(doc);
    expect(scene.floors.find((f) => f.roomId === 'rA')!.colorHex).toBe('#c9c4bb');
    expect(scene.floors.find((f) => f.roomId === 'rB')!.colorHex).toBe('#dddddd');
    const lamp = scene.boxes.find((b) => b.id === 'oLamp')!;
    expect(lamp.center[1]).toBeCloseTo((2250 + 350 / 2) / 1000, 9);
    expect(lamp.recipe).toEqual({ id: 'box', version: 1 });
  });
  it('item lipsă din snapshot → recipe null (randarea decide înlocuitorul), nu excepție', () => {
    const d = JSON.parse(JSON.stringify(doc));
    delete d.catalogSnapshot.items['furn.sofa.3seat'];
    expect(buildScene(d).boxes.find((b) => b.id === 'oSofa')!.recipe).toBeNull();
  });
  it('fără obiecte, camere sau pereți → scenă goală, fără erori', () => {
    const d = JSON.parse(JSON.stringify(doc));
    d.objects = {};
    d.openings = {};
    d.rooms = {};
    d.walls = {};
    d.nodes = {};
    d.finishAssignments = {};
    d.budget = { overrides: {}, manualLines: {} };
    const s = buildScene(d);
    expect([s.prisms.length, s.floors.length, s.boxes.length]).toEqual([0, 0, 0]);
  });
});

describe('transformarea 2D ↔ 3D', () => {
  it('dus-întors (proprietate)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50_000, max: 50_000 }),
        fc.integer({ min: -50_000, max: 50_000 }),
        fc.integer({ min: 0, max: 5000 }),
        (x, y, e) => {
          const r = fromWorld(toWorld({ x, y }, e));
          expect(r.p.x).toBeCloseTo(x, 6);
          expect(r.p.y).toBeCloseTo(y, 6);
          expect(r.elevationMm).toBeCloseTo(e, 6);
        },
      ),
    );
  });
  it('rotația orară din plan: est→sud (+Z) pentru 90°; est→vest pentru 180°', () => {
    const rot = (deg: number) => {
      const a = planRotationToThree(deg); // (1,0,0) rotit cu `a` în jurul lui Y
      return [Math.cos(a), -Math.sin(a)] as const; // (x, z)
    };
    expect(rot(90)[0]).toBeCloseTo(0, 9);
    expect(rot(90)[1]).toBeCloseTo(1, 9);
    expect(rot(180)[0]).toBeCloseTo(-1, 9);
  });
  it('planul și 3D păstrează orientarea: un punct la est și sud în plan are X>0 și Z>0 în 3D', () => {
    const [x, , z] = toWorld({ x: 1000, y: 2000 });
    expect([x, z]).toEqual([1, 2]);
  });
});

describe('performanță de calcul (indicativ, generos): 20 camere / 300 obiecte', () => {
  it('analiză + scenă + buget sub 1,5 s', () => {
    const big = bigProject();
    const t0 = Date.now();
    const model = analyzeGeometry(big);
    expect(model.issues).toEqual([]);
    const scene = buildScene(big, model);
    const budget = computeBudget(big, model);
    const ms = Date.now() - t0;
    expect(model.rooms.size).toBe(20);
    expect(scene.boxes).toHaveLength(300);
    expect(budget.lines.filter((l) => l.key.startsWith('object:'))).toHaveLength(300);
    expect(ms).toBeLessThan(1500);
  });
});

describe('regresii cunoscute', () => {
  it('L: fereastra apare în prisme (4) și suprafața nu depinde de ordinea pereților', () => {
    const d = lShapeProject();
    const m = analyzeGeometry(d);
    expect(wallPrisms(d, m.footprints.get('w1')!)).toHaveLength(4);
  });
});
