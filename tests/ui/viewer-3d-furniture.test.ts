// Mediu NODE: obiectele din scenă → geometrii Three (fără WebGL/DOM), cache, selecție, performanță pe ~100 de obiecte.
import { describe, expect, it } from 'vitest';
import { addObject, buildScene, defaultParams, updateObject, type ProjectDocument } from '@/domain';
import { BUILTIN_ITEMS, getBuiltinItem } from '@/catalog';
import {
  GeometryCache,
  buildSceneObjects,
  frameCamera,
  sceneBounds,
} from '@/features/viewer-3d/sceneObjects';
import { selectScene } from '@/state/selectors';
import { studioProject } from '../reference/projects';

let n = 0;
const genId = () => `o${++n}`;
const item = (id: string) => getBuiltinItem(id)!;

function emptyStudio(): ProjectDocument {
  const d = studioProject();
  return {
    ...d,
    objects: {},
    catalogSnapshot: { ...d.catalogSnapshot, items: {} },
    budget: { overrides: {}, manualLines: {} },
  };
}
function put(doc: ProjectDocument, id: string, x: number, y: number, extra = {}) {
  const r = addObject(doc, item(id), { position: { x, y }, ...extra }, genId);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('obiecte → geometrii Three', () => {
  it('un mesh per obiect; baza la elevație, rotația −θ, geometria locală = dimensiunile obiectului', () => {
    let { doc } = put(emptyStudio(), 'bedroom.wardrobe', 1500, 1500);
    const mirror = put(doc, 'decor.mirror', 800, 400, { rotationDeg: 90 });
    doc = mirror.doc;
    const scene = buildScene(doc);
    const o = buildSceneObjects(scene);
    expect(o.objects).toHaveLength(2);
    const wardrobe = o.objects.find((x) => x.id !== mirror.objectId)!;
    expect(wardrobe.position).toEqual([1.5, 0, 1.5]); // pe podea: baza la y = 0
    expect(wardrobe.size).toEqual([1, 2.1, 0.6]);
    const m = o.objects.find((x) => x.id === mirror.objectId)!;
    expect(m.position[1]).toBeCloseTo(1, 9); // suspendat: baza la elevația din catalog
    expect(m.rotationY).toBeCloseTo(-Math.PI / 2, 9);
    for (const obj of o.objects) {
      obj.geometry.computeBoundingBox();
      const b = obj.geometry.boundingBox!;
      expect(b.min.x).toBeCloseTo(-obj.size[0] / 2, 5);
      expect(b.max.x).toBeCloseTo(obj.size[0] / 2, 5);
      expect(b.min.y).toBeCloseTo(0, 5);
      expect(b.max.y).toBeCloseTo(obj.size[1], 5);
      expect(b.min.z).toBeCloseTo(-obj.size[2] / 2, 5);
      expect(b.max.z).toBeCloseTo(obj.size[2] / 2, 5);
      expect(obj.geometry.getAttribute('color').count).toBe(
        obj.geometry.getAttribute('position').count,
      );
      expect(obj.placeholder).toBe(false);
    }
    o.dispose();
  });

  it('plasa este în cadrul obiectului: după aplicarea rotației și a poziției, cutia mondială = amprenta din plan', () => {
    const { doc, objectId } = put(emptyStudio(), 'living.sofa-3', 3000, 2000, { rotationDeg: 90 });
    const o = buildSceneObjects(buildScene(doc)).objects.find((x) => x.id === objectId)!;
    // lățimea (X local) 2100 rotită cu 90° ocupă axa Z (planul Y) a lumii
    const w = o.geometry.clone();
    w.rotateY(o.rotationY).translate(...o.position);
    w.computeBoundingBox();
    const b = w.boundingBox!;
    expect(b.max.z - b.min.z).toBeCloseTo(2.1, 4);
    expect(b.max.x - b.min.x).toBeCloseTo(0.95, 4);
    expect((b.max.x + b.min.x) / 2).toBeCloseTo(3, 4);
    expect((b.max.z + b.min.z) / 2).toBeCloseTo(2, 4);
  });

  it('obiecte identice partajează geometria; un obiect nemodificat o păstrează la reconstruirea scenei; cea orfană se elibereaza', () => {
    let { doc } = put(emptyStudio(), 'kitchen.chair', 1000, 1000);
    const second = put(doc, 'kitchen.chair', 1600, 1000);
    doc = second.doc;
    const third = put(doc, 'bedroom.wardrobe', 3000, 1000);
    doc = third.doc;
    const cache = new GeometryCache();
    const a = buildSceneObjects(buildScene(doc), cache);
    expect(cache.size).toBe(2); // două scaune identice ⇒ o singură plasă
    expect(a.objects[0]!.geometry).toBe(a.objects[1]!.geometry);

    const edited = updateObject(doc, third.objectId, { params: { fronts: 3 } });
    if (!edited.ok) throw new Error(edited.error);
    const b = buildSceneObjects(buildScene(edited.value), cache);
    const chairBefore = a.objects.find((x) => x.id === second.objectId)!.geometry;
    expect(b.objects.find((x) => x.id === second.objectId)!.geometry).toBe(chairBefore);
    expect(b.objects.find((x) => x.id === third.objectId)!.geometry).not.toBe(
      a.objects.find((x) => x.id === third.objectId)!.geometry,
    );
    expect(cache.size).toBe(2); // plasa veche a dulapului a fost eliberată
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('rețetă necunoscută ⇒ cutie de înlocuire marcată; dimensiunile se păstrează', () => {
    const { doc, objectId } = put(emptyStudio(), 'living.armchair', 1500, 1500);
    const alien = JSON.parse(JSON.stringify(doc)) as ProjectDocument;
    alien.catalogSnapshot.items['living.armchair']!.recipe = { id: 'din-viitor', version: 9 };
    const o = buildSceneObjects(buildScene(alien)).objects.find((x) => x.id === objectId)!;
    expect(o.placeholder).toBe(true);
    expect(o.geometry.getAttribute('position').count).toBe(36); // o cutie = 12 triunghiuri
    o.geometry.computeBoundingBox();
    expect(o.geometry.boundingBox!.max.y).toBeCloseTo(0.85, 5);
  });

  it('încadrarea camerei include obiectele (și cele din afara pereților)', () => {
    const base = emptyStudio();
    const empty = sceneBounds(buildScene(base))!;
    const { doc } = put(base, 'bedroom.wardrobe', 20000, 1500);
    const b = sceneBounds(buildScene(doc))!;
    expect(b.max[0]).toBeGreaterThan(empty.max[0] + 10);
    expect(b.max[0]).toBeGreaterThanOrEqual(20.4); // 20 m + jumătate din lățime
    const pose = frameCamera(b, 45, 1.5);
    for (const v of [...pose.position, ...pose.target]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('performanță: scenă cu 100 de obiecte', () => {
  it('construirea scenei, a geometriilor și a plaselor rămâne în limite rezonabile; geometriile se reutilizează', () => {
    let doc = emptyStudio();
    const items = BUILTIN_ITEMS;
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      const it = items[i % items.length]!;
      const col = i % 10;
      const row = Math.floor(i / 10);
      const r = addObject(
        doc,
        it,
        {
          position: { x: 500 + col * 700, y: 500 + row * 700 },
          rotationDeg: (i * 15) % 360,
          params: defaultParams(it),
        },
        genId,
      );
      if (!r.ok) throw new Error(`${it.id}: ${r.error}`);
      doc = r.value.doc;
    }
    const tAdd = performance.now() - t0;
    expect(Object.keys(doc.objects)).toHaveLength(100);

    const t1 = performance.now();
    const scene = selectScene(doc);
    const tScene = performance.now() - t1;
    expect(scene.boxes).toHaveLength(100);

    const cache = new GeometryCache();
    const t2 = performance.now();
    const built = buildSceneObjects(scene, cache);
    const tBuild = performance.now() - t2;
    const triangles = built.objects.reduce(
      (a, o) => a + o.geometry.getAttribute('position').count / 3,
      0,
    );

    // reconstruirea după o modificare dintr-un singur obiect reutilizează aproape tot
    const first = Object.keys(doc.objects)[0]!;
    const edited = updateObject(doc, first, { position: { x: 123, y: 456 } });
    if (!edited.ok) throw new Error(edited.error);
    const t3 = performance.now();
    const rebuilt = buildSceneObjects(selectScene(edited.value), cache);
    const tRebuild = performance.now() - t3;

    console.info(
      `[perf 100 obiecte] adăugare ${tAdd.toFixed(0)} ms · scenă ${tScene.toFixed(0)} ms · geometrii ${tBuild.toFixed(0)} ms · ` +
        `reconstruire după mutare ${tRebuild.toFixed(0)} ms · ${triangles} triunghiuri · ${cache.size} geometrii distincte`,
    );
    expect(built.objects).toHaveLength(100);
    expect(rebuilt.objects).toHaveLength(100);
    expect(tScene).toBeLessThan(3000);
    expect(tBuild).toBeLessThan(5000);
    expect(tRebuild).toBeLessThan(tBuild + 500); // reutilizarea nu e mai lentă decât prima construire
    expect(triangles).toBeLessThan(150_000); // buget de triunghiuri pentru ~100 de obiecte
    expect(cache.size).toBeLessThanOrEqual(100);
    cache.clear();
  });
});
