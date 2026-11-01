// Etapa 8a: camere cu pereți comuni (noduri refolosite, pereți despărțiți în T), rotirea camerelor și lipirea pe axe.
import { describe, expect, it } from 'vitest';
import {
  addObject,
  addOpening,
  addRectRoom,
  addRectRoomShared,
  analyzeGeometry,
  applyFinish,
  createEmptyProject,
  moveRoom,
  rectInteriorSize,
  resizeRoomSide,
  rotateRoom,
  roomsUsingWall,
  snapRoomAnchor,
  type ProjectDocument,
} from '@/domain';
import { getBuiltinItem } from '@/catalog';
import { getBuiltinMaterial } from '@/materials';

let n = 0;
const gen = () => `s${++n}`;
const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const empty = () => createEmptyProject('p1', 'T', '2026-11-01T00:00:00.000Z');
const T = 100; // grosimea implicită a pereților în proiectul gol

/** Camera A: interior 4000 × 3000, colțul interior în (0, 0). */
function withA(): { doc: ProjectDocument; a: string } {
  const r = ok(addRectRoom(empty(), { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } }, gen));
  return { doc: r.doc, a: r.roomId };
}
/** Axa peretelui de est al lui A = 4000 + T/2; interiorul camerei vecine începe la 4000 + T. */
const EAST = 4000 + T;

describe('addRectRoomShared', () => {
  it('fără nicio coincidență: la fel ca addRectRoom (4 noduri, 4 pereți noi)', () => {
    const { doc } = withA();
    const r = ok(
      addRectRoomShared(doc, { widthMm: 2000, depthMm: 2000, anchor: { x: 9000, y: 9000 } }, gen),
    );
    expect(Object.keys(r.doc.nodes)).toHaveLength(8);
    expect(Object.keys(r.doc.walls)).toHaveLength(8);
    expect(analyzeGeometry(r.doc).issues).toEqual([]);
  });

  it('aceeași latură (aceleași capete): doi pereți comuni refolosiți, 6 noduri și 7 pereți în total; fiecare cameră își păstrează interiorul', () => {
    const { doc, a } = withA();
    const r = ok(
      addRectRoomShared(doc, { widthMm: 3000, depthMm: 3000, anchor: { x: EAST, y: 0 } }, gen),
    );
    expect(Object.keys(r.doc.nodes)).toHaveLength(6);
    expect(Object.keys(r.doc.walls)).toHaveLength(7);
    const geo = analyzeGeometry(r.doc);
    expect(geo.issues).toEqual([]);
    expect(geo.rooms.get(a)!.areaMm2).toBe(4000 * 3000);
    expect(geo.rooms.get(r.roomId)!.areaMm2).toBe(3000 * 3000);
    const shared = Object.values(r.doc.walls).filter(
      (w) => roomsUsingWall(r.doc, w.id).length === 2,
    );
    expect(shared).toHaveLength(1);
  });

  it('latura vecinului mai scurtă: peretele existent se desparte printr-un nod (T); A rămâne cu aria și dimensiunile', () => {
    const { doc, a } = withA();
    const r = ok(
      addRectRoomShared(doc, { widthMm: 3000, depthMm: 2000, anchor: { x: EAST, y: 0 } }, gen),
    );
    expect(r.doc.rooms[a]!.nodeLoop).toHaveLength(5); // nod nou pe latura estică a lui A
    const geo = analyzeGeometry(r.doc);
    expect(geo.issues).toEqual([]);
    expect(geo.rooms.get(a)!.areaMm2).toBe(4000 * 3000);
    expect(geo.rooms.get(r.roomId)!.areaMm2).toBe(3000 * 2000);
    // A rămâne „dreptunghiulară” pentru panou și mânere, chiar cu nod coliniar pe latură
    expect(ok(rectInteriorSize(r.doc, a))).toEqual({ widthMm: 4000, depthMm: 3000 });
    expect(ok(rectInteriorSize(r.doc, r.roomId))).toEqual({ widthMm: 3000, depthMm: 2000 });
  });

  it('latura vecinului mai lungă: colțul lui A intră în bucla vecinului, peretele lui A se refolosește', () => {
    const { doc, a } = withA();
    const r = ok(
      addRectRoomShared(doc, { widthMm: 3000, depthMm: 5000, anchor: { x: EAST, y: 0 } }, gen),
    );
    expect(r.doc.rooms[r.roomId]!.nodeLoop).toHaveLength(5);
    expect(r.doc.rooms[a]!.nodeLoop).toHaveLength(4);
    const geo = analyzeGeometry(r.doc);
    expect(geo.issues).toEqual([]);
    expect(geo.rooms.get(r.roomId)!.areaMm2).toBe(3000 * 5000);
  });

  it('suprapunere parțială (vecin decalat): ambele laturi se despart reciproc, geometrie validă', () => {
    const { doc, a } = withA();
    const r = ok(
      addRectRoomShared(doc, { widthMm: 3000, depthMm: 3000, anchor: { x: EAST, y: 1000 } }, gen),
    );
    const geo = analyzeGeometry(r.doc);
    expect(geo.issues).toEqual([]);
    expect(geo.rooms.get(a)!.areaMm2).toBe(4000 * 3000);
    expect(geo.rooms.get(r.roomId)!.areaMm2).toBe(3000 * 3000);
  });

  it('golurile de pe peretele despărțit trec pe segmentul care le conține; un gol tăiat de nod refuză operația', () => {
    const { doc, a } = withA();
    // peretele de est al lui A: cel dintre nodurile de pe x = 4000 + T/2
    const east = Object.values(doc.walls).find((w) => {
      const s = doc.nodes[w.startNodeId]!;
      const e = doc.nodes[w.endNodeId]!;
      return s.x === 4000 + T / 2 && e.x === 4000 + T / 2;
    })!;
    const withDoor = ok(addOpening(doc, east.id, 'door', gen)); // la mijlocul peretelui (~1500 mm)
    const opening = Object.values(withDoor.doc.openings)[0]!;
    // vecin care se termină DUPĂ gol (colțul cade sub el): golul rămâne pe primul segment
    const below = ok(
      addRectRoomShared(
        withDoor.doc,
        { widthMm: 3000, depthMm: 2500, anchor: { x: EAST, y: 0 } },
        gen,
      ),
    );
    expect(below.doc.openings[opening.id]!.wallId).toBe(east.id);
    // vecin ale cărui colț cade în gol: refuzat, cu mesaj
    const cut = addRectRoomShared(
      withDoor.doc,
      { widthMm: 3000, depthMm: 1500, anchor: { x: EAST, y: 0 } },
      gen,
    );
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.error).toMatch(/ar fi tăiată/);
    // vecin al cărui colț cade înaintea golului: golul trece pe al doilea segment, cu decalaj relativ
    const above = ok(
      addRectRoomShared(
        withDoor.doc,
        { widthMm: 3000, depthMm: 400, anchor: { x: EAST, y: 0 } },
        gen,
      ),
    );
    const moved = above.doc.openings[opening.id]!;
    expect(moved.wallId).not.toBe(east.id);
    expect(moved.offsetMm).toBeLessThan(opening.offsetMm);
    expect(analyzeGeometry(above.doc).issues).toEqual([]);
    void a;
  });

  it('finisajele fețelor peretelui despărțit acoperă ambele segmente', () => {
    const { doc, a } = withA();
    const east = Object.values(doc.walls).find((w) => {
      const s = doc.nodes[w.startNodeId]!;
      const e = doc.nodes[w.endNodeId]!;
      return s.x === 4000 + T / 2 && e.x === 4000 + T / 2;
    })!;
    const painted = ok(
      applyFinish(
        doc,
        getBuiltinMaterial('mat.paint.sage')!,
        { kind: 'wallSide', wallId: east.id, side: 'left' },
        gen,
      ),
    ).doc;
    const r = ok(
      addRectRoomShared(painted, { widthMm: 3000, depthMm: 2000, anchor: { x: EAST, y: 0 } }, gen),
    );
    const onWalls = Object.values(r.doc.finishAssignments).filter(
      (f) => f.target.kind === 'wallSide',
    );
    expect(onWalls).toHaveLength(2);
    expect(new Set(onWalls.map((f) => (f.target as { wallId: string }).wallId)).size).toBe(2);
    void a;
  });

  it('redimensionarea laturii comune mută peretele pentru ambele camere (nodurile T se mută odată cu latura)', () => {
    const { doc, a } = withA();
    const r = ok(
      addRectRoomShared(doc, { widthMm: 3000, depthMm: 2000, anchor: { x: EAST, y: 0 } }, gen),
    );
    const grown = ok(resizeRoomSide(r.doc, a, 'e', 5000));
    expect(analyzeGeometry(grown).issues).toEqual([]);
    expect(ok(rectInteriorSize(grown, a)).widthMm).toBe(5000);
    expect(ok(rectInteriorSize(grown, r.roomId)).widthMm).toBe(2000); // vecinul pierde 1000
  });
});

describe('addRectRoomShared: fără suprapuneri', () => {
  it('refuză o cameră care o cuprinde pe alta, chiar dacă împarte un perete cu ea', () => {
    const { doc } = withA();
    // axa estică a noii camere = axa estică a lui A (4050), dar camera cuprinde tot A
    const r = addRectRoomShared(
      doc,
      { widthMm: 5000, depthMm: 4000, anchor: { x: -1050, y: -500 } },
      gen,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/suprapune/);
  });

  it('refuză o cameră așezată în interiorul alteia și duplicarea unei camere existente', () => {
    const { doc } = withA();
    expect(
      addRectRoomShared(doc, { widthMm: 1000, depthMm: 1000, anchor: { x: 1000, y: 1000 } }, gen)
        .ok,
    ).toBe(false);
    const dup = addRectRoomShared(
      doc,
      { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } },
      gen,
    );
    expect(dup.ok).toBe(false);
  });
});

describe('snapRoomAnchor pe axe', () => {
  it('aproape de peretele unei camere: axa se aliniază cu axa lui, astfel încât camerele împart peretele', () => {
    const { doc } = withA();
    const s = snapRoomAnchor(
      doc,
      { widthMm: 3000, depthMm: 3000 },
      { x: EAST + 60, y: 40 },
      10,
      150,
    );
    expect(s.snappedX).toBe(true);
    expect(s.anchor.x).toBe(EAST); // axa vestică a noii camere = axa estică a lui A
    expect(s.snappedY).toBe(true);
    expect(s.anchor.y).toBe(0);
    const r = ok(addRectRoomShared(doc, { widthMm: 3000, depthMm: 3000, anchor: s.anchor }, gen));
    expect(analyzeGeometry(r.doc).issues).toEqual([]);
    expect(Object.keys(r.doc.nodes)).toHaveLength(6); // două noduri comune
  });

  it('peste cameră (n-are nicio poziție validă în prag): rămâne pe grilă, nealipită', () => {
    const { doc } = withA();
    const s = snapRoomAnchor(doc, { widthMm: 2000, depthMm: 2000 }, { x: 1000, y: 1000 }, 100, 150);
    expect(s.anchor).toEqual({ x: 1000, y: 1000 });
  });

  it('departe de orice nod: doar grila', () => {
    const { doc } = withA();
    const s = snapRoomAnchor(
      doc,
      { widthMm: 2000, depthMm: 2000 },
      { x: 20049, y: 20051 },
      100,
      150,
    );
    expect(s).toEqual({ anchor: { x: 20000, y: 20100 }, snappedX: false, snappedY: false });
  });
});

describe('rotateRoom', () => {
  const center = (d: ProjectDocument, id: string) => {
    const pts = d.rooms[id]!.nodeLoop.map((k) => d.nodes[k]!);
    return {
      x: (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2,
      y: (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2,
    };
  };

  it('90°: lățimea și adâncimea se inversează, centrul rămâne, geometria e validă', () => {
    const { doc, a } = withA();
    const c0 = center(doc, a);
    const r = ok(rotateRoom(doc, a, 1));
    expect(ok(rectInteriorSize(r, a))).toEqual({ widthMm: 3000, depthMm: 4000 });
    const c1 = center(r, a);
    expect(Math.abs(c1.x - c0.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(c1.y - c0.y)).toBeLessThanOrEqual(1);
    expect(analyzeGeometry(r).issues).toEqual([]);
  });

  it('patru sferturi readuc camera; −1 și +3 sunt echivalente; 0 întoarce documentul', () => {
    const { doc, a } = withA();
    let d = doc;
    for (let i = 0; i < 4; i++) d = ok(rotateRoom(d, a, 1));
    expect(d.nodes).toEqual(doc.nodes);
    expect(ok(rotateRoom(doc, a, -1)).nodes).toEqual(ok(rotateRoom(doc, a, 3)).nodes);
    expect(ok(rotateRoom(doc, a, 0))).toBe(doc);
  });

  it('obiectele din cameră se rotesc odată cu ea (poziție și orientare), cele din afară rămân', () => {
    const { doc, a } = withA();
    const sofa = getBuiltinItem('living.sofa-3')!;
    const inside = ok(addObject(doc, sofa, { position: { x: 3000, y: 1500 } }, gen));
    const outside = ok(addObject(inside.doc, sofa, { position: { x: 9000, y: 9000 } }, gen));
    const r = ok(rotateRoom(outside.doc, a, 1));
    const o = r.objects[inside.objectId]!;
    expect(o.rotationDeg).toBe((outside.doc.objects[inside.objectId]!.rotationDeg + 90) % 360);
    // (3000,1500) față de centrul (2000,1500): dx = 1000, dy = 0 → după 90° orare: dx = 0, dy = 1000
    expect(o.position).toEqual({ x: 2000, y: 2500 });
    expect(r.objects[outside.objectId]!.position).toEqual({ x: 9000, y: 9000 });
  });

  it('camera cu perete comun nu se rotește (mesaj), dar se mută: nodurile comune merg cu ea și vecina se deformează', () => {
    const { doc, a } = withA();
    const r = ok(
      addRectRoomShared(doc, { widthMm: 3000, depthMm: 3000, anchor: { x: EAST, y: 0 } }, gen),
    );
    const rot = rotateRoom(r.doc, a, 1);
    expect(rot.ok).toBe(false);
    if (!rot.ok) expect(rot.error).toMatch(/comune|împarte/);
    // vecina B se mută pe orizontală: nodurile comune (colțurile lui A) o urmează
    const moved = ok(moveRoom(r.doc, r.roomId, { x: 400, y: 0 }));
    const sharedIds = r.doc.rooms[r.roomId]!.nodeLoop.filter((n) =>
      r.doc.rooms[a]!.nodeLoop.includes(n),
    );
    expect(sharedIds.length).toBeGreaterThanOrEqual(2);
    for (const id of sharedIds) expect(moved.nodes[id]!.x).toBe(r.doc.nodes[id]!.x + 400);
    const geo = analyzeGeometry(moved);
    expect(geo.rooms.get(r.roomId)!.areaMm2).toBe(3000 * 3000);
    expect(geo.issues).toEqual([]);
  });

  it('refuză sferturi zecimale și camera inexistentă', () => {
    const { doc, a } = withA();
    expect(rotateRoom(doc, a, 0.5).ok).toBe(false);
    expect(rotateRoom(doc, 'lipsa', 1).ok).toBe(false);
  });
});
