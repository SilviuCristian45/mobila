import { describe, expect, it } from 'vitest';
import {
  addObject,
  analyzeGeometry,
  applyFinish,
  buildScene,
  computeBudget,
  createEmptyProject,
  hasBlocking,
  isExteriorItem,
  suggestPlacement,
  validatePlacement,
} from '@/domain';
import { getBuiltinItem, isExteriorCategory } from '@/catalog';
import { getBuiltinMaterial } from '@/materials';
import { studioProject } from '../reference/projects';

let seq = 0;
const genId = () => `ext-${++seq}`;

describe('Build Exterior — plasare, validare, scenă 3D și buget', () => {
  it('identifică corect itemii și categoriile de exterior', () => {
    for (const id of [
      'exterior.foundation',
      'exterior.fence-metal',
      'exterior.gate-auto',
      'exterior.parking-bay',
      'exterior.garage',
      'exterior.hall',
      'exterior.tree-deciduous',
      'exterior.car-sedan',
    ]) {
      const item = getBuiltinItem(id);
      expect(item, id).toBeDefined();
      expect(isExteriorItem(item), id).toBe(true);
      expect(isExteriorCategory(item!.category), id).toBe(true);
    }
    expect(isExteriorItem(getBuiltinItem('living.sofa-2'))).toBe(false);
    expect(isExteriorCategory('living')).toBe(false);
  });

  it('obiectele exterioare se plasează liber în afara camerelor și nu primesc eroare de cameră sau tavan', () => {
    const doc = studioProject();
    const geom = analyzeGeometry(doc);
    const hall = getBuiltinItem('exterior.hall')!;
    const place = suggestPlacement(doc, hall, hall.defaultSize, geom);
    const added = addObject(doc, hall, place, genId);
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const placedObj = added.value.doc.objects[added.value.objectId]!;
    const issues = validatePlacement(added.value.doc, analyzeGeometry(added.value.doc), placedObj);
    expect(hasBlocking(issues)).toBe(false);
    expect(issues.some((i) => i.code === 'outside-room')).toBe(false);
    expect(issues.some((i) => i.code === 'taller-than-ceiling')).toBe(false);
  });

  it('fundația plasată peste pereții casei produce cel mult avertisment (nu eroare blocantă)', () => {
    const doc = studioProject();
    const foundation = getBuiltinItem('exterior.foundation')!;
    const added = addObject(
      doc,
      foundation,
      { position: { x: 2000, y: 2000 }, rotationDeg: 0 },
      genId,
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const placedObj = added.value.doc.objects[added.value.objectId]!;
    const issues = validatePlacement(added.value.doc, analyzeGeometry(added.value.doc), placedObj);
    expect(hasBlocking(issues)).toBe(false);
  });

  it('proiect exclusiv exterior (fără camere): construiește scena 3D și calculează bugetul', () => {
    let doc = createEmptyProject('p-ext', 'Curte și hală', '2026-11-27T10:00:00.000Z');
    for (const id of [
      'exterior.foundation',
      'exterior.fence-metal',
      'exterior.gate-auto',
      'exterior.parking-bay',
      'exterior.garage',
      'exterior.hall',
      'exterior.tree-deciduous',
      'exterior.car-suv',
    ]) {
      const item = getBuiltinItem(id)!;
      const place = suggestPlacement(doc, item);
      const r = addObject(doc, item, place, genId);
      expect(r.ok, id).toBe(true);
      if (r.ok) doc = r.value.doc;
    }

    const scene = buildScene(doc);
    expect(scene.boxes).toHaveLength(8);
    expect(scene.boxes.every((b) => b.recipe !== null)).toBe(true);

    const budget = computeBudget(doc);
    expect(budget.lines).toHaveLength(8);
    expect(budget.total.grossMinor).toBeGreaterThan(0);
  });

  it('materialele exterioare (gazon, asfalt, pavele) se aplică pe podea și intră în buget', () => {
    const doc = studioProject();
    const roomId = Object.keys(doc.rooms)[0]!;
    const grass = getBuiltinMaterial('mat.ext.grass')!;
    const r = applyFinish(doc, grass, { kind: 'roomFloor', roomId }, genId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const budget = computeBudget(r.value.doc);
    expect(budget.lines.some((l) => l.key === 'finish:mat.ext.grass')).toBe(true);
  });
});
