import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bigProject } from '@/domain/bigfixture';
import { computeBudget } from '@/domain/budget';
import { referenceProject } from '@/domain/fixtures';
import { computeJoins, interiorPolygon, polygonArea, wallFootprint } from '@/domain/geometry';
import { buildScene, wallPrisms } from '@/domain/scene';
import { mk } from './helpers';

describe('buildScene — goluri prin segmentare', () => {
  const doc = referenceProject();
  const joins = computeJoins(doc);
  it('numărul de prisme: w1 (fereastră) 4, w2 (ușă) 3, restul 1', () => {
    const per = Object.fromEntries(Object.keys(doc.walls).map((id) => [id, wallPrisms(doc, id, joins).length]));
    expect(per).toEqual({ w1: 4, w2: 3, w3: 1, w4: 1, w5: 1, w6: 1, w7: 1 });
  });
  it('volumul pereților = amprentă×H − goluri×grosime (segmentarea e exactă)', () => {
    for (const w of Object.values(doc.walls)) {
      const fp = wallFootprint(doc, joins, w);
      const base = polygonArea(fp.polygon) * w.heightMm;
      const holes = Object.values(doc.openings).filter((o) => o.wallId === w.id).reduce((a, o) => a + o.widthMm * o.heightMm * w.thicknessMm, 0);
      const vol = wallPrisms(doc, w.id, joins).reduce((a, p) => a + polygonArea(p.polygon) * (p.y1 - p.y0), 0);
      expect(vol).toBeCloseTo(base - holes, 0);
    }
  });
  it('scena e determinista și depinde doar de document', () => {
    expect(buildScene(doc).hash).toBe(buildScene(structuredClone(doc)).hash);
    const d2 = structuredClone(doc); d2.nodes.n3!.x = 4100;
    expect(buildScene(d2).hash).not.toBe(buildScene(doc).hash);
  });
  it('rețetă necunoscută → cutie de înlocuire fără pierdere de dimensiuni (design: item lipsă din snapshot)', () => {
    const d = structuredClone(doc); delete d.catalogSnapshot.items['furn.sofa.3seat'];
    const b = buildScene(d).boxes.find((x) => x.id === 'oSofa')!;
    expect(b.recipe).toBe('fallback-box'); expect(b.size).toEqual([2, 0.85, 0.9]);
  });
});

describe('performanță domeniu — 20 camere / 300 obiecte (indicativ, Node)', () => {
  it('geometrie + scenă + buget sub 1 s', () => {
    const big = bigProject();
    const t0 = performance.now();
    const areas = Object.keys(big.rooms).map((r) => polygonArea(interiorPolygon(big, r)));
    const t1 = performance.now();
    const scene = buildScene(big);
    const t2 = performance.now();
    const budget = computeBudget(big);
    const t3 = performance.now();
    const report = { rooms: areas.length, objects: 300, prisms: scene.prisms.length, budgetLines: budget.lines.length, msInterior: +(t1 - t0).toFixed(1), msScene: +(t2 - t1).toFixed(1), msBudget: +(t3 - t2).toFixed(1), msTotal: +(t3 - t0).toFixed(1) };
    writeFileSync(new URL('../reports/perf-node.json', import.meta.url), JSON.stringify(report, null, 2));
    expect(areas.every((a) => Math.abs(a - 3900 * 3400) < 1e-3)).toBe(true);
    expect(t3 - t0).toBeLessThan(1000);
  });
});
