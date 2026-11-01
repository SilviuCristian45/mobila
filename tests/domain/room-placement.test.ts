// Etapa 7a: plasarea și mutarea camerelor (lipire de grilă și de pereții existenți, mutare cu tot cu obiecte).
import { describe, expect, it } from 'vitest';
import { BUILTIN_ITEMS } from '@/catalog';
import {
  addObject,
  addRectRoom,
  analyzeGeometry,
  createEmptyProject,
  moveRoom,
  rectInteriorSize,
  resizeRoomSide,
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

describe('resizeRoomSide', () => {
  const size = (doc: ProjectDocument, id: string) => {
    const r = rectInteriorSize(doc, id);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('fiecare latură: dimensiunea interioară devine cea cerută, latura opusă rămâne fixă, geometria rămâne validă', () => {
    const { doc, roomId } = oneRoom();
    const nodes = (d: ProjectDocument) => d.rooms[roomId]!.nodeLoop.map((n) => d.nodes[n]!);
    const b = nodes(doc);
    const [minX, maxX] = [Math.min(...b.map((n) => n.x)), Math.max(...b.map((n) => n.x))];
    const [minY, maxY] = [Math.min(...b.map((n) => n.y)), Math.max(...b.map((n) => n.y))];
    const e = unwrap(resizeRoomSide(doc, roomId, 'e', 5000));
    expect(size(e, roomId)).toEqual({ widthMm: 5000, depthMm: 3000 });
    expect(Math.min(...nodes(e).map((n) => n.x))).toBe(minX);
    const w = unwrap(resizeRoomSide(doc, roomId, 'w', 5000));
    expect(size(w, roomId).widthMm).toBe(5000);
    expect(Math.max(...nodes(w).map((n) => n.x))).toBe(maxX);
    const s = unwrap(resizeRoomSide(doc, roomId, 's', 2500));
    expect(size(s, roomId).depthMm).toBe(2500);
    expect(Math.min(...nodes(s).map((n) => n.y))).toBe(minY);
    const n = unwrap(resizeRoomSide(doc, roomId, 'n', 2500));
    expect(Math.max(...nodes(n).map((p) => p.y))).toBe(maxY);
    for (const d of [e, w, s, n]) expect(analyzeGeometry(d).issues).toEqual([]);
  });

  it('refuză dimensiuni sub minim sau zecimale; documentul primit rămâne neatins', () => {
    const { doc, roomId } = oneRoom();
    const before = JSON.stringify(doc);
    expect(resizeRoomSide(doc, roomId, 'e', 500).ok).toBe(false);
    expect(resizeRoomSide(doc, roomId, 'e', 1000.5).ok).toBe(false);
    expect(resizeRoomSide(doc, 'lipsa', 'e', 2000).ok).toBe(false);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
