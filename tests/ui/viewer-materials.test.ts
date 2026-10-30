// Mediu NODE: materiale → Three (fără WebGL): cache, reutilizare, scurgeri, UV, grupe pe fețe, contur, performanță.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  addObject,
  applyFinish,
  applyFinishToRoomWalls,
  buildScene,
  defaultParams,
  roomWallTargets,
  updateAssignmentLook,
  type FinishTarget,
  type ProjectDocument,
} from '@/domain';
import { BUILTIN_ITEMS, getBuiltinItem } from '@/catalog';
import { BUILTIN_MATERIALS, getBuiltinMaterial, textureLayout } from '@/materials';
import {
  GeometryCache,
  buildSceneObjects,
  prismGeometry,
  surfaceOutline,
} from '@/features/viewer-3d/sceneObjects';
import { MaterialCache } from '@/features/viewer-3d/materialCache';
import { studioProject } from '../reference/projects';

let n = 0;
const genId = () => `v${++n}`;
const mat = (id: string) => getBuiltinMaterial(id)!;
function must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
function clean(): ProjectDocument {
  const d = studioProject();
  return {
    ...d,
    objects: {},
    finishAssignments: {},
    catalogSnapshot: { items: {}, finishes: {} },
    budget: { overrides: {}, manualLines: {} },
  };
}
const floor = (roomId: string): FinishTarget => ({ kind: 'roomFloor', roomId });

/** Construiește materialele scenei ca în `ViewerCanvas` (suprafețe + obiecte) și întoarce ce s-a folosit. */
function materialsFor(doc: ProjectDocument, cache: MaterialCache, geoCache?: GeometryCache) {
  const scene = buildScene(doc);
  const objs = buildSceneObjects(scene, geoCache);
  const used = {
    walls: objs.walls.map((w) => [
      cache.surface(w.left ? (scene.looks[w.left] ?? null) : null, '#e7e5e4'),
      cache.surface(w.right ? (scene.looks[w.right] ?? null) : null, '#e7e5e4'),
      cache.surface(null, '#e7e5e4'),
    ]),
    floors: objs.floors.map((f) =>
      cache.surface(f.look ? (scene.looks[f.look] ?? null) : null, f.colorHex, 0.85),
    ),
    objects: objs.objects.map((o) =>
      o.materials.map((m) => cache.object(m.roughness, m.metalness)),
    ),
  };
  cache.prune();
  return { scene, objs, used };
}

describe('prismă: grupe pe fețe și UV în lume', () => {
  const poly = [
    { x: 0, y: -50 },
    { x: 4000, y: -50 },
    { x: 4000, y: 50 },
    { x: 0, y: 50 },
  ];
  const sceneLook = (id: string, look = {}) => {
    const l = buildScene(
      must(applyFinish(clean(), mat(id), floor('rA'), genId, { look })).doc,
    ).floors.find((f) => f.roomId === 'rA')!;
    return l;
  };
  it('3 grupe (stânga, dreapta, restul) acoperă toate vârfurile; volumul = arie × înălțime; UV doar pe fețele texturate', () => {
    const wood = buildScene(
      must(applyFinish(clean(), mat('mat.wood.natural'), floor('rA'), genId)).doc,
    );
    const look = Object.values(wood.looks)[0]!;
    const g = prismGeometry(poly, 0, 2600, look, null);
    expect(g.groups.map((x) => x.materialIndex)).toEqual([0, 1, 2]);
    expect(g.groups.reduce((a, x) => a + x.count, 0)).toBe(g.getAttribute('position').count);
    const uv = g.getAttribute('uv');
    const left = g.groups[0]!;
    const right = g.groups[1]!;
    let leftNonZero = 0;
    for (let i = left.start; i < left.start + left.count; i++)
      if (uv.getX(i) !== 0 || uv.getY(i) !== 0) leftNonZero++;
    expect(leftNonZero).toBeGreaterThan(0);
    for (let i = right.start; i < right.start + right.count; i++) expect(uv.getX(i)).toBe(0); // fața fără material
    g.computeBoundingBox();
    expect(g.boundingBox!.max.z).toBeCloseTo(2.6, 6);
    expect(sceneLook('mat.wood.natural').look).not.toBeNull();
  });

  it('UV continuu între prisme vecine ale aceluiași perete (aceeași coordonată în lume ⇒ același UV) și respectă scara', () => {
    const wood = buildScene(
      must(applyFinish(clean(), mat('mat.wood.natural'), floor('rA'), genId)).doc,
    );
    const look = Object.values(wood.looks)[0]!;
    const a = prismGeometry(
      poly.map((p) => ({ x: p.x, y: p.y })),
      0,
      2600,
      look,
      look,
    );
    // aceeași prismă tăiată în două la 1200 mm: UV-ul punctelor comune e identic
    const lo = prismGeometry(poly, 0, 1200, look, look);
    const hi = prismGeometry(poly, 1200, 2600, look, look);
    const uvAt = (g: THREE.BufferGeometry, x: number, y: number) => {
      const p = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      for (let i = g.groups[0]!.start; i < g.groups[0]!.start + g.groups[0]!.count; i++)
        if (
          Math.abs(p.getX(i) * 1000 - x) < 1e-2 &&
          Math.abs((g === hi ? 1200 : 0) + p.getZ(i) * 1000 - y) < 1e-2
        )
          return [uv.getX(i), uv.getY(i)];
      return null;
    };
    const top = uvAt(lo, 0, 1200);
    const bottom = uvAt(hi, 0, 1200);
    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();
    expect(top![0]).toBeCloseTo(bottom![0]!, 9);
    expect(top![1]).toBeCloseTo(bottom![1]!, 9);
    const L = textureLayout(look.texture!);
    const full = uvAt(a, 0, 2600)!;
    expect(full[1]).toBeCloseTo(2600 / L.worldH, 6);
    // scara 2 întinde textura la jumătate din frecvența UV
    const scaled = buildScene(
      must(
        applyFinish(clean(), mat('mat.wood.natural'), floor('rA'), genId, {
          look: { textureScale: 2 },
        }),
      ).doc,
    );
    const g2 = prismGeometry(poly, 0, 2600, Object.values(scaled.looks)[0]!, null);
    expect(uvAt(g2, 0, 2600)![1]).toBeCloseTo(full[1]! / 2, 6);
  });
});

describe('conturul suprafeței selectate', () => {
  it('podea: perimetrul camerei; față de perete: dreptunghiuri decalate cu 4 mm spre exterior; altele ⇒ null', () => {
    const doc = clean();
    const scene = buildScene(doc);
    const floorSeg = surfaceOutline(scene, floor('rA'))!;
    expect(floorSeg.length / 6).toBe(scene.floors.find((f) => f.roomId === 'rA')!.polygon.length);
    const face = roomWallTargets(doc, 'rA')[0]! as Extract<FinishTarget, { kind: 'wallSide' }>;
    const seg = surfaceOutline(scene, face)!;
    const prisms = scene.prisms.filter((p) => p.wallId === face.wallId).length;
    expect(seg.length / 6).toBe(prisms * 4);
    for (const v of seg) expect(Number.isFinite(v)).toBe(true);
    expect(surfaceOutline(scene, null)).toBeNull();
    expect(surfaceOutline(scene, floor('nu-exista'))).toBeNull();
    expect(surfaceOutline(scene, { kind: 'objectSlot', objectId: 'x', slot: 'body' })).toBeNull();
  });
});

describe('MaterialCache: reutilizare și fără scurgeri', () => {
  it('același aspect pe mai multe suprafețe = UN singur material și o singură textură', () => {
    let doc = clean();
    doc = must(applyFinish(doc, mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    doc = must(applyFinish(doc, mat('mat.parquet.oak-light'), floor('rB'), genId)).doc;
    doc = must(applyFinishToRoomWalls(doc, mat('mat.paint.sage'), 'rA', genId)).doc;
    doc = must(applyFinishToRoomWalls(doc, mat('mat.paint.sage'), 'rB', genId)).doc;
    const cache = new MaterialCache();
    const { used } = materialsFor(doc, cache);
    expect(used.floors[0]).toBe(used.floors[1]); // aceeași instanță Three
    const sage = new Set(
      used.walls
        .map((w) => w[0])
        .concat(used.walls.map((w) => w[1]))
        .filter((m) => m!.color.getHexString() === '9bae97'),
    );
    expect(sage.size).toBe(1);
    expect(cache.stats().textures).toBe(1); // doar parchetul are textură
    // la nivelul scenei există un singur aspect pentru podea și unul pentru vopsea
    expect(cache.stats().materialsCreated).toBeLessThanOrEqual(5);
    cache.clear();
  });

  it('scara/rotația diferite NU creează texturi sau materiale noi (se schimbă doar UV-ul)', () => {
    let doc = must(applyFinish(clean(), mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    doc = must(
      applyFinish(doc, mat('mat.parquet.oak-light'), floor('rB'), genId, {
        look: { textureScale: 2, textureRotationDeg: 45 },
      }),
    ).doc;
    const cache = new MaterialCache();
    const { used } = materialsFor(doc, cache);
    expect(used.floors[0]).toBe(used.floors[1]);
    expect(cache.stats()).toMatchObject({ textures: 1, texturesCreated: 1 });
    cache.clear();
  });

  it('înlocuirea unui material eliberează textura și materialul vechi; nimic nu rămâne nefolosit (fără scurgeri)', () => {
    const cache = new MaterialCache();
    const geo = new GeometryCache();
    let doc = must(applyFinish(clean(), mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    const first = materialsFor(doc, cache, geo);
    const oldMat = first.used.floors[0] as THREE.MeshStandardMaterial;
    const oldTex = oldMat.map!;
    let materialDisposed = 0,
      textureDisposed = 0;
    oldMat.addEventListener('dispose', () => materialDisposed++);
    oldTex.addEventListener('dispose', () => textureDisposed++);
    const before = cache.stats();
    expect(before.textures).toBe(1);

    // 20 de înlocuiri succesive: numărul de resurse vii rămâne constant
    const ids = [
      'mat.tile.grey',
      'mat.parquet.dark',
      'mat.stone.natural',
      'mat.tile.white',
      'mat.concrete.polished',
    ];
    for (let i = 0; i < 20; i++) {
      const m = mat(ids[i % ids.length]!);
      doc = must(applyFinish(doc, m, floor('rA'), genId)).doc;
      materialsFor(doc, cache, geo);
      const s = cache.stats();
      expect(s.materials).toBeLessThanOrEqual(8); // pereți impliciți + podeaua curentă + obiecte
      expect(s.textures).toBeLessThanOrEqual(1);
    }
    expect(materialDisposed).toBe(1);
    expect(textureDisposed).toBe(1);
    expect(cache.stats().disposed).toBeGreaterThan(20);
    // eliminarea materialului: textura dispare
    doc = { ...doc, finishAssignments: {} };
    materialsFor(doc, cache, geo);
    expect(cache.stats().textures).toBe(0);
    cache.clear();
    expect(cache.stats()).toMatchObject({ materials: 0, textures: 0 });
    geo.clear();
  });

  it('modificarea culorii/rugozității dă un material nou și îl eliberează pe cel vechi; revenirea refolosește cheia', () => {
    const cache = new MaterialCache();
    let doc = must(
      applyFinish(clean(), mat('mat.paint.blue'), roomWallTargets(clean(), 'rA')[0]!, genId),
    ).doc;
    const id = Object.keys(doc.finishAssignments)[0]!;
    materialsFor(doc, cache);
    const base = cache.stats().materials;
    doc = must(updateAssignmentLook(doc, id, { colorHex: '#ff0000' }));
    materialsFor(doc, cache);
    expect(cache.stats().materials).toBe(base); // vechiul a fost eliberat
    doc = must(updateAssignmentLook(doc, id, { roughness: 0.2 }));
    materialsFor(doc, cache);
    expect(cache.stats().materials).toBe(base);
    cache.clear();
  });

  it('materiale speciale: sticla e transparentă (fără depthWrite), metalul are metalness, materialul texturat folosește harta', () => {
    const cache = new MaterialCache();
    const face = roomWallTargets(clean(), 'rA')[0]!;
    let doc = must(applyFinish(clean(), mat('mat.glass.clear'), face, genId)).doc;
    doc = must(
      applyFinish(doc, mat('mat.metal.chrome'), roomWallTargets(doc, 'rA')[1]!, genId),
    ).doc;
    doc = must(applyFinish(doc, mat('mat.wtile.metro'), roomWallTargets(doc, 'rA')[2]!, genId)).doc;
    const { used } = materialsFor(doc, cache);
    const all = used.walls.flat() as THREE.MeshStandardMaterial[];
    const glass = all.find((m) => m.transparent)!;
    expect(glass.opacity).toBeCloseTo(0.35, 6);
    expect(glass.depthWrite).toBe(false);
    const chrome = all.find((m) => m.metalness === 1)!;
    expect(chrome.roughness).toBeCloseTo(0.12, 6);
    const tiled = all.find((m) => m.map)!;
    expect(tiled.map!.wrapS).toBe(THREE.RepeatWrapping);
    expect(tiled.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(tiled.color.getHexString()).toBe('ffffff'); // culoarea e în textură
    cache.clear();
  });
});

describe('zone de obiect: materiale pe grupe', () => {
  it('finisajele corp/fronturi dau grupe cu rugozitate/metalicitate diferite; geometria se reconstruiește doar pentru obiectul modificat', () => {
    const r = must(
      addObject(
        clean(),
        getBuiltinItem('bedroom.wardrobe')!,
        { position: { x: 1500, y: 1500 } },
        genId,
      ),
    );
    let doc = r.doc;
    const keep = must(
      addObject(doc, getBuiltinItem('kitchen.chair')!, { position: { x: 2500, y: 1500 } }, genId),
    );
    doc = keep.doc;
    const geo = new GeometryCache();
    const before = buildSceneObjects(buildScene(doc), geo);
    const chairGeo = before.objects.find((o) => o.id === keep.objectId)!.geometry;
    const plain = before.objects.find((o) => o.id === r.objectId)!;
    expect(plain.materials.length).toBeGreaterThanOrEqual(1);

    doc = must(
      applyFinish(
        doc,
        mat('mat.furn.gloss-white'),
        { kind: 'objectSlot', objectId: r.objectId, slot: 'body' },
        genId,
      ),
    ).doc;
    doc = must(
      applyFinish(
        doc,
        mat('mat.furn.metallic'),
        { kind: 'objectSlot', objectId: r.objectId, slot: 'front' },
        genId,
      ),
    ).doc;
    const after = buildSceneObjects(buildScene(doc), geo);
    const w = after.objects.find((o) => o.id === r.objectId)!;
    expect(w.geometry).not.toBe(plain.geometry);
    expect(w.materials.some((m) => m.roughness <= 0.12 && m.metalness === 0)).toBe(true); // corp lucios
    expect(w.materials.some((m) => m.metalness >= 0.9)).toBe(true); // fronturi metalice
    expect(w.geometry.groups.length).toBe(w.materials.length);
    expect(w.geometry.groups.reduce((a, g) => a + g.count, 0)).toBe(
      w.geometry.getAttribute('position').count,
    );
    expect(after.objects.find((o) => o.id === keep.objectId)!.geometry).toBe(chairGeo); // scaunul nu s-a refăcut
    geo.clear();
  });
});

describe('performanță: ~100 de obiecte, mai multe camere, materiale diferite și reutilizate', () => {
  it('construirea scenei, a geometriilor și a materialelor rămâne în limite; resursele nu cresc la reconstruiri repetate', () => {
    let doc = clean();
    for (let i = 0; i < 100; i++) {
      const it = BUILTIN_ITEMS[i % BUILTIN_ITEMS.length]!;
      const r = addObject(
        doc,
        it,
        {
          position: { x: 400 + (i % 10) * 650, y: 400 + Math.floor(i / 10) * 600 },
          rotationDeg: (i * 15) % 360,
          params: defaultParams(it),
        },
        genId,
      );
      if (!r.ok) throw new Error(`${it.id}: ${r.error}`);
      doc = r.value.doc;
    }
    // materiale: podele diferite pe cele două camere, pereți cu 3 materiale, finisaje pe 40 de zone de obiect
    doc = must(applyFinish(doc, mat('mat.parquet.oak-natural'), floor('rA'), genId)).doc;
    doc = must(applyFinish(doc, mat('mat.tile.marble'), floor('rB'), genId)).doc;
    doc = must(applyFinishToRoomWalls(doc, mat('mat.paint.sage'), 'rA', genId)).doc;
    doc = must(applyFinishToRoomWalls(doc, mat('mat.wtile.metro'), 'rB', genId)).doc;
    doc = must(
      applyFinish(doc, mat('mat.concrete.exposed'), roomWallTargets(doc, 'rA')[0]!, genId),
    ).doc;
    const furn = BUILTIN_MATERIALS.filter((m) => m.kind === 'furniture');
    Object.keys(doc.objects)
      .slice(0, 40)
      .forEach((oid, i) => {
        const r = applyFinish(
          doc,
          furn[i % furn.length]!,
          { kind: 'objectSlot', objectId: oid, slot: 'body' },
          genId,
        );
        if (r.ok) doc = r.value.doc;
      });
    const cache = new MaterialCache();
    const geo = new GeometryCache();
    const t0 = performance.now();
    const scene = buildScene(doc);
    const tScene = performance.now() - t0;
    const t1 = performance.now();
    const first = materialsFor(doc, cache, geo);
    const tBuild = performance.now() - t1;
    const stats1 = cache.stats();
    const verts = first.objs.objects.reduce(
      (a, o) => a + o.geometry.getAttribute('position').count,
      0,
    );
    // 30 de reconstruiri după mici modificări: resursele rămân constante
    let tRebuild = 0;
    for (let i = 0; i < 30; i++) {
      const oid = Object.keys(doc.objects)[i]!;
      const moved = {
        ...doc,
        objects: {
          ...doc.objects,
          [oid]: { ...doc.objects[oid]!, position: { x: 100 + i, y: 100 } },
        },
      };
      const t = performance.now();
      materialsFor(moved, cache, geo);
      tRebuild += performance.now() - t;
    }
    const stats2 = cache.stats();
    console.info(
      `[perf materiale] scenă ${tScene.toFixed(0)} ms · geometrii+materiale ${tBuild.toFixed(0)} ms · 30 reconstruiri ${tRebuild.toFixed(0)} ms ` +
        `(${(tRebuild / 30).toFixed(1)} ms/buc) · ${first.objs.objects.length} obiecte, ${verts} vârfuri · ${stats1.materials} materiale, ${stats1.textures} texturi (create ${stats1.texturesCreated}) · ` +
        `${Object.keys(scene.looks).length} aspecte · geometrii ${geo.size}`,
    );
    expect(first.objs.objects).toHaveLength(100);
    expect(stats1.textures).toBe(4); // stejar, marmură, faianță metro, beton aparent
    expect(stats1.materials).toBeLessThan(40);
    expect(stats2.materials).toBeLessThanOrEqual(stats1.materials);
    expect(stats2.textures).toBe(stats1.textures);
    expect(stats2.texturesCreated).toBe(stats1.texturesCreated); // nicio textură nouă la reconstruiri
    expect(tScene).toBeLessThan(3000);
    expect(tBuild).toBeLessThan(6000);
    expect(tRebuild / 30).toBeLessThan(500);
    cache.clear();
    geo.clear();
    expect(cache.stats()).toMatchObject({ materials: 0, textures: 0 });
  });
});
