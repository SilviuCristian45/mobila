import { describe, expect, it } from 'vitest';
import {
  addObject,
  buildScene,
  checkIntegrity,
  defaultParams,
  duplicateObject,
  exportProject,
  importProject,
  paramProblems,
  ProjectDocumentSchema,
  removeObject,
  sizeProblems,
  suggestPlacement,
  updateObject,
  type CatalogItem,
  type ObjectPatch,
  type ProjectDocument,
} from '@/domain';
import { BUILTIN_ITEMS, getBuiltinItem } from '@/catalog';
import { studioProject } from '../reference/projects';

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };
const item = (id: string): CatalogItem => getBuiltinItem(id)!;
const ids = () => {
  let n = 0;
  return () => `n${++n}`;
};
/** Documentul de referință, fără obiectele lui, ca punct de plecare curat. */
function emptyStudio(): ProjectDocument {
  const d = studioProject();
  return {
    ...d,
    objects: {},
    catalogSnapshot: { ...d.catalogSnapshot, items: {} },
    budget: { overrides: {}, manualLines: {} },
  };
}
function place(doc: ProjectDocument, itemId: string, x = 1500, y = 1500, genId = ids()) {
  const r = addObject(doc, item(itemId), { position: { x, y } }, genId);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('parametri și dimensiuni (domeniu)', () => {
  const wardrobe = item('bedroom.wardrobe');
  it('valori implicite din paramSpecs; tipuri și intervale verificate', () => {
    expect(defaultParams(wardrobe)).toMatchObject({ fronts: 2, frontType: 'doors', handles: true });
    const ok = paramProblems(wardrobe, { fronts: 3, frontType: 'drawers', handles: false });
    expect(ok).toEqual({ invalid: [], unknown: [] });
    expect(paramProblems(wardrobe, { fronts: 0 }).invalid).toHaveLength(1); // sub minim
    expect(paramProblems(wardrobe, { fronts: 99 }).invalid).toHaveLength(1); // peste maxim
    expect(paramProblems(wardrobe, { fronts: 2.5 }).invalid).toHaveLength(1); // „count” = întreg
    expect(paramProblems(wardrobe, { fronts: NaN }).invalid).toHaveLength(1);
    expect(paramProblems(wardrobe, { frontType: 'sertare' }).invalid).toHaveLength(1); // opțiune inexistentă
    expect(paramProblems(wardrobe, { handles: 'da' }).invalid).toHaveLength(1);
    expect(paramProblems(wardrobe, { culoare: 1 }).unknown).toEqual(['culoare']);
  });

  it('dimensiuni: pozitive, întregi, în limitele itemului (fiecare tip de obiect)', () => {
    for (const it of BUILTIN_ITEMS) {
      expect(sizeProblems(it, it.defaultSize), it.id).toEqual([]);
      const { widthMm: w, depthMm: d, heightMm: h } = it.sizeLimits;
      expect(sizeProblems(it, { widthMm: w.min, depthMm: d.min, heightMm: h.min })).toEqual([]);
      expect(sizeProblems(it, { widthMm: w.max, depthMm: d.max, heightMm: h.max })).toEqual([]);
      expect(sizeProblems(it, { ...it.defaultSize, widthMm: w.min - 1 }), it.id).toHaveLength(1);
      expect(sizeProblems(it, { ...it.defaultSize, heightMm: h.max + 1 }), it.id).toHaveLength(1);
      expect(sizeProblems(it, { ...it.defaultSize, depthMm: 0 })).toHaveLength(1);
      expect(sizeProblems(it, { ...it.defaultSize, widthMm: -50 })).toHaveLength(1);
      expect(sizeProblems(it, { ...it.defaultSize, widthMm: 1000.5 })).toHaveLength(1);
    }
  });

  it('parametrii fiecărui item: toate valorile permise sunt acceptate, cele din afara limitelor sunt respinse', () => {
    for (const it of BUILTIN_ITEMS)
      for (const [k, s] of Object.entries(it.paramSpecs)) {
        const good =
          s.type === 'enum' ? s.options : s.type === 'bool' ? [true, false] : [s.min, s.max];
        for (const v of good)
          expect(paramProblems(it, { [k]: v }).invalid, `${it.id}.${k}=${v}`).toEqual([]);
        const bad = s.type === 'enum' ? 'nu-exista' : s.type === 'bool' ? 'x' : s.max + 1;
        expect(paramProblems(it, { [k]: bad }).invalid, `${it.id}.${k}`).toHaveLength(1);
      }
  });
});

describe('adăugare', () => {
  it('copiază itemul în catalogSnapshot la prima utilizare și creează un obiect valid, JSON-serializabil', () => {
    const base = emptyStudio();
    const { doc, objectId } = place(base, 'living.sofa-3', 2000, 1800);
    const o = doc.objects[objectId]!;
    expect(o).toMatchObject({
      catalogItemId: 'living.sofa-3',
      position: { x: 2000, y: 1800 },
      rotationDeg: 0,
      elevationMm: 0,
      size: { widthMm: 2100, depthMm: 950, heightMm: 850 },
    });
    expect(o.params).toEqual(defaultParams(item('living.sofa-3')));
    expect(doc.catalogSnapshot.items['living.sofa-3']).toEqual(item('living.sofa-3'));
    expect(ProjectDocumentSchema.safeParse(doc).success).toBe(true);
    expect(checkIntegrity(doc).valid).toBe(true);
    // documentul nu conține nimic din Three: se serializează identic prin JSON
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    // documentul original nu e modificat
    expect(base.objects).toEqual({});
  });

  it('ID-uri unice (generatorul care repetă un ID existent e reîncercat); eșuează controlat dacă nu produce ID-uri noi', () => {
    const { doc, objectId } = place(emptyStudio(), 'living.armchair');
    let calls = 0;
    const r = addObject(doc, item('living.armchair'), { position: { x: 1, y: 1 } }, () => {
      calls++;
      return calls < 3 ? objectId : 'altul';
    });
    expect(r.ok && r.value.objectId).toBe('altul');
    const stuck = addObject(
      doc,
      item('living.armchair'),
      { position: { x: 1, y: 1 } },
      () => objectId,
    );
    expect(stuck.ok).toBe(false);
  });

  it('respinge dimensiuni/parametri invalizi și poziții neîntregi, cu mesaj în română', () => {
    const base = emptyStudio();
    const g = ids();
    const bad = (opts: Parameters<typeof addObject>[2]) => {
      const r = addObject(base, item('bedroom.wardrobe'), opts, g);
      expect(r.ok).toBe(false);
      return r.ok ? '' : r.error;
    };
    expect(bad({ position: { x: 1.5, y: 0 } })).toMatch(/milimetri întregi/);
    expect(
      bad({ position: { x: 0, y: 0 }, size: { widthMm: 0, depthMm: 600, heightMm: 2000 } }),
    ).toMatch(/Lățimea/);
    expect(
      bad({ position: { x: 0, y: 0 }, size: { widthMm: 1000, depthMm: 600, heightMm: 99999 } }),
    ).toMatch(/Înălțimea/);
    expect(bad({ position: { x: 0, y: 0 }, params: { fronts: -1 } })).toMatch(/fronturi|fronts/);
    expect(bad({ position: { x: 0, y: 0 }, params: { inexistent: 1 } })).toMatch(/necunoscut/);
  });

  it('elevație implicită: podea 0; perete = valoarea din catalog; tavan = înălțimea tavanului − înălțimea obiectului', () => {
    const base = emptyStudio();
    const ceiling = base.levels[Object.keys(base.levels)[0]!]!.ceilingHeightMm;
    const mirror = place(base, 'decor.mirror').doc;
    expect(Object.values(mirror.objects)[0]!.elevationMm).toBe(1000);
    const floor = place(base, 'living.armchair').doc;
    expect(Object.values(floor.objects)[0]!.elevationMm).toBe(0);
    const lamp = place(base, 'decor.pendant').doc;
    expect(Object.values(lamp.objects)[0]!.elevationMm).toBe(ceiling - 700);
  });

  it('plasare propusă: în cameră, decalată dacă locul e ocupat; obiectele de perete se lipesc de un perete cu fața spre interior', () => {
    const base = emptyStudio();
    const a = suggestPlacement(base, item('living.sofa-3'));
    const roomPts = [a.position];
    expect(a.wallId).toBeUndefined();
    const { doc } = place(base, 'living.sofa-3', a.position.x, a.position.y);
    const b = suggestPlacement(doc, item('living.sofa-3'));
    expect(b.position).not.toEqual(roomPts[0]);

    const m = suggestPlacement(base, item('decor.mirror'));
    expect(m.wallId).toBeDefined();
    // fața privește spre interior: punctul în fața obiectului e în interiorul camerei, cel din spate nu
    const rad = (m.rotationDeg * Math.PI) / 180;
    const front = { x: -Math.sin(rad), y: Math.cos(rad) };
    const geo = checkIntegrity(base).geometry;
    const poly = [...geo.rooms.values()][0]!.polygon;
    const inside = (p: { x: number; y: number }) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const pi = poly[i]!,
          pj = poly[j]!;
        if (
          pi.y > p.y !== pj.y > p.y &&
          p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x
        )
          c = !c;
      }
      return c;
    };
    const k = 300;
    expect(inside({ x: m.position.x + front.x * k, y: m.position.y + front.y * k })).toBe(true);
    expect(
      inside({ x: m.position.x - front.x * (k + 300), y: m.position.y - front.y * (k + 300) }),
    ).toBe(false);
    // fără camere: originea
    const empty = { ...emptyStudio(), rooms: {}, walls: {}, nodes: {} };
    expect(suggestPlacement(empty, item('living.sofa-3')).position).toEqual({ x: 0, y: 0 });
  });
});

describe('plasare automată pe mai multe obiecte', () => {
  it('obiecte succesive rămân în interiorul camerei și nu se suprapun', () => {
    let doc = emptyStudio();
    const room = [...checkIntegrity(doc).geometry.rooms.values()].sort((a, b) =>
      a.roomId < b.roomId ? -1 : 1,
    )[0]!;
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const g = ids();
    for (const id of [
      'living.armchair',
      'kitchen.chair',
      'bedroom.nightstand',
      'misc.stool',
      'decor.plant',
      'living.coffee-table',
      'misc.desk',
    ]) {
      const it = item(id);
      const p = suggestPlacement(doc, it);
      const r = addObject(doc, it, p, g);
      if (!r.ok) throw new Error(r.error);
      doc = r.value.doc;
    }
    const list = Object.values(doc.objects);
    expect(list).toHaveLength(7);
    for (const o of list) {
      expect(o.position.x - o.size.widthMm / 2).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(o.position.x + o.size.widthMm / 2).toBeLessThanOrEqual(Math.max(...xs));
      expect(o.position.y - o.size.depthMm / 2).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(o.position.y + o.size.depthMm / 2).toBeLessThanOrEqual(Math.max(...ys));
    }
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!,
          b = list[j]!;
        const overlap =
          Math.abs(a.position.x - b.position.x) < (a.size.widthMm + b.size.widthMm) / 2 &&
          Math.abs(a.position.y - b.position.y) < (a.size.depthMm + b.size.depthMm) / 2;
        expect(overlap, a.catalogItemId + ' × ' + b.catalogItemId).toBe(false);
      }
  });
});

describe('modificare, mutare, rotire, duplicare, ștergere', () => {
  const start = () => place(emptyStudio(), 'bedroom.wardrobe', 1000, 1000);

  it('mutare: poziție întreagă; rotire: normalizată în [0, 360)', () => {
    const { doc, objectId } = start();
    const moved = updateObject(doc, objectId, { position: { x: 1200, y: 800 } });
    expect(moved.ok && moved.value.objects[objectId]!.position).toEqual({ x: 1200, y: 800 });
    const r = (deg: number) => {
      const x = updateObject(doc, objectId, { rotationDeg: deg });
      return x.ok ? x.value.objects[objectId]!.rotationDeg : NaN;
    };
    expect(r(90)).toBe(90);
    expect(r(-90)).toBe(270);
    expect(r(450)).toBe(90);
    expect(r(360)).toBe(0);
    expect(r(-0.0001)).toBe(0);
    expect(updateObject(doc, objectId, { rotationDeg: NaN }).ok).toBe(false);
    expect(updateObject(doc, objectId, { position: { x: 0.5, y: 0 } }).ok).toBe(false);
  });

  it('dimensiuni și parametri se modifică doar în limite; o modificare respinsă nu schimbă documentul', () => {
    const { doc, objectId } = start();
    const ok = updateObject(doc, objectId, { size: { widthMm: 1400 }, params: { fronts: 3 } });
    expect(ok.ok && ok.value.objects[objectId]).toMatchObject({
      size: { widthMm: 1400 },
      params: { fronts: 3 },
    });
    const patches: ObjectPatch[] = [
      { size: { widthMm: 100 } },
      { size: { heightMm: 5000 } },
      { size: { depthMm: -5 } },
      { params: { fronts: 0 } },
      { params: { frontType: 'x' } },
      { params: { nope: true } },
      { colorHex: 'roșu' },
    ];
    for (const patch of patches) {
      const r = updateObject(doc, objectId, patch);
      expect(r.ok, JSON.stringify(patch)).toBe(false);
    }
    expect(doc.objects[objectId]!.size.widthMm).toBe(1000);
  });

  it('nume (gol = revine la catalog), culoare (null = implicită), fără modificări ⇒ același document', () => {
    const { doc, objectId } = start();
    const named = updateObject(doc, objectId, { name: '  Dulap hol  ' });
    expect(named.ok && named.value.objects[objectId]!.name).toBe('Dulap hol');
    const cleared = named.ok ? updateObject(named.value, objectId, { name: '' }) : named;
    expect(cleared.ok && 'name' in cleared.value.objects[objectId]!).toBe(false);
    const col = updateObject(doc, objectId, { colorHex: '#112233' });
    expect(col.ok && col.value.objects[objectId]!.colorHex).toBe('#112233');
    const reset = col.ok ? updateObject(col.value, objectId, { colorHex: null }) : col;
    expect(reset.ok && 'colorHex' in reset.value.objects[objectId]!).toBe(false);
    const same = updateObject(doc, objectId, { position: { ...doc.objects[objectId]!.position } });
    expect(same.ok && same.value).toBe(doc);
  });

  it('elevația: obiectele de podea rămân pe podea; cele de tavan urmăresc înălțimea; cele de perete se pot ridica', () => {
    const base = emptyStudio();
    const floor = place(base, 'living.armchair');
    expect(updateObject(floor.doc, floor.objectId, { elevationMm: 100 }).ok).toBe(false);
    const wall = place(base, 'decor.picture');
    const up = updateObject(wall.doc, wall.objectId, { elevationMm: 1500 });
    expect(up.ok && up.value.objects[wall.objectId]!.elevationMm).toBe(1500);
    expect(updateObject(wall.doc, wall.objectId, { elevationMm: -1 }).ok).toBe(false);
    const lamp = place(base, 'decor.pendant');
    const ceiling = base.levels[Object.keys(base.levels)[0]!]!.ceilingHeightMm;
    const taller = updateObject(lamp.doc, lamp.objectId, { size: { heightMm: 900 } });
    expect(taller.ok && taller.value.objects[lamp.objectId]!.elevationMm).toBe(ceiling - 900);
  });

  it('duplicare: copie decalată, ID nou, fără legătura de perete și fără suprascrierile de buget ale originalului', () => {
    const { doc, objectId } = start();
    const withOverride = {
      ...doc,
      budget: { ...doc.budget, overrides: { [`object:${objectId}`]: { unitPriceMinor: 12345 } } },
    } as ProjectDocument;
    const r = duplicateObject(withOverride, objectId, ids());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const copy = r.value.doc.objects[r.value.objectId]!;
    expect(r.value.objectId).not.toBe(objectId);
    expect(copy.position).toEqual({ x: 1300, y: 1300 });
    expect({ ...copy, id: '', position: { x: 0, y: 0 } }).toEqual({
      ...doc.objects[objectId]!,
      id: '',
      position: { x: 0, y: 0 },
    });
    expect(Object.keys(r.value.doc.budget.overrides)).toEqual([`object:${objectId}`]);
    expect(duplicateObject(doc, 'lipsa', ids()).ok).toBe(false);
  });

  it('ștergere: obiectul și suprascrierile lui de buget dispar în aceeași operație', () => {
    const { doc, objectId } = start();
    const withOverride = {
      ...doc,
      budget: { ...doc.budget, overrides: { [`object:${objectId}`]: { unitPriceMinor: 1 } } },
    } as ProjectDocument;
    const r = removeObject(withOverride, objectId);
    expect(r.ok && r.value.objects).toEqual({});
    expect(r.ok && r.value.budget.overrides).toEqual({});
    expect(removeObject(doc, 'lipsa').ok).toBe(false);
  });
});

describe('integritate, versiunea catalogului, import/export', () => {
  it('parametru invalid în document ⇒ eroare de integritate; cheie necunoscută ⇒ doar avertisment', () => {
    const { doc, objectId } = place(emptyStudio(), 'bedroom.wardrobe');
    const bad = JSON.parse(JSON.stringify(doc)) as ProjectDocument;
    bad.objects[objectId]!.params.fronts = 77;
    const rep = checkIntegrity(bad);
    expect(rep.valid).toBe(false);
    expect(rep.errors.map((e) => e.code)).toContain('object-param-invalid');
    const extra = JSON.parse(JSON.stringify(doc)) as ProjectDocument;
    extra.objects[objectId]!.params.nou = true;
    const r2 = checkIntegrity(extra);
    expect(r2.valid).toBe(true);
    expect(r2.warnings.map((w) => w.code)).toContain('object-param-unknown');
  });

  it('un item modificat în catalogul aplicației (v2) NU schimbă proiectul existent; obiectele noi folosesc copia din proiect', () => {
    const { doc, objectId } = place(emptyStudio(), 'living.sofa-3');
    const v2: CatalogItem = {
      ...item('living.sofa-3'),
      version: 2,
      defaultSize: { widthMm: 2500, depthMm: 1000, heightMm: 900 },
      defaultColorHex: '#ff0000',
    };
    const second = addObject(doc, v2, { position: { x: 3000, y: 2000 } }, ids());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.doc.catalogSnapshot.items['living.sofa-3']!.version).toBe(1);
    expect(second.value.doc.objects[second.value.objectId]!.size).toEqual({
      widthMm: 2100,
      depthMm: 950,
      heightMm: 850,
    });
    expect(second.value.doc.objects[objectId]).toEqual(doc.objects[objectId]);
  });

  it('export → import: obiectele, parametrii, snapshot-ul și scena (hash) se păstrează exact; fără catalogul aplicației', () => {
    let { doc } = place(emptyStudio(), 'living.sofa-corner', 1500, 2000);
    const r1 = addObject(
      doc,
      item('bath.vanity'),
      { position: { x: 3000, y: 1000 }, rotationDeg: 90, params: { fronts: 3 } },
      ids(),
    );
    if (!r1.ok) throw new Error(r1.error);
    doc = r1.value.doc;
    const text = exportProject(doc, META);
    const back = importProject(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.doc.objects).toEqual(doc.objects);
    expect(back.doc.catalogSnapshot.items).toEqual(doc.catalogSnapshot.items);
    expect(buildScene(back.doc).hash).toBe(buildScene(doc).hash);
    // fișierul nu conține instanțe sau geometrie Three
    expect(text).not.toMatch(/BufferGeometry|Float32Array|isMesh/);
  });

  it('documente existente (fără obiecte din catalogul nou / cu rețete interne ale testelor) rămân valide', () => {
    const studio = studioProject();
    expect(checkIntegrity(studio).valid).toBe(true);
    expect(importProject(exportProject(studio, META)).ok).toBe(true);
    expect(buildScene(studio).boxes.length).toBe(Object.keys(studio.objects).length);
  });
});

describe('scena: poziționare corectă pe podea și pentru obiecte suspendate', () => {
  it('centrul și dimensiunile în metri; Y = elevație + înălțime/2; rotația 3D = −θ; parametrii ajung în scenă', () => {
    const base = emptyStudio();
    const a = place(base, 'living.armchair', 1000, 2000);
    const b = addObject(
      a.doc,
      item('decor.mirror'),
      { position: { x: 500, y: 600 }, rotationDeg: 90 },
      ids(),
    );
    if (!b.ok) throw new Error(b.error);
    const scene = buildScene(b.value.doc);
    const chair = scene.boxes.find((x) => x.id === a.objectId)!;
    expect(chair.center).toEqual([1, 0.425, 2]); // pe podea: baza la 0 ⇒ centrul la h/2
    expect(chair.size).toEqual([0.85, 0.85, 0.85]);
    expect(chair.params).toEqual(defaultParams(item('living.armchair')));
    const mirror = scene.boxes.find((x) => x.id === b.value.objectId)!;
    expect(mirror.center[1]).toBeCloseTo(1 + 0.45, 9); // elevație 1000 + h/2
    expect(mirror.rotationY).toBeCloseTo(-Math.PI / 2, 9);
    expect(mirror.recipe).toEqual({ id: 'mirror', version: 1 });
  });

  it('o modificare de dimensiune sau parametru schimbă hash-ul scenei; aceeași stare ⇒ același hash', () => {
    const { doc, objectId } = place(emptyStudio(), 'bedroom.wardrobe');
    const h0 = buildScene(doc).hash;
    expect(buildScene(JSON.parse(JSON.stringify(doc))).hash).toBe(h0);
    const w = updateObject(doc, objectId, { size: { widthMm: 1200 } });
    const p = updateObject(doc, objectId, { params: { fronts: 3 } });
    expect(w.ok && buildScene(w.value).hash).not.toBe(h0);
    expect(p.ok && buildScene(p.value).hash).not.toBe(h0);
  });

  it('documente invalide: scena nu se construiește și arată motivele (obiect cu item lipsă)', () => {
    const { doc, objectId } = place(emptyStudio(), 'bedroom.wardrobe');
    const orphan = JSON.parse(JSON.stringify(doc)) as ProjectDocument;
    delete orphan.catalogSnapshot.items['bedroom.wardrobe'];
    // referința lipsă e prinsă de integritate; scena folosește o cutie de înlocuire (recipe null), nu aruncă
    expect(checkIntegrity(orphan).errors.map((e) => e.code)).toContain('catalog-item-missing');
    const box = buildScene(orphan).boxes.find((b) => b.id === objectId)!;
    expect(box.recipe).toBeNull();
    expect(updateObject(orphan, objectId, { size: { widthMm: 900 } }).ok).toBe(false);
  });
});
