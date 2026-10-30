import { describe, expect, it } from 'vitest';
import {
  addObject,
  applyFinish,
  applyFinishToRoomWalls,
  assignmentsOn,
  buildScene,
  checkIntegrity,
  clearFinish,
  computeBudget,
  duplicateObject,
  exportProject,
  finishParamRules,
  finishSurfaces,
  FinishSchema,
  importProject,
  incompatibility,
  lookProblems,
  ProjectDocumentSchema,
  remapIds,
  removeObject,
  resolveLook,
  roomWallTargets,
  updateAssignmentLook,
  type Finish,
  type FinishTarget,
  type ProjectDocument,
} from '@/domain';
import { BUILTIN_MATERIALS, getBuiltinMaterial } from '@/materials';
import { getBuiltinItem } from '@/catalog';
import { studioProject } from '../reference/projects';

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };
const mat = (id: string): Finish => getBuiltinMaterial(id)!;
let n = 0;
const genId = () => `g${++n}`;

/** Documentul de referință fără obiecte, finisaje și buget: două camere (rA, rB) cu pereți. */
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
function must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const wallsOf = (doc: ProjectDocument, roomId: string) => roomWallTargets(doc, roomId);

describe('definiția materialului (schema)', () => {
  it('materialele generice cer `surfaces` și unitatea de preț potrivită; cele cu piese cer `tile`/`paint`', () => {
    const concrete = mat('mat.concrete.polished');
    expect(FinishSchema.safeParse(concrete).success).toBe(true);
    expect(FinishSchema.safeParse({ ...concrete, surfaces: undefined }).success).toBe(false);
    expect(FinishSchema.safeParse({ ...concrete, priceUnit: 'piece' }).success).toBe(false);
    expect(
      FinishSchema.safeParse({
        ...concrete,
        tile: { pieceWidthMm: 1, pieceHeightMm: 1, groutMm: 0 },
      }).success,
    ).toBe(false);
    const furn = mat('mat.furn.mdf-white');
    expect(FinishSchema.safeParse({ ...furn, priceUnit: 'm2' }).success).toBe(false);
    const tile = mat('mat.tile.white');
    expect(FinishSchema.safeParse({ ...tile, tile: undefined }).success).toBe(false);
    const paint = mat('mat.paint.sage');
    expect(FinishSchema.safeParse({ ...paint, paint: undefined }).success).toBe(false);
  });

  it('opacitatea și metalicitatea sunt validate; modelele de textură necunoscute sunt respinse', () => {
    const glass = mat('mat.glass.clear');
    expect(
      FinishSchema.safeParse({ ...glass, appearance: { ...glass.appearance, opacity: 0 } }).success,
    ).toBe(false);
    expect(
      FinishSchema.safeParse({ ...glass, appearance: { ...glass.appearance, metalness: 2 } })
        .success,
    ).toBe(false);
    const wood = mat('mat.parquet.oak-light');
    const tex = wood.appearance.texture;
    expect(
      FinishSchema.safeParse({
        ...wood,
        appearance: { ...wood.appearance, texture: { ...tex, pattern: 'foto' } },
      }).success,
    ).toBe(false);
  });

  it('compatibilitatea cu suprafețele: explicită sau derivată din `kind` (documente vechi)', () => {
    expect(finishSurfaces(mat('mat.parquet.oak-light'))).toEqual(['floor']);
    expect(finishSurfaces(mat('mat.paint.sage'))).toEqual(['wall']);
    expect(finishSurfaces(mat('mat.wtile.metro'))).toEqual(['wall']);
    expect(finishSurfaces(mat('mat.tile.white'))).toEqual(['floor', 'wall']);
    expect(finishSurfaces(mat('mat.furn.metallic'))).toEqual(['object']);
    expect(finishSurfaces(mat('mat.wood.natural'))).toEqual(['wall', 'floor']);
    expect(
      incompatibility(mat('mat.parquet.oak-light'), {
        kind: 'wallSide',
        wallId: 'w1',
        side: 'left',
      }),
    ).toMatch(/nu se poate aplica pe perete/);
    expect(incompatibility(mat('mat.paint.sage'), floor('rA'))).toMatch(
      /compatibil doar cu: perete/,
    );
    expect(incompatibility(mat('mat.furn.mdf-grey'), floor('rA'))).not.toBeNull();
    expect(
      incompatibility(mat('mat.paint.sage'), { kind: 'wallSide', wallId: 'w1', side: 'left' }),
    ).toBeNull();
  });
});

describe('aplicare, înlocuire, modificare, eliminare', () => {
  it('aplică pe podea: copiază materialul în snapshot (o singură dată), creează atribuirea, documentul rămâne valid', () => {
    const base = clean();
    const r = must(applyFinish(base, mat('mat.parquet.oak-natural'), floor('rA'), genId));
    const a = r.doc.finishAssignments[r.assignmentId]!;
    expect(a).toMatchObject({
      target: floor('rA'),
      finishId: 'mat.parquet.oak-natural',
      wastePct: 10,
    });
    expect(a.look).toBeUndefined();
    expect(r.doc.catalogSnapshot.finishes['mat.parquet.oak-natural']).toEqual(
      mat('mat.parquet.oak-natural'),
    );
    expect(ProjectDocumentSchema.safeParse(r.doc).success).toBe(true);
    expect(checkIntegrity(r.doc).valid).toBe(true);
    expect(JSON.parse(JSON.stringify(r.doc))).toEqual(r.doc); // JSON pur
    expect(base.finishAssignments).toEqual({}); // originalul neatins
  });

  it('REUTILIZARE: același material în mai multe camere = o singură definiție în snapshot, atribuiri separate', () => {
    let doc = clean();
    doc = must(applyFinish(doc, mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    doc = must(applyFinish(doc, mat('mat.parquet.oak-light'), floor('rB'), genId)).doc;
    expect(Object.keys(doc.catalogSnapshot.finishes)).toEqual(['mat.parquet.oak-light']);
    expect(Object.values(doc.finishAssignments).map((a) => a.finishId)).toEqual([
      'mat.parquet.oak-light',
      'mat.parquet.oak-light',
    ]);
    // aplicările pot avea proprietăți diferite fără a duplica definiția
    const [a1, a2] = Object.values(doc.finishAssignments);
    doc = must(updateAssignmentLook(doc, a1!.id, { textureScale: 2 }));
    doc = must(updateAssignmentLook(doc, a2!.id, { textureRotationDeg: 90 }));
    expect(Object.keys(doc.catalogSnapshot.finishes)).toHaveLength(1);
    const scene = buildScene(doc);
    expect(Object.keys(scene.looks)).toHaveLength(2); // două aspecte (scară/rotație), un singur material
    expect(new Set(Object.values(scene.looks).map((l) => l.finishId)).size).toBe(1);
  });

  it('înlocuiește materialul de pe aceeași țintă (nu se cumulează) și curăță materialul rămas nefolosit', () => {
    let doc = clean();
    doc = must(applyFinish(doc, mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    doc = must(applyFinish(doc, mat('mat.tile.grey'), floor('rA'), genId)).doc;
    expect(assignmentsOn(doc, floor('rA'))).toHaveLength(1);
    expect(assignmentsOn(doc, floor('rA'))[0]!.finishId).toBe('mat.tile.grey');
    expect(Object.keys(doc.catalogSnapshot.finishes)).toEqual(['mat.tile.grey']);
    expect(checkIntegrity(doc).valid).toBe(true);
  });

  it('respinge material incompatibil, țintă inexistentă și valori invalide, cu mesaje în română', () => {
    const doc = clean();
    const err = (r: { ok: boolean; error?: string }) => (r.ok ? '' : r.error!);
    expect(err(applyFinish(doc, mat('mat.paint.sage'), floor('rA'), genId))).toMatch(
      /nu se poate aplica pe podea/,
    );
    expect(
      err(
        applyFinish(
          doc,
          mat('mat.parquet.dark'),
          { kind: 'wallSide', wallId: 'w1', side: 'left' },
          genId,
        ),
      ),
    ).toMatch(/nu se poate aplica pe perete/);
    expect(err(applyFinish(doc, mat('mat.parquet.dark'), floor('lipsa'), genId))).toMatch(
      /Camera nu mai există/,
    );
    expect(
      err(
        applyFinish(
          doc,
          mat('mat.paint.sage'),
          { kind: 'wallSide', wallId: 'nu', side: 'left' },
          genId,
        ),
      ),
    ).toMatch(/Peretele nu mai există/);
    expect(
      err(
        applyFinish(
          doc,
          mat('mat.furn.mdf-white'),
          { kind: 'objectSlot', objectId: 'nu', slot: 'body' },
          genId,
        ),
      ),
    ).toMatch(/Obiectul nu mai există/);
    expect(
      err(
        applyFinish(doc, mat('mat.parquet.dark'), floor('rA'), genId, {
          look: { textureScale: 9 },
        }),
      ),
    ).toMatch(/Scara texturii/);
    expect(
      err(applyFinish(doc, mat('mat.parquet.dark'), floor('rA'), genId, { wastePct: 150 })),
    ).toMatch(/Rebutul/);
    expect(doc.finishAssignments).toEqual({});
  });

  it('parametrii aplicării: validare (culoare, scară 0,25–4, rotație 0–359, rugozitate 0–1) și revenire la valorile materialului', () => {
    expect(lookProblems({ colorHex: 'rosu' })).toHaveLength(1);
    expect(lookProblems({ textureScale: 0.1 })).toHaveLength(1);
    expect(lookProblems({ textureScale: 4.5 })).toHaveLength(1);
    expect(lookProblems({ textureRotationDeg: 360 })).toHaveLength(1);
    expect(lookProblems({ textureRotationDeg: -1 })).toHaveLength(1);
    expect(lookProblems({ roughness: 1.2 })).toHaveLength(1);
    expect(
      lookProblems({
        colorHex: '#aabbcc',
        textureScale: 0.25,
        textureRotationDeg: 359,
        roughness: 0,
      }),
    ).toEqual([]);

    const r = must(applyFinish(clean(), mat('mat.paint.sage'), wallsOf(clean(), 'rA')[0]!, genId));
    let doc = r.doc;
    const id = r.assignmentId;
    doc = must(updateAssignmentLook(doc, id, { colorHex: '#112233', roughness: 0.4 }, 12));
    expect(doc.finishAssignments[id]).toMatchObject({
      wastePct: 12,
      look: { colorHex: '#112233', roughness: 0.4 },
    });
    expect(
      resolveLook(doc.catalogSnapshot.finishes['mat.paint.sage']!, doc.finishAssignments[id]!.look)
        .baseColorHex,
    ).toBe('#112233');
    expect(updateAssignmentLook(doc, id, { textureScale: 99 }).ok).toBe(false);
    expect(updateAssignmentLook(doc, 'lipsa', {}).ok).toBe(false);
    doc = must(updateAssignmentLook(doc, id, { colorHex: null, roughness: null }));
    expect(doc.finishAssignments[id]!.look).toBeUndefined();
    const same = must(updateAssignmentLook(doc, id, {}));
    expect(same).toBe(doc); // fără schimbări: același document
  });

  it('eliminare: șterge atribuirea, materialul nefolosit din snapshot și suprascrierea lui de buget, într-o singură operație', () => {
    const r = must(applyFinish(clean(), mat('mat.parquet.oak-light'), floor('rA'), genId));
    const withOv = {
      ...r.doc,
      budget: {
        ...r.doc.budget,
        overrides: { 'finish:mat.parquet.oak-light': { unitPriceMinor: 1 } },
      },
    } as ProjectDocument;
    const cleared = must(clearFinish(withOv, floor('rA')));
    expect(cleared.finishAssignments).toEqual({});
    expect(cleared.catalogSnapshot.finishes).toEqual({});
    expect(cleared.budget.overrides).toEqual({});
    expect(checkIntegrity(cleared).valid).toBe(true);
    expect(clearFinish(cleared, floor('rA')).ok).toBe(false);
    // o linie manuală legată de atribuire blochează eliminarea (nu se pierde nimic pe ascuns)
    const bound = {
      ...r.doc,
      budget: {
        ...r.doc.budget,
        manualLines: {
          m1: {
            id: 'm1',
            category: 'labor',
            description: 'Montaj',
            unit: 'm2',
            quantity: 1,
            unitPriceMinor: 1,
            vatBp: 2100,
            binding: { kind: 'assignmentArea', assignmentId: r.assignmentId },
          },
        },
      },
    } as unknown as ProjectDocument;
    expect(clearFinish(bound, floor('rA')).ok).toBe(false);
  });

  it('pereți: aceeași vopsea pe toate fețele unei camere, apoi un perete individual diferit', () => {
    let doc = clean();
    const faces = wallsOf(doc, 'rA');
    expect(faces).toHaveLength(4);
    doc = must(applyFinishToRoomWalls(doc, mat('mat.paint.beige'), 'rA', genId)).doc;
    expect(Object.values(doc.finishAssignments)).toHaveLength(4);
    doc = must(applyFinish(doc, mat('mat.wtile.metro'), faces[1]!, genId)).doc;
    const byFace = faces.map((f) => assignmentsOn(doc, f)[0]!.finishId);
    expect(byFace).toEqual([
      'mat.paint.beige',
      'mat.wtile.metro',
      'mat.paint.beige',
      'mat.paint.beige',
    ]);
    expect(Object.keys(doc.catalogSnapshot.finishes).sort()).toEqual([
      'mat.paint.beige',
      'mat.wtile.metro',
    ]);
    expect(checkIntegrity(doc).valid).toBe(true);
    expect(applyFinishToRoomWalls(doc, mat('mat.parquet.dark'), 'rA', genId).ok).toBe(false); // incompatibil
    expect(applyFinishToRoomWalls(doc, mat('mat.paint.beige'), 'nu-exista', genId).ok).toBe(false);
  });
});

describe('mobilier: finisaje pe zone', () => {
  function withWardrobe(): { doc: ProjectDocument; id: string } {
    const r = must(
      addObject(
        clean(),
        getBuiltinItem('bedroom.wardrobe')!,
        { position: { x: 1500, y: 1500 } },
        genId,
      ),
    );
    return { doc: r.doc, id: r.objectId };
  }
  it('aplică pe corp și fronturi cu materiale diferite; zona se înlocuiește, nu se dublează', () => {
    const w = withWardrobe();
    let doc = w.doc;
    const id = w.id;
    doc = must(
      applyFinish(
        doc,
        mat('mat.furn.mdf-white'),
        { kind: 'objectSlot', objectId: id, slot: 'body' },
        genId,
      ),
    ).doc;
    doc = must(
      applyFinish(
        doc,
        mat('mat.furn.wood-dark'),
        { kind: 'objectSlot', objectId: id, slot: 'front' },
        genId,
      ),
    ).doc;
    doc = must(
      applyFinish(
        doc,
        mat('mat.furn.gloss-white'),
        { kind: 'objectSlot', objectId: id, slot: 'body' },
        genId,
      ),
    ).doc;
    expect(Object.values(doc.finishAssignments)).toHaveLength(2);
    expect(
      assignmentsOn(doc, { kind: 'objectSlot', objectId: id, slot: 'body' })[0]!.finishId,
    ).toBe('mat.furn.gloss-white');
    expect(doc.finishAssignments[Object.keys(doc.finishAssignments)[0]!]!.wastePct).toBe(0);
    expect(checkIntegrity(doc).valid).toBe(true);
    // materialele de pardoseală nu se pot pune pe mobilier
    expect(
      applyFinish(
        doc,
        mat('mat.parquet.dark'),
        { kind: 'objectSlot', objectId: id, slot: 'body' },
        genId,
      ).ok,
    ).toBe(false);
  });

  it('duplicarea obiectului copiază finisajele; ștergerea lor le șterge (și curăță materialul din snapshot)', () => {
    const w = withWardrobe();
    let doc = w.doc;
    const id = w.id;
    doc = must(
      applyFinish(
        doc,
        mat('mat.furn.matte-black'),
        { kind: 'objectSlot', objectId: id, slot: 'body' },
        genId,
      ),
    ).doc;
    const dup = must(duplicateObject(doc, id, genId));
    expect(Object.values(dup.doc.finishAssignments)).toHaveLength(2);
    const onCopy = assignmentsOn(dup.doc, {
      kind: 'objectSlot',
      objectId: dup.objectId,
      slot: 'body',
    });
    expect(onCopy).toHaveLength(1);
    expect(onCopy[0]!.finishId).toBe('mat.furn.matte-black');
    expect(checkIntegrity(dup.doc).valid).toBe(true);

    const gone = must(removeObject(dup.doc, id));
    expect(Object.values(gone.finishAssignments)).toHaveLength(1); // rămâne doar cea a copiei
    const none = must(removeObject(gone, dup.objectId));
    expect(none.finishAssignments).toEqual({});
    expect(none.catalogSnapshot.finishes).toEqual({});
    expect(checkIntegrity(none).valid).toBe(true);
  });
});

describe('integritate și documente invalide', () => {
  it('atribuire incompatibilă, zonă dublă, obiect lipsă, material lipsă ⇒ erori cu cod', () => {
    const base = must(applyFinish(clean(), mat('mat.parquet.oak-light'), floor('rA'), genId));
    const codes = (d: ProjectDocument) => checkIntegrity(d).errors.map((e) => e.code);
    const bad = JSON.parse(JSON.stringify(base.doc)) as ProjectDocument;
    // parchet pe perete
    bad.finishAssignments[base.assignmentId]!.target = {
      kind: 'wallSide',
      wallId: 'w1',
      side: 'left',
    };
    expect(codes(bad)).toContain('finish-incompatible');
    // zonă de obiect inexistent
    const orphan = JSON.parse(JSON.stringify(clean())) as ProjectDocument;
    orphan.catalogSnapshot.finishes['mat.furn.mdf-white'] = mat('mat.furn.mdf-white');
    orphan.finishAssignments.z1 = {
      id: 'z1',
      target: { kind: 'objectSlot', objectId: 'nu', slot: 'body' },
      finishId: 'mat.furn.mdf-white',
      wastePct: 0,
    };
    expect(codes(orphan)).toContain('assignment-object-missing');
    // două aplicări pe aceeași zonă
    const { doc, id } = (() => {
      const r = must(
        addObject(
          clean(),
          getBuiltinItem('bedroom.nightstand')!,
          { position: { x: 1000, y: 1000 } },
          genId,
        ),
      );
      return { doc: r.doc, id: r.objectId };
    })();
    const twice = JSON.parse(JSON.stringify(doc)) as ProjectDocument;
    twice.catalogSnapshot.finishes['mat.furn.mdf-white'] = mat('mat.furn.mdf-white');
    for (const k of ['a', 'b'])
      twice.finishAssignments[k] = {
        id: k,
        target: { kind: 'objectSlot', objectId: id, slot: 'body' },
        finishId: 'mat.furn.mdf-white',
        wastePct: 0,
      };
    expect(codes(twice)).toContain('object-slot-assigned-twice');
    // material lipsă din snapshot
    const missing = JSON.parse(JSON.stringify(base.doc)) as ProjectDocument;
    delete missing.catalogSnapshot.finishes['mat.parquet.oak-light'];
    expect(codes(missing)).toContain('finish-missing');
    expect(() => buildScene(missing)).not.toThrow(); // scena nu cade: suprafața rămâne cu culoarea implicită
    expect(buildScene(missing).floors[0]!.look).toBeNull();
    expect(() => computeBudget(missing)).toThrow();
  });

  it('parametrii fără efect pe un material uniform sunt doar avertisment; schema respinge valori în afara intervalului', () => {
    const r = must(applyFinish(clean(), mat('mat.paint.sage'), wallsOf(clean(), 'rA')[0]!, genId));
    const odd = JSON.parse(JSON.stringify(r.doc)) as ProjectDocument;
    odd.finishAssignments[r.assignmentId]!.look = { textureScale: 2 };
    const rep = checkIntegrity(odd);
    expect(rep.valid).toBe(true);
    expect(rep.warnings.map((w) => w.code)).toContain('finish-look-unused');
    odd.finishAssignments[r.assignmentId]!.look = { textureScale: 99 };
    expect(ProjectDocumentSchema.safeParse(odd).success).toBe(false);
  });

  it('regulile de parametri relevanți: doar ce are sens pentru material', () => {
    expect(finishParamRules(mat('mat.paint.sage'))).toEqual({
      color: true,
      textureScale: false,
      textureRotation: false,
      roughness: true,
      waste: true,
    });
    expect(finishParamRules(mat('mat.parquet.oak-light'))).toEqual({
      color: false,
      textureScale: true,
      textureRotation: true,
      roughness: false,
      waste: true,
    });
    expect(finishParamRules(mat('mat.glass.clear')).color).toBe(false);
    const furn = finishParamRules(mat('mat.furn.wood-natural'));
    expect(furn).toEqual({
      color: true,
      textureScale: false,
      textureRotation: false,
      roughness: true,
      waste: false,
    });
    expect(finishParamRules(mat('mat.metal.chrome')).roughness).toBe(true);
    expect(finishParamRules(mat('mat.tile.white')).waste).toBe(true);
  });
});

describe('buget: suprafețe din domeniu, fără costuri duplicate', () => {
  const area = (doc: ProjectDocument, finishId: string) =>
    computeBudget(doc).lines.find((l) => l.key === `finish:${finishId}`)!;

  it('cantitatea vine din aria camerei (11,31 m² + rebut 10% ⇒ 12,45 m²); costul = cantitate × preț demonstrativ', () => {
    const doc = must(applyFinish(clean(), mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    const line = area(doc, 'mat.parquet.oak-light');
    expect(line.unit).toBe('m2');
    expect(line.effective.quantity).toBeCloseTo(12.45, 2); // 11,31 × 1,10 = 12,441 → ↑ 12,45
    expect(line.effective.unitPriceMinor).toBe(14500);
    expect(line.category).toBe('flooring');
    expect(line.priceSource).toBe('demo');
    expect(line.trace.length).toBeGreaterThan(2);
  });

  it('același material în două camere = O linie cu suma ariilor (nu două linii, nu rotunjire dublă); alocare pe camere', () => {
    let doc = clean();
    doc = must(applyFinish(doc, mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    doc = must(applyFinish(doc, mat('mat.parquet.oak-light'), floor('rB'), genId)).doc;
    const lines = computeBudget(doc).lines.filter((l) => l.key.startsWith('finish:'));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.effective.quantity).toBeCloseTo((11.31 + 8.41) * 1.1, 1);
    expect(Object.keys(lines[0]!.byRoom).sort()).toEqual(['rA', 'rB']);
    const sum = Object.values(lines[0]!.byRoom).reduce((a, t) => a + t.grossMinor, 0);
    expect(sum).toBe(lines[0]!.totals.grossMinor); // alocarea e exactă
  });

  it('o suprafață nu se taxează de două ori: înlocuirea nu adaugă o linie; eliminarea scoate costul', () => {
    let doc = must(applyFinish(clean(), mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    const total1 = computeBudget(doc).subtotal.grossMinor;
    doc = must(applyFinish(doc, mat('mat.parquet.oak-light'), floor('rA'), genId)).doc; // aceeași țintă, din nou
    expect(computeBudget(doc).subtotal.grossMinor).toBe(total1);
    expect(computeBudget(doc).lines.filter((l) => l.key.startsWith('finish:'))).toHaveLength(1);
    doc = must(applyFinish(doc, mat('mat.tile.grey'), floor('rA'), genId)).doc;
    const keys = computeBudget(doc).lines.map((l) => l.key);
    expect(keys).toContain('finish:mat.tile.grey');
    expect(keys).not.toContain('finish:mat.parquet.oak-light');
    doc = must(clearFinish(doc, floor('rA')));
    expect(computeBudget(doc).lines).toHaveLength(0);
    expect(computeBudget(doc).subtotal.grossMinor).toBe(0);
  });

  it('vopseaua pe pereți: aria netă a fețelor minus goluri, doze întregi; categorie „paint”', () => {
    const doc = must(applyFinishToRoomWalls(clean(), mat('mat.paint.sage'), 'rA', genId)).doc;
    const line = area(doc, 'mat.paint.sage');
    expect(line.unit).toBe('doza');
    expect(Number.isInteger(line.effective.quantity)).toBe(true);
    expect(line.category).toBe('paint');
    expect(line.effective.unitPriceMinor).toBe(26000);
  });

  it('materialul generic pe pereți ⇒ categoria „wall_finish”; pe podea ⇒ „flooring”', () => {
    const w = must(applyFinishToRoomWalls(clean(), mat('mat.concrete.exposed'), 'rA', genId)).doc;
    expect(area(w, 'mat.concrete.exposed').category).toBe('wall_finish');
    const f = must(applyFinish(clean(), mat('mat.concrete.polished'), floor('rA'), genId)).doc;
    expect(area(f, 'mat.concrete.polished').category).toBe('flooring');
    // gresia pe pereți se încadrează la finisaje de pereți
    const t = must(applyFinishToRoomWalls(clean(), mat('mat.tile.white'), 'rA', genId)).doc;
    expect(area(t, 'mat.tile.white').category).toBe('wall_finish');
  });

  it('mobilier: o bucată per zonă finisată (supliment), pe camera obiectului, separat de prețul obiectului', () => {
    let doc = must(
      addObject(
        clean(),
        getBuiltinItem('bedroom.wardrobe')!,
        { position: { x: 1500, y: 1500 } },
        genId,
      ),
    );
    const id = doc.objectId;
    let d = doc.doc;
    d = must(
      applyFinish(
        d,
        mat('mat.furn.gloss-white'),
        { kind: 'objectSlot', objectId: id, slot: 'body' },
        genId,
      ),
    ).doc;
    d = must(
      applyFinish(
        d,
        mat('mat.furn.gloss-white'),
        { kind: 'objectSlot', objectId: id, slot: 'front' },
        genId,
      ),
    ).doc;
    const b = computeBudget(d);
    const objectLine = b.lines.find((l) => l.key === `object:${id}`)!;
    const fin = b.lines.find((l) => l.key === 'finish:mat.furn.gloss-white')!;
    expect(fin.unit).toBe('buc');
    expect(fin.effective.quantity).toBe(2); // două zone, un material ⇒ o linie
    expect(fin.category).toBe('furniture');
    expect(fin.description).toMatch(/supliment/);
    expect(Object.keys(fin.byRoom)).toEqual(['rA']);
    // prețul obiectului nu se modifică de finisaje
    expect(objectLine.effective.unitPriceMinor).toBe(
      getBuiltinItem('bedroom.wardrobe')!.reference!.priceMinor,
    );
    expect(b.subtotal.grossMinor).toBe(objectLine.totals.grossMinor + fin.totals.grossMinor);
    doc = { ...doc, doc: d };
  });

  it('manopera rămâne separată (linii manuale): materialele aplicate nu adaugă manoperă; legarea la arie nu dublează materialul', () => {
    let doc = must(applyFinish(clean(), mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    const before = computeBudget(doc).subtotal.grossMinor;
    const asg = Object.keys(doc.finishAssignments)[0]!;
    doc = {
      ...doc,
      budget: {
        ...doc.budget,
        manualLines: {
          m1: {
            id: 'm1',
            category: 'labor',
            description: 'Montaj parchet',
            unit: 'm2',
            quantity: 1,
            unitPriceMinor: 3000,
            vatBp: 2100,
            binding: { kind: 'assignmentArea', assignmentId: asg },
          },
        },
      },
    } as unknown as ProjectDocument;
    const b = computeBudget(doc);
    const labor = b.lines.find((l) => l.key === 'manual:m1')!;
    expect(labor.category).toBe('labor');
    expect(labor.effective.quantity).toBeCloseTo(11.31, 2); // aria netă fără rebut a aceleiași atribuiri
    expect(b.lines.find((l) => l.key === 'finish:mat.parquet.oak-light')!.totals.grossMinor).toBe(
      computeBudget(
        must(applyFinish(clean(), mat('mat.parquet.oak-light'), floor('rA'), genId)).doc,
      ).lines[0]!.totals.grossMinor,
    );
    expect(b.subtotal.grossMinor).toBe(before + labor.totals.grossMinor);
  });

  it('documente cu atribuiri vechi (finisaje din reference) se calculează ca înainte', () => {
    const studio = studioProject();
    const b = computeBudget(studio);
    expect(b.lines.filter((l) => l.key.startsWith('finish:')).length).toBeGreaterThan(0);
  });
});

describe('scena: aspecte pe fețe, benzi, reutilizare', () => {
  it('pereții primesc aspectul pe fața aleasă; fața neaplicată rămâne implicită; podeaua primește aspectul ei', () => {
    let doc = clean();
    const face = wallsOf(doc, 'rA')[0]! as Extract<FinishTarget, { kind: 'wallSide' }>;
    doc = must(applyFinish(doc, mat('mat.paint.sage'), face, genId)).doc;
    doc = must(applyFinish(doc, mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    const scene = buildScene(doc);
    const prisms = scene.prisms.filter((p) => p.wallId === face.wallId);
    for (const p of prisms) {
      expect(face.side === 'left' ? p.left : p.right).not.toBeNull();
      expect(face.side === 'left' ? p.right : p.left).toBeNull();
    }
    const key = (face.side === 'left' ? prisms[0]!.left : prisms[0]!.right)!;
    expect(scene.looks[key]).toMatchObject({
      finishId: 'mat.paint.sage',
      baseColorHex: '#9bae97',
      texture: null,
    });
    const fl = scene.floors.find((f) => f.roomId === 'rA')!;
    expect(fl.look).not.toBeNull();
    expect(scene.looks[fl.look!]!.texture).toMatchObject({
      pattern: 'plank',
      scale: 1,
      rotationDeg: 0,
    });
    expect(scene.floors.find((f) => f.roomId === 'rB')!.look).toBeNull();
  });

  it('benzile de înălțime taie prismele la margini (faianță jos, vopsea sus) fără să schimbe volumul', () => {
    const base = clean();
    const face = wallsOf(base, 'rA')[2]! as Extract<FinishTarget, { kind: 'wallSide' }>;
    const withBands = JSON.parse(JSON.stringify(base)) as ProjectDocument;
    withBands.catalogSnapshot.finishes['mat.wtile.metro'] = mat('mat.wtile.metro');
    withBands.catalogSnapshot.finishes['mat.paint.sage'] = mat('mat.paint.sage');
    withBands.finishAssignments.b1 = {
      id: 'b1',
      target: face,
      finishId: 'mat.wtile.metro',
      wastePct: 5,
      fromHeightMm: 0,
      coveredHeightMm: 1200,
    };
    withBands.finishAssignments.b2 = {
      id: 'b2',
      target: face,
      finishId: 'mat.paint.sage',
      wastePct: 5,
      fromHeightMm: 1200,
    };
    expect(checkIntegrity(withBands).valid).toBe(true);
    const plain = buildScene(base).prisms.filter((p) => p.wallId === face.wallId);
    const cut = buildScene(withBands).prisms.filter((p) => p.wallId === face.wallId);
    expect(cut.length).toBeGreaterThan(plain.length);
    const sideKey = face.side;
    const lower = cut.filter((p) => p.y1 <= 1200);
    const upper = cut.filter((p) => p.y0 >= 1200);
    expect(lower.length).toBeGreaterThan(0);
    expect(upper.length).toBeGreaterThan(0);
    const looks = buildScene(withBands).looks;
    for (const p of lower)
      expect(looks[(sideKey === 'left' ? p.left : p.right)!]!.finishId).toBe('mat.wtile.metro');
    for (const p of upper)
      expect(looks[(sideKey === 'left' ? p.left : p.right)!]!.finishId).toBe('mat.paint.sage');
    const vol = (ps: typeof plain) => ps.reduce((a, p) => a + (p.y1 - p.y0), 0);
    expect(vol(cut)).toBe(vol(plain)); // aceeași acoperire verticală
  });

  it('aspecte: cheie după CONȚINUT (același material și aceiași parametri = aceeași cheie, o singură intrare); scena se actualizează la modificare', () => {
    let doc = clean();
    const faces = wallsOf(doc, 'rA');
    doc = must(applyFinishToRoomWalls(doc, mat('mat.paint.blue'), 'rA', genId)).doc;
    expect(Object.keys(buildScene(doc).looks)).toHaveLength(1); // 4 fețe, un aspect
    const h0 = buildScene(doc).hash;
    const a = assignmentsOn(doc, faces[0]!)[0]!;
    doc = must(updateAssignmentLook(doc, a.id, { colorHex: '#ff0000' }));
    const s1 = buildScene(doc);
    expect(s1.hash).not.toBe(h0);
    expect(Object.keys(s1.looks)).toHaveLength(2);
    doc = must(updateAssignmentLook(doc, a.id, { colorHex: null }));
    expect(buildScene(doc).hash).toBe(h0); // revenire exactă
  });

  it('zonele obiectelor apar în scenă cu aspect (culoare, rugozitate, metalicitate)', () => {
    const r = must(
      addObject(
        clean(),
        getBuiltinItem('misc.storage')!,
        { position: { x: 1500, y: 1500 } },
        genId,
      ),
    );
    const doc = must(
      applyFinish(
        r.doc,
        mat('mat.furn.metallic'),
        { kind: 'objectSlot', objectId: r.objectId, slot: 'front' },
        genId,
      ),
    ).doc;
    const scene = buildScene(doc);
    const box = scene.boxes[0]!;
    expect(Object.keys(box.slots)).toEqual(['front']);
    expect(scene.looks[box.slots.front!]).toMatchObject({
      baseColorHex: '#b4b8bd',
      metalness: 0.9,
    });
  });
});

describe('import/export și compatibilitate', () => {
  it('export → import păstrează definițiile, atribuirile (inclusiv zone de obiect) și scena (hash), fără catalogul aplicației', () => {
    let doc = clean();
    doc = must(
      applyFinish(doc, mat('mat.parquet.dark'), floor('rA'), genId, {
        look: { textureScale: 1.5, textureRotationDeg: 90 },
      }),
    ).doc;
    doc = must(applyFinishToRoomWalls(doc, mat('mat.paint.sage'), 'rA', genId)).doc;
    const o = must(
      addObject(doc, getBuiltinItem('bedroom.dresser')!, { position: { x: 1500, y: 1500 } }, genId),
    );
    doc = must(
      applyFinish(
        o.doc,
        mat('mat.furn.wood-natural'),
        { kind: 'objectSlot', objectId: o.objectId, slot: 'body' },
        genId,
      ),
    ).doc;
    const text = exportProject(doc, META);
    const back = importProject(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.doc.finishAssignments).toEqual(doc.finishAssignments);
    expect(back.doc.catalogSnapshot.finishes).toEqual(doc.catalogSnapshot.finishes);
    expect(buildScene(back.doc).hash).toBe(buildScene(doc).hash);
    expect(text).not.toMatch(/MeshStandardMaterial|DataTexture|Float32Array/);
    // proiectul se redeschide complet și dacă materialul din catalogul aplicației s-ar schimba: snapshot-ul decide
    expect(computeBudget(back.doc).total.grossMinor).toBe(computeBudget(doc).total.grossMinor);
  });

  it('remapIds rescrie și zonele de obiect (obiectul din țintă urmează noul ID)', () => {
    const o = must(
      addObject(clean(), getBuiltinItem('misc.desk')!, { position: { x: 1500, y: 1500 } }, genId),
    );
    const doc = must(
      applyFinish(
        o.doc,
        mat('mat.furn.mdf-grey'),
        { kind: 'objectSlot', objectId: o.objectId, slot: 'body' },
        genId,
      ),
    ).doc;
    let k = 0;
    const re = remapIds(doc, () => `r${++k}`);
    const newObj = Object.keys(re.objects)[0]!;
    expect(newObj).not.toBe(o.objectId);
    const a = Object.values(re.finishAssignments)[0]!;
    expect(a.target).toEqual({ kind: 'objectSlot', objectId: newObj, slot: 'body' });
    expect(checkIntegrity(re).valid).toBe(true);
  });

  it('un material din catalog modificat ulterior (v2) NU schimbă proiectul existent; obiectele/zonele noi folosesc copia din proiect', () => {
    const doc = must(applyFinish(clean(), mat('mat.parquet.oak-light'), floor('rA'), genId)).doc;
    const v2: Finish = {
      ...mat('mat.parquet.oak-light'),
      version: 2,
      unitPriceMinor: 999900,
      appearance: { ...mat('mat.parquet.oak-light').appearance, baseColorHex: '#ff00ff' },
    };
    const next = must(applyFinish(doc, v2, floor('rB'), genId)).doc;
    expect(next.catalogSnapshot.finishes['mat.parquet.oak-light']!.version).toBe(1);
    expect(next.catalogSnapshot.finishes['mat.parquet.oak-light']!.unitPriceMinor).toBe(14500);
    expect(buildScene(next).floors.find((f) => f.roomId === 'rB')!.colorHex).toBe(
      mat('mat.parquet.oak-light').appearance.baseColorHex,
    );
    // materialul eliminat din catalog: proiectul își păstrează definiția
    expect(computeBudget(doc).lines).toHaveLength(1);
    expect(BUILTIN_MATERIALS.length).toBeGreaterThan(30);
  });

  it('documentele existente (fără câmpurile noi) se validează neschimbat: nicio migrare, aceeași versiune de schemă', () => {
    const studio = studioProject();
    expect(studio.schemaVersion).toBe(1);
    expect(ProjectDocumentSchema.safeParse(studio).success).toBe(true);
    const text = exportProject(studio, META);
    const back = importProject(text);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.doc).toEqual(studio);
  });
});
