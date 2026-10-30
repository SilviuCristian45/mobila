// Scena 3D ca DATE, derivată exclusiv din document (nu din catalogul aplicației). Fără Three și fără DOM.
import {
  analyzeGeometry,
  facePoint,
  type GeometryModel,
  type Pt,
  type WallFootprint,
} from '../geometry';
import { InvalidDocumentError } from '../errors';
import { stableHash } from '../hash';

export { stableHash };
import { resolveLook, type SurfaceLook } from '../finishes';
import type { ObjectFinishSlot, ProjectDocument } from '../schema';

export interface Prism {
  id: string;
  wallId: string;
  /** Contur în plan (mm, Y în jos). */
  polygon: Pt[];
  /** Cota de jos / de sus, mm. */
  y0: number;
  y1: number;
  /** Cheile aspectului (în `SceneDescription.looks`) pe fața stângă/dreaptă a peretelui; `null` = finisajul implicit. */
  left: string | null;
  right: string | null;
}
export interface FloorDesc {
  id: string;
  roomId: string;
  polygon: Pt[];
  /** Culoarea de bază rezolvată (finisaj sau `#dddddd`). */
  colorHex: string;
  /** Cheia aspectului în `looks`; `null` = fără finisaj (culoare implicită). */
  look: string | null;
}
export interface BoxDesc {
  id: string;
  /** Centru în metri, spațiu 3D (X, Y sus, Z). */
  center: [number, number, number];
  /** Lățime (X local), înălțime (Y), adâncime (Z local), în metri. */
  size: [number, number, number];
  /** Rotația din plan θ (orar) ↔ rotation.y = −θ (radiani). */
  rotationY: number;
  colorHex: string;
  /** Parametrii instanței (rețeta îi citește; cheile lipsă = valorile implicite ale rețetei). */
  params: Record<string, number | string | boolean>;
  /** Rețeta din snapshot; `null` dacă itemul lipsește (randarea folosește o cutie de înlocuire). */
  recipe: { id: string; version: number } | null;
  /** Finisajele zonelor obiectului: zonă → cheia aspectului din `looks`. */
  slots: Partial<Record<ObjectFinishSlot, string>>;
}
export interface SceneDescription {
  prisms: Prism[];
  floors: FloorDesc[];
  boxes: BoxDesc[];
  /** Aspectele folosite, după cheie (conținut identic ⇒ aceeași cheie: un material reutilizat apare o singură dată). */
  looks: Record<string, SurfaceLook>;
  /** Hash stabil al conținutului (pentru actualizări incrementale și testul de autonomie). */
  hash: string;
}

/** 2D (mm, Y în jos) → 3D (m, Y în sus): X→X, y→Z, elevație→Y. */
export const toWorld = (p: Pt, elevationMm = 0): [number, number, number] => [
  p.x / 1000,
  elevationMm / 1000,
  p.y / 1000,
];
export const fromWorld = (
  w: readonly [number, number, number],
): { p: Pt; elevationMm: number } => ({
  p: { x: w[0] * 1000, y: w[2] * 1000 },
  elevationMm: w[1] * 1000,
});
export const planRotationToThree = (deg: number): number => (-deg * Math.PI) / 180;

function piecePolygon(fp: WallFootprint, sa: number | null, sb: number | null): Pt[] {
  const aL = sa ?? fp.left.s0,
    aR = sa ?? fp.right.s0,
    bL = sb ?? fp.left.s1,
    bR = sb ?? fp.right.s1;
  return [
    facePoint(fp, 'left', aL),
    facePoint(fp, 'left', bL),
    facePoint(fp, 'right', bR),
    facePoint(fp, 'right', aR),
  ];
}

/** Peretele ca prisme: golurile se obțin prin segmentare (sub fereastră, deasupra golului, între goluri). */
export function wallPrisms(
  doc: ProjectDocument,
  fp: WallFootprint,
  looks: Map<string, SurfaceLook> = new Map(),
): Prism[] {
  const wall = fp.frame.wall;
  // finisajele fețelor: benzi de înălțime pe stânga/dreapta; prismele se taie la marginile benzilor
  const bands = Object.values(doc.finishAssignments)
    .filter((a) => a.target.kind === 'wallSide' && a.target.wallId === wall.id)
    .map((a) => {
      const side = (a.target as { side: 'left' | 'right' }).side;
      const from = a.fromHeightMm ?? 0;
      const to = Math.min(from + (a.coveredHeightMm ?? wall.heightMm - from), wall.heightMm);
      const finish = doc.catalogSnapshot.finishes[a.finishId];
      const look = finish ? resolveLook(finish, a.look) : null;
      if (look) looks.set(look.key, look);
      return { side, from, to, key: look?.key ?? null };
    })
    .filter((b) => b.to > b.from);
  const cuts = [...new Set(bands.flatMap((b) => [b.from, b.to]))].sort((a, b) => a - b);
  const keyAt = (side: 'left' | 'right', y0: number, y1: number): string | null =>
    bands.find((b) => b.side === side && b.from <= y0 && b.to >= y1)?.key ?? null;
  const openings = Object.values(doc.openings)
    .filter((o) => o.wallId === wall.id)
    .sort((a, b) => a.offsetMm - b.offsetMm || a.id.localeCompare(b.id));
  const out: Prism[] = [];
  let n = 0;
  const push = (sa: number | null, sb: number | null, y0: number, y1: number) => {
    if (y1 <= y0) return;
    const ys = [y0, ...cuts.filter((c) => c > y0 && c < y1), y1];
    for (let i = 0; i + 1 < ys.length; i++)
      out.push({
        id: `${wall.id}#${n++}`,
        wallId: wall.id,
        polygon: piecePolygon(fp, sa, sb),
        y0: ys[i]!,
        y1: ys[i + 1]!,
        left: keyAt('left', ys[i]!, ys[i + 1]!),
        right: keyAt('right', ys[i]!, ys[i + 1]!),
      });
  };
  let cursor: number | null = null;
  for (const o of openings) {
    const a = o.offsetMm - o.widthMm / 2;
    const b = o.offsetMm + o.widthMm / 2;
    push(cursor, a, 0, wall.heightMm);
    push(a, b, 0, o.sillHeightMm);
    push(a, b, Math.min(o.sillHeightMm + o.heightMm, wall.heightMm), wall.heightMm);
    cursor = b;
  }
  push(cursor, null, 0, wall.heightMm);
  return out;
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export function buildScene(doc: ProjectDocument, geometry?: GeometryModel): SceneDescription {
  const model = geometry ?? analyzeGeometry(doc);
  if (model.issues.length > 0)
    throw new InvalidDocumentError('Geometrie invalidă: scena nu se poate construi.', model.issues);

  const looks = new Map<string, SurfaceLook>();
  const prisms = [...model.footprints.keys()]
    .sort()
    .flatMap((id) => wallPrisms(doc, model.footprints.get(id)!, looks));

  const floorAssignment = (roomId: string) =>
    Object.values(doc.finishAssignments)
      .filter((a) => a.target.kind === 'roomFloor' && a.target.roomId === roomId)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
  const floors: FloorDesc[] = [...model.rooms.keys()].sort().map((roomId) => {
    const a = floorAssignment(roomId);
    const finish = a ? doc.catalogSnapshot.finishes[a.finishId] : undefined;
    const look = finish ? resolveLook(finish, a?.look) : null;
    if (look) looks.set(look.key, look);
    return {
      id: `floor:${roomId}`,
      roomId,
      polygon: model.rooms.get(roomId)!.polygon,
      colorHex: look?.baseColorHex ?? '#dddddd',
      look: look?.key ?? null,
    };
  });

  const boxes: BoxDesc[] = Object.keys(doc.objects)
    .sort()
    .map((id) => {
      const o = doc.objects[id]!;
      const item = doc.catalogSnapshot.items[o.catalogItemId];
      const [x, , z] = toWorld(o.position);
      const slots: BoxDesc['slots'] = {};
      for (const a of Object.values(doc.finishAssignments)) {
        if (a.target.kind !== 'objectSlot' || a.target.objectId !== id) continue;
        const finish = doc.catalogSnapshot.finishes[a.finishId];
        if (!finish) continue;
        const look = resolveLook(finish, a.look);
        looks.set(look.key, look);
        slots[a.target.slot] = look.key;
      }
      return {
        id,
        center: [x, (o.elevationMm + o.size.heightMm / 2) / 1000, z],
        size: [o.size.widthMm / 1000, o.size.heightMm / 1000, o.size.depthMm / 1000],
        rotationY: planRotationToThree(o.rotationDeg),
        params: { ...o.params },
        colorHex: o.colorHex ?? item?.defaultColorHex ?? '#bbbbbb',
        recipe: item ? { id: item.recipe.id, version: item.recipe.version } : null,
        slots,
      };
    });

  const body = {
    prisms: prisms.map((p) => ({
      ...p,
      polygon: p.polygon.map((q) => ({ x: round3(q.x), y: round3(q.y) })),
    })),
    floors: floors.map((f) => ({
      ...f,
      polygon: f.polygon.map((q) => ({ x: round3(q.x), y: round3(q.y) })),
    })),
    boxes,
    looks: Object.fromEntries([...looks].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
  return {
    prisms,
    floors,
    boxes,
    looks: body.looks,
    hash: stableHash(body),
  };
}

/** Semnătură fără ID-uri: două documente identice ca geometrie, dar cu ID-uri diferite, au aceeași semnătură. */
export function geometrySignature(scene: SceneDescription): string {
  const strip = (p: Pt[]) => p.map((q) => [round3(q.x), round3(q.y)]);
  const order = (a: unknown, b: unknown) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  return stableHash({
    prisms: scene.prisms.map((p) => [strip(p.polygon), p.y0, p.y1, p.left, p.right]).sort(order),
    floors: scene.floors.map((f) => [strip(f.polygon), f.colorHex, f.look]).sort(order),
    boxes: scene.boxes
      .map((b) => [b.center, b.size, b.rotationY, b.colorHex, b.recipe, b.params, b.slots])
      .sort(order),
  });
}
