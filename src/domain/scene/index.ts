// Scena 3D ca DATE, derivată exclusiv din document (nu din catalogul aplicației). Fără Three și fără DOM.
import {
  analyzeGeometry,
  facePoint,
  type GeometryModel,
  type Pt,
  type WallFootprint,
} from '../geometry';
import { InvalidDocumentError } from '../errors';
import type { ProjectDocument } from '../schema';

export interface Prism {
  id: string;
  wallId: string;
  /** Contur în plan (mm, Y în jos). */
  polygon: Pt[];
  /** Cota de jos / de sus, mm. */
  y0: number;
  y1: number;
}
export interface FloorDesc {
  id: string;
  roomId: string;
  polygon: Pt[];
  colorHex: string;
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
  /** Rețeta din snapshot; `null` dacă itemul lipsește (randarea folosește o cutie de înlocuire). */
  recipe: { id: string; version: number } | null;
}
export interface SceneDescription {
  prisms: Prism[];
  floors: FloorDesc[];
  boxes: BoxDesc[];
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
export function wallPrisms(doc: ProjectDocument, fp: WallFootprint): Prism[] {
  const wall = fp.frame.wall;
  const openings = Object.values(doc.openings)
    .filter((o) => o.wallId === wall.id)
    .sort((a, b) => a.offsetMm - b.offsetMm || a.id.localeCompare(b.id));
  const out: Prism[] = [];
  let n = 0;
  const push = (sa: number | null, sb: number | null, y0: number, y1: number) => {
    if (y1 > y0)
      out.push({
        id: `${wall.id}#${n++}`,
        wallId: wall.id,
        polygon: piecePolygon(fp, sa, sb),
        y0,
        y1,
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

/** Hash FNV-1a pe JSON canonic (chei sortate). */
export function stableHash(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  const s = JSON.stringify(canonical(value));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function buildScene(doc: ProjectDocument, geometry?: GeometryModel): SceneDescription {
  const model = geometry ?? analyzeGeometry(doc);
  if (model.issues.length > 0)
    throw new InvalidDocumentError('Geometrie invalidă: scena nu se poate construi.', model.issues);

  const prisms = [...model.footprints.keys()]
    .sort()
    .flatMap((id) => wallPrisms(doc, model.footprints.get(id)!));

  const floorAssignment = (roomId: string) =>
    Object.values(doc.finishAssignments)
      .filter((a) => a.target.kind === 'roomFloor' && a.target.roomId === roomId)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
  const floors: FloorDesc[] = [...model.rooms.keys()].sort().map((roomId) => {
    const a = floorAssignment(roomId);
    const finish = a ? doc.catalogSnapshot.finishes[a.finishId] : undefined;
    return {
      id: `floor:${roomId}`,
      roomId,
      polygon: model.rooms.get(roomId)!.polygon,
      colorHex: finish?.appearance.baseColorHex ?? '#dddddd',
    };
  });

  const boxes: BoxDesc[] = Object.keys(doc.objects)
    .sort()
    .map((id) => {
      const o = doc.objects[id]!;
      const item = doc.catalogSnapshot.items[o.catalogItemId];
      const [x, , z] = toWorld(o.position);
      return {
        id,
        center: [x, (o.elevationMm + o.size.heightMm / 2) / 1000, z],
        size: [o.size.widthMm / 1000, o.size.heightMm / 1000, o.size.depthMm / 1000],
        rotationY: planRotationToThree(o.rotationDeg),
        colorHex: o.colorHex ?? item?.defaultColorHex ?? '#bbbbbb',
        recipe: item ? { id: item.recipe.id, version: item.recipe.version } : null,
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
  };
  return { prisms, floors, boxes, hash: stableHash(body) };
}

/** Semnătură fără ID-uri: două documente identice ca geometrie, dar cu ID-uri diferite, au aceeași semnătură. */
export function geometrySignature(scene: SceneDescription): string {
  const strip = (p: Pt[]) => p.map((q) => [round3(q.x), round3(q.y)]);
  const order = (a: unknown, b: unknown) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  return stableHash({
    prisms: scene.prisms.map((p) => [strip(p.polygon), p.y0, p.y1]).sort(order),
    floors: scene.floors.map((f) => [strip(f.polygon), f.colorHex]).sort(order),
    boxes: scene.boxes
      .map((b) => [b.center, b.size, b.rotationY, b.colorHex, b.recipe])
      .sort(order),
  });
}
