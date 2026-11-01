// Etapa 7a: plasarea și mutarea camerelor (lipire de grilă și de pereții existenți, mutare cu tot cu obiecte).
import { describe, expect, it } from 'vitest';
import { BUILTIN_ITEMS } from '@/catalog';
import {
  addObject,
  addRectRoom,
  analyzeGeometry,
  createEmptyProject,
  moveRoom,
  snapRoomAnchor,
  type ProjectDocument,
} from '@/domain';

let n = 0;
const gen = () => `r${++n}`;
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
function oneRoom(): { doc: ProjectDocument; roomId: string } {
  const empty = createEmptyProject('p1', 'T', '2026-11-01T00:00:00.000Z');
  const r = unwrap(
    addRectRoom(empty, { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } }, gen),
  );
  return { doc: r.doc, roomId: r.roomId };
}

describe('snapRoomAnchor', () => {
  it('fără vecini: doar grila (colțul interior)', () => {
    const { doc } = oneRoom();
    const s = snapRoomAnchor(
      doc,
      { widthMm: 2000, depthMm: 2000 },
      { x: 20000, y: 20000 },
      100,
      150,
    );
    expect(s).toEqual({ anchor: { x: 20000, y: 20000 }, snappedX: false, snappedY: false });
    const g = snapRoomAnchor(
      doc,
      { widthMm: 2000, depthMm: 2000 },
      { x: 20049, y: 20051 },
      100,
      150,
    );
    expect(g.anchor).toEqual({ x: 20000, y: 20100 });
  });

  it('aproape de o cameră: se alipește cu fața exterioară și se aliniază pe cealaltă axă; rezultatul e valid', () => {
    const { doc } = oneRoom();
    const t = doc.settings.defaultWallThicknessMm;
    // camera A are fața exterioară dreaptă la x = 4000 + t; camera nouă (stânga ei exterioară = ax − t) se alipește
    const s = snapRoomAnchor(
      doc,
      { widthMm: 2000, depthMm: 3000 },
      { x: 4000 + 2 * t + 60, y: 40 },
      10,
      150,
    );
    expect(s.snappedX).toBe(true);
    expect(s.anchor.x).toBe(4000 + 2 * t); // stânga exterioară nouă = dreapta exterioară veche
    expect(s.snappedY).toBe(true);
    expect(s.anchor.y).toBe(0); // aliniată cu A
    const r = unwrap(addRectRoom(doc, { widthMm: 2000, depthMm: 3000, anchor: s.anchor }, gen));
    expect(analyzeGeometry(r.doc).issues).toEqual([]);
  });

  it('nu se lipește de fața INTERIOARĂ a peretelui vecin (ar suprapune peretele): cu fața pe jumătate în perete, alege fața exterioară', () => {
    const { doc } = oneRoom();
    const t = doc.settings.defaultWallThicknessMm;
    // stânga exterioară a camerei noi cade la mijlocul peretelui din dreapta al camerei A (4000 … 4000 + t)
    const raw = { x: 4000 + t / 2 + t, y: 0 };
    const s = snapRoomAnchor(doc, { widthMm: 2000, depthMm: 3000 }, raw, 10, 400);
    expect(s.snappedX).toBe(true);
    expect(s.anchor.x).toBe(4000 + 2 * t); // fața exterioară a lui A, nu cea interioară (4000 + t)
    const r = unwrap(addRectRoom(doc, { widthMm: 2000, depthMm: 3000, anchor: s.anchor }, gen));
    expect(analyzeGeometry(r.doc).issues).toEqual([]);
  });

  it('departe de orice față: nu se lipește', () => {
    const { doc } = oneRoom();
    const s = snapRoomAnchor(doc, { widthMm: 2000, depthMm: 2000 }, { x: 9000, y: 9000 }, 100, 150);
    expect(s.snappedX || s.snappedY).toBe(false);
  });
});

describe('moveRoom', () => {
  it('mută nodurile camerei; geometria rămâne validă și aria nu se schimbă', () => {
    const { doc, roomId } = oneRoom();
    const before = analyzeGeometry(doc).rooms.get(roomId)!;
    const moved = unwrap(moveRoom(doc, roomId, { x: 1200, y: -800 }));
    const after = analyzeGeometry(moved);
    expect(after.issues).toEqual([]);
    expect(after.rooms.get(roomId)!.areaMm2).toBe(before.areaMm2);
    const some = doc.rooms[roomId]!.nodeLoop[0]!;
    expect(moved.nodes[some]!.x).toBe(doc.nodes[some]!.x + 1200);
    expect(moved.nodes[some]!.y).toBe(doc.nodes[some]!.y - 800);
  });

  it('mută și obiectele din interior, dar nu pe cele din afară', () => {
    const { doc: base, roomId } = oneRoom();
    const sofa = BUILTIN_ITEMS.find((i) => i.id === 'living.sofa-3')!;
    const inside = unwrap(addObject(base, sofa, { position: { x: 2000, y: 1500 } }, gen));
    const outside = unwrap(addObject(inside.doc, sofa, { position: { x: 9000, y: 9000 } }, gen));
    const delta = { x: 500, y: 300 };
    const moved = unwrap(moveRoom(outside.doc, roomId, delta));
    expect(moved.objects[inside.objectId]!.position).toEqual({ x: 2500, y: 1800 });
    expect(moved.objects[outside.objectId]!.position).toEqual({ x: 9000, y: 9000 });
  });

  it('refuză deplasări zecimale, camere inexistente; fără deplasare întoarce documentul', () => {
    const { doc, roomId } = oneRoom();
    expect(moveRoom(doc, roomId, { x: 0.5, y: 0 }).ok).toBe(false);
    expect(moveRoom(doc, 'lipsa', { x: 1, y: 1 }).ok).toBe(false);
    const same = unwrap(moveRoom(doc, roomId, { x: 0, y: 0 }));
    expect(same).toBe(doc);
  });

  it('refuză o cameră care împarte noduri cu alta', () => {
    const { doc, roomId } = oneRoom();
    const other = unwrap(
      addRectRoom(doc, { widthMm: 1000, depthMm: 1000, anchor: { x: 9000, y: 0 } }, gen),
    );
    // a doua cameră folosește un nod al primei: se "lipesc" prin bucla de noduri
    const shared = structuredClone(other.doc);
    shared.rooms[other.roomId]!.nodeLoop[0] = doc.rooms[roomId]!.nodeLoop[0]!;
    expect(moveRoom(shared, roomId, { x: 100, y: 0 }).ok).toBe(false);
  });
});
