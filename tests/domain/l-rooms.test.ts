// Etapa 9a: camere cu laturi aliniate la axe, în special în formă de L: construire, pereți comuni, laturi și mutarea lor.
import { describe, expect, it } from 'vitest';
import {
  addPolyRoomShared,
  addRectRoom,
  addRectRoomShared,
  analyzeGeometry,
  axesFromInteriorPolygon,
  createEmptyProject,
  moveRoom,
  moveRoomEdge,
  rectAxesFromInterior,
  rotateRoom,
  roomEdges,
  roomsUsingWall,
  snapRoomAnchor,
  type ProjectDocument,
  type Pt,
} from '@/domain';

let n = 0;
const gen = () => `l${++n}`;
const ok = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const empty = () => createEmptyProject('p1', 'T', '2026-11-01T00:00:00.000Z');
const T = 100;

/** Poligonul interior al unui L (orar pe ecran): caseta W × D fără colțul de nord-est de cw × cd. */
const lShape = (W: number, D: number, cw: number, cd: number, at: Pt = { x: 0, y: 0 }): Pt[] =>
  [
    { x: 0, y: 0 },
    { x: W - cw, y: 0 },
    { x: W - cw, y: cd },
    { x: W, y: cd },
    { x: W, y: D },
    { x: 0, y: D },
  ].map((p) => ({ x: p.x + at.x, y: p.y + at.y }));

function withL(at?: Pt): { doc: ProjectDocument; room: string } {
  const r = ok(addPolyRoomShared(empty(), { interior: lShape(6000, 5000, 2500, 2000, at) }, gen));
  return { doc: r.doc, room: r.roomId };
}
const area = (d: ProjectDocument, id: string) => analyzeGeometry(d).rooms.get(id)!.areaMm2;

describe('axesFromInteriorPolygon', () => {
  it('dreptunghi: aceleași axe ca rectAxesFromInterior', () => {
    const rect: Pt[] = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const a = ok(axesFromInteriorPolygon(rect, T));
    const b = ok(rectAxesFromInterior(4000, 3000, { n: T, e: T, s: T, w: T }, { x: 0, y: 0 }));
    expect(a).toEqual(b);
  });

  it('L: colțul din interior (reflex) se mută spre „în afara” camerei, nu spre interior; sensul poligonului nu contează', () => {
    const axes = ok(axesFromInteriorPolygon(lShape(6000, 5000, 2500, 2000), T));
    expect(axes[2]).toEqual({ x: 3500 + 50, y: 2000 - 50 }); // vârful reflex: peretele orizontal e deasupra interiorului
    const reversed = ok(axesFromInteriorPolygon([...lShape(6000, 5000, 2500, 2000)].reverse(), T));
    expect(new Set(reversed.map((p) => `${p.x},${p.y}`))).toEqual(
      new Set(axes.map((p) => `${p.x},${p.y}`)),
    );
  });

  it('refuză laturi oblice, coordonate zecimale, grosime impară și mai puțin de 4 colțuri', () => {
    const tri: Pt[] = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 3000 },
      { x: 0, y: 1000 },
    ];
    expect(axesFromInteriorPolygon(tri, T).ok).toBe(false);
    expect(axesFromInteriorPolygon(lShape(6000, 5000, 2500, 2000), 99).ok).toBe(false);
    expect(
      axesFromInteriorPolygon([{ x: 0.5, y: 0 }, ...lShape(6000, 5000, 2500, 2000).slice(1)], T).ok,
    ).toBe(false);
    expect(axesFromInteriorPolygon(tri.slice(0, 3), T).ok).toBe(false);
  });
});

describe('cameră în L', () => {
  it('singură: 6 noduri, 6 pereți, geometrie validă, aria = caseta − colțul tăiat', () => {
    const { doc, room } = withL();
    expect(Object.keys(doc.nodes)).toHaveLength(6);
    expect(Object.keys(doc.walls)).toHaveLength(6);
    expect(doc.rooms[room]!.nodeLoop).toHaveLength(6);
    expect(analyzeGeometry(doc).issues).toEqual([]);
    expect(area(doc, room)).toBe(6000 * 5000 - 2500 * 2000);
  });

  it('o cameră dreptunghiulară în „crestătura” L-ului împarte ambii pereți ai ei, fără suprapunere', () => {
    const { doc, room } = withL();
    // crestătura: x din [3500, 6000], y din [0, 2000] (interior); axele pereților ei: x = 3550, y = 1950
    const r = ok(
      addRectRoomShared(doc, { widthMm: 2400, depthMm: 1900, anchor: { x: 3600, y: 0 } }, gen),
    );
    const geo = analyzeGeometry(r.doc);
    expect(geo.issues).toEqual([]);
    expect(geo.rooms.get(room)!.areaMm2).toBe(6000 * 5000 - 2500 * 2000);
    const shared = Object.values(r.doc.walls).filter(
      (w) => roomsUsingWall(r.doc, w.id).length === 2,
    );
    expect(shared).toHaveLength(2);
  });

  it('o cameră în crestătură, fără să atingă pereții, e acceptată (crestătura nu e „ocupată” de caseta L-ului)', () => {
    const { doc } = withL();
    const r = addRectRoomShared(
      doc,
      { widthMm: 1000, depthMm: 800, anchor: { x: 4500, y: 500 } },
      gen,
    );
    expect(r.ok).toBe(true);
  });

  it('o cameră peste corpul L-ului sau care îl cuprinde e refuzată', () => {
    const { doc } = withL();
    expect(
      addRectRoomShared(doc, { widthMm: 1000, depthMm: 1000, anchor: { x: 1000, y: 1000 } }, gen)
        .ok,
    ).toBe(false);
    expect(
      addRectRoomShared(doc, { widthMm: 9000, depthMm: 8000, anchor: { x: -1500, y: -1500 } }, gen)
        .ok,
    ).toBe(false);
  });

  it('un L lipit de un dreptunghi existent împarte peretele cu el', () => {
    const base = ok(
      addRectRoom(empty(), { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } }, gen),
    );
    // axa vestică a L-ului = axa estică a dreptunghiului (4050): interiorul L începe la 4100
    const r = ok(
      addPolyRoomShared(
        base.doc,
        { interior: lShape(5000, 4000, 2000, 1500, { x: 4100, y: 0 }) },
        gen,
      ),
    );
    expect(analyzeGeometry(r.doc).issues).toEqual([]);
    expect(Object.values(r.doc.walls).some((w) => roomsUsingWall(r.doc, w.id).length === 2)).toBe(
      true,
    );
  });
});

describe('roomEdges și moveRoomEdge', () => {
  it('L: 6 laturi cu normale exterioare aliniate cu axele; dreptunghi: 4', () => {
    const { doc, room } = withL();
    const edges = ok(roomEdges(doc, room));
    expect(edges).toHaveLength(6);
    for (const e of edges) expect(Math.abs(e.normal.x) + Math.abs(e.normal.y)).toBe(1);
    // latura de nord (de sus) are normala în sus (y negativ)
    const top = edges.find((e) => e.a.y === e.b.y && e.a.y === -50 && e.a.x < 0 + 1)!;
    expect(top.normal).toEqual({ x: 0, y: -1 });
    const rect = ok(
      addRectRoom(empty(), { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } }, gen),
    );
    expect(ok(roomEdges(rect.doc, rect.roomId))).toHaveLength(4);
  });

  it('mutarea unei laturi: aria se schimbă cu deplasarea × lungimea interioară a laturii, planul rămâne valid', () => {
    const { doc, room } = withL();
    const edges = ok(roomEdges(doc, room));
    // latura de vest (verticală, la x = −50): lungime interioară 5000
    const west = edges.find((e) => e.a.x === e.b.x && e.a.x === -50)!;
    const grown = ok(moveRoomEdge(doc, room, west.index, 500));
    expect(analyzeGeometry(grown).issues).toEqual([]);
    expect(area(grown, room)).toBe(area(doc, room) + 500 * 5000);
    // aceeași latură înapoi: nodurile revin
    const back = ok(moveRoomEdge(grown, room, west.index, -500));
    expect(back.nodes).toEqual(doc.nodes);
  });

  it('latura crestăturii: mutarea ei schimbă dimensiunea colțului tăiat (reflex), nu a casetei', () => {
    const { doc, room } = withL();
    const edges = ok(roomEdges(doc, room));
    // latura verticală a crestăturii (x = 3550): normala spre est (în afara camerei)
    const notchV = edges.find((e) => e.a.x === e.b.x && e.a.x === 3550)!;
    expect(notchV.normal).toEqual({ x: 1, y: 0 });
    const moved = ok(moveRoomEdge(doc, room, notchV.index, -500)); // spre interior: crestătura se lărgește
    expect(analyzeGeometry(moved).issues).toEqual([]);
    expect(area(moved, room)).toBe(area(doc, room) - 500 * 2000);
  });

  it('refuză o deplasare care ar scurta o latură sub minim sau i-ar inversa sensul; 0 întoarce documentul', () => {
    const { doc, room } = withL();
    const edges = ok(roomEdges(doc, room));
    const west = edges.find((e) => e.a.x === e.b.x && e.a.x === -50)!;
    const east = edges.find((e) => e.a.x === e.b.x && e.a.x === 6050)!;
    // muta latura de vest spre est dincolo de latura de est: lățimea ar deveni negativă
    expect(moveRoomEdge(doc, room, west.index, -7000).ok).toBe(false);
    expect(moveRoomEdge(doc, room, east.index, -6000).ok).toBe(false);
    expect(moveRoomEdge(doc, room, west.index, 0.5).ok).toBe(false);
    expect(ok(moveRoomEdge(doc, room, west.index, 0))).toBe(doc);
  });

  it('latura comună cu un vecin: nodurile ei se mută pentru ambele camere', () => {
    const { doc, room } = withL();
    const r = ok(
      addRectRoomShared(doc, { widthMm: 2400, depthMm: 1900, anchor: { x: 3600, y: 0 } }, gen),
    );
    const edges = ok(roomEdges(r.doc, room));
    const notchV = edges.find((e) => e.a.x === e.b.x && e.a.x === 3550)!;
    const moved = ok(moveRoomEdge(r.doc, room, notchV.index, -500));
    expect(analyzeGeometry(moved).issues).toEqual([]);
    // vecinul din crestătură crește cu 500 spre vest (peretele comun s-a mutat)
    expect(area(moved, r.roomId)).toBe(area(r.doc, r.roomId) + 500 * 1900);
  });
});

describe('L: rotire, mutare și lipire', () => {
  it('rotirea cu 90° păstrează aria și geometria; patru sferturi readuc camera', () => {
    const { doc, room } = withL();
    const r = ok(rotateRoom(doc, room, 1));
    expect(analyzeGeometry(r).issues).toEqual([]);
    expect(area(r, room)).toBe(area(doc, room));
    let d = doc;
    for (let i = 0; i < 4; i++) d = ok(rotateRoom(d, room, 1));
    expect(d.nodes).toEqual(doc.nodes);
  });

  it('mutarea păstrează forma', () => {
    const { doc, room } = withL();
    const r = ok(moveRoom(doc, room, { x: 1200, y: -300 }));
    expect(analyzeGeometry(r).issues).toEqual([]);
    expect(area(r, room)).toBe(area(doc, room));
  });

  it('snapRoomAnchor cu formă: axa vestică a L-ului se aliniază cu peretele estic al unui dreptunghi', () => {
    const base = ok(
      addRectRoom(empty(), { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } }, gen),
    );
    const shape = lShape(5000, 4000, 2000, 1500);
    const s = snapRoomAnchor(
      base.doc,
      { widthMm: 5000, depthMm: 4000, shape },
      { x: 4100 + 60, y: 40 },
      10,
      150,
    );
    expect(s.snappedX).toBe(true);
    expect(s.anchor.x).toBe(4100);
    const r = ok(
      addPolyRoomShared(
        base.doc,
        { interior: shape.map((p) => ({ x: p.x + s.anchor.x, y: p.y + s.anchor.y })) },
        gen,
      ),
    );
    expect(analyzeGeometry(r.doc).issues).toEqual([]);
  });
});
