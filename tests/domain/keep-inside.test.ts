// Etapa 9b: obiectele rămân în camera lor când conturul camerei se schimbă (perete comun mutat, latură, redimensionare, nod).
import { describe, expect, it } from 'vitest';
import {
  addObject,
  addRectRoom,
  addRectRoomShared,
  analyzeGeometry,
  createEmptyProject,
  keepObjectsInRooms,
  moveNode,
  moveRoom,
  moveRoomEdge,
  pointInPolygon,
  resizeRoomSide,
  roomEdges,
  type ProjectDocument,
  type Pt,
} from '@/domain';
import { getBuiltinItem } from '@/catalog';

let n = 0;
const gen = () => `k${++n}`;
const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const sofa = getBuiltinItem('living.sofa-3')!;
const EAST = 4100; // interiorul vecinului începe aici (peretele comun are axa la 4050)

/** A (4000 × 3000 în (0,0)) + B (3000 × 3000, perete comun) și câte un obiect în A la `at`. */
function scene(at: Pt): { doc: ProjectDocument; a: string; b: string; obj: string } {
  const base = ok(
    addRectRoom(
      createEmptyProject('p', 'T', '2026-11-01T00:00:00.000Z'),
      { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } },
      gen,
    ),
  );
  const neighbour = ok(
    addRectRoomShared(base.doc, { widthMm: 3000, depthMm: 3000, anchor: { x: EAST, y: 0 } }, gen),
  );
  const o = ok(addObject(neighbour.doc, sofa, { position: at }, gen));
  return { doc: o.doc, a: base.roomId, b: neighbour.roomId, obj: o.objectId };
}
const insideRoom = (d: ProjectDocument, room: string, p: Pt): boolean =>
  pointInPolygon(p, analyzeGeometry(d).rooms.get(room)!.polygon);

describe('keepObjectsInRooms', () => {
  it('peretele comun mutat în camera vecină: obiectul rămas în afara ei revine în interior', () => {
    const { doc, a, b, obj } = scene({ x: 3600, y: 1500 });
    expect(insideRoom(doc, a, doc.objects[obj]!.position)).toBe(true);
    const west = ok(roomEdges(doc, b)).find((e) => e.normal.x === -1)!;
    const moved = ok(moveRoomEdge(doc, b, west.index, 800)); // peretele comun se mută 800 mm spre vest (în A)
    const p = moved.objects[obj]!.position;
    expect(insideRoom(moved, a, p)).toBe(true);
    expect(insideRoom(moved, b, p)).toBe(false); // nu a trecut la vecină
    expect(analyzeGeometry(moved).issues).toEqual([]);
  });

  it('obiectele care rămân în interior nu se ating (nici pozițiile, nici identitatea documentului când nimic nu iese)', () => {
    const { doc, a, b, obj } = scene({ x: 1500, y: 1500 });
    const west = ok(roomEdges(doc, b)).find((e) => e.normal.x === -1)!;
    const moved = ok(moveRoomEdge(doc, b, west.index, 800));
    expect(moved.objects[obj]!.position).toEqual({ x: 1500, y: 1500 });
    expect(keepObjectsInRooms(doc, doc)).toBe(doc);
    void a;
  });

  it('mutarea camerei vecine deformează camera cu obiectul: obiectul din colțul tăiat revine în interior', () => {
    const { doc, a, b, obj } = scene({ x: 3600, y: 2800 });
    const moved = ok(moveRoom(doc, b, { x: 0, y: -1000 }));
    expect(analyzeGeometry(moved).issues).toEqual([]);
    expect(insideRoom(moved, a, moved.objects[obj]!.position)).toBe(true);
  });

  it('camera redusă din mâner: obiectele ei sunt aduse înăuntru, cele din alte camere rămân', () => {
    const base = ok(
      addRectRoom(
        createEmptyProject('p', 'T', '2026-11-01T00:00:00.000Z'),
        { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } },
        gen,
      ),
    );
    const inRoom = ok(addObject(base.doc, sofa, { position: { x: 3800, y: 1500 } }, gen));
    const outside = ok(addObject(inRoom.doc, sofa, { position: { x: 9000, y: 9000 } }, gen));
    const smaller = ok(resizeRoomSide(outside.doc, base.roomId, 'e', 2000));
    expect(insideRoom(smaller, base.roomId, smaller.objects[inRoom.objectId]!.position)).toBe(true);
    expect(smaller.objects[outside.objectId]!.position).toEqual({ x: 9000, y: 9000 });
  });

  it('nodul tras spre interior: obiectul din apropierea colțului rămâne în cameră', () => {
    const base = ok(
      addRectRoom(
        createEmptyProject('p', 'T', '2026-11-01T00:00:00.000Z'),
        { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } },
        gen,
      ),
    );
    const o = ok(addObject(base.doc, sofa, { position: { x: 3700, y: 400 } }, gen));
    const ne = base.doc.rooms[base.roomId]!.nodeLoop.map((id) => base.doc.nodes[id]!).find(
      (nd) => nd.x > 0 && nd.y < 0,
    )!;
    const moved = ok(moveNode(o.doc, ne.id, { x: ne.x - 1500, y: ne.y + 1200 }));
    expect(insideRoom(moved, base.roomId, moved.objects[o.objectId]!.position)).toBe(true);
  });

  it('obiectul atașat de un perete se desprinde când e adus înapoi (ca la mutarea liberă)', () => {
    const { doc, b, obj } = scene({ x: 3600, y: 1500 });
    const attached = {
      ...doc,
      objects: {
        ...doc.objects,
        [obj]: { ...doc.objects[obj]!, wallId: Object.keys(doc.walls)[0]! },
      },
    };
    const west = ok(roomEdges(attached, b)).find((e) => e.normal.x === -1)!;
    const moved = ok(moveRoomEdge(attached, b, west.index, 800));
    expect(moved.objects[obj]!.wallId).toBeUndefined();
  });
});
