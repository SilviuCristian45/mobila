// SPIKE — SceneDescription din model (ARCHITECTURE §6): pereți ca prisme (goluri prin segmentare), podele, obiecte. Fără Three.
import { computeJoins, facePoint, interiorPolygon, wallFootprint, type Pt, type WallFootprint } from './geometry';
import type { ProjectDocument } from './schema';

export interface Prism { id: string; wallId: string; polygon: Pt[]; y0: number; y1: number }
export interface FloorDesc { id: string; roomId: string; polygon: Pt[]; colorHex: string }
export interface BoxDesc { id: string; center: [number, number, number]; size: [number, number, number]; rotationY: number; colorHex: string; recipe: string }
export interface SceneDescription { prisms: Prism[]; floors: FloorDesc[]; boxes: BoxDesc[]; hash: string }

/** 2D (mm, Y în jos) → 3D (m, Y în sus): X→X, y→Z, elevație→Y. Rotația orară din plan = −θ în jurul lui Y. */
export const toWorld = (p: Pt, elevMm = 0): [number, number, number] => [p.x / 1000, elevMm / 1000, p.y / 1000];
export const fromWorld = (w: [number, number, number]): { p: Pt; elevMm: number } => ({ p: { x: w[0] * 1000, y: w[2] * 1000 }, elevMm: w[1] * 1000 });
export const planRotationToThree = (deg: number): number => (-deg * Math.PI) / 180;

function piecePolygon(fp: WallFootprint, sa: number | null, sb: number | null): Pt[] {
  const aL = sa ?? fp.left.s0, aR = sa ?? fp.right.s0, bL = sb ?? fp.left.s1, bR = sb ?? fp.right.s1;
  return [facePoint(fp, 'left', aL), facePoint(fp, 'left', bL), facePoint(fp, 'right', bR), facePoint(fp, 'right', aR)];
}

export function wallPrisms(doc: ProjectDocument, wallId: string, joins = computeJoins(doc)): Prism[] {
  const w = doc.walls[wallId]!;
  const fp = wallFootprint(doc, joins, w);
  const ops = Object.values(doc.openings).filter((o) => o.wallId === wallId).sort((a, b) => a.offsetMm - b.offsetMm);
  const out: Prism[] = [];
  let cursor: number | null = null; // null = începutul feței
  let n = 0;
  const push = (sa: number | null, sb: number | null, y0: number, y1: number) => { if (y1 > y0) out.push({ id: `${wallId}#${n++}`, wallId, polygon: piecePolygon(fp, sa, sb), y0, y1 }); };
  for (const o of ops) {
    const a = o.offsetMm - o.widthMm / 2, b = o.offsetMm + o.widthMm / 2;
    push(cursor, a, 0, w.heightMm);
    push(a, b, 0, o.sillHeightMm);
    push(a, b, Math.min(o.sillHeightMm + o.heightMm, w.heightMm), w.heightMm);
    cursor = b;
  }
  push(cursor, null, 0, w.heightMm);
  return out;
}

/** Hash stabil (FNV-1a pe JSON canonic). */
export function stableHash(v: unknown): string {
  const s = JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as object).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Folosește DOAR documentul (catalogSnapshot), niciun catalog global — baza testului de autonomie. */
export function buildScene(doc: ProjectDocument): SceneDescription {
  const joins = computeJoins(doc);
  const prisms = Object.keys(doc.walls).sort().flatMap((id) => wallPrisms(doc, id, joins));
  const floors: FloorDesc[] = Object.keys(doc.rooms).sort().map((id) => {
    const a = Object.values(doc.finishAssignments).find((f) => f.target.kind === 'roomFloor' && f.target.roomId === id);
    const color = a ? doc.catalogSnapshot.finishes[a.finishId]?.appearance.baseColorHex ?? '#cccccc' : '#dddddd';
    return { id: `floor:${id}`, roomId: id, polygon: interiorPolygon(doc, id), colorHex: color };
  });
  const boxes: BoxDesc[] = Object.keys(doc.objects).sort().map((id) => {
    const o = doc.objects[id]!;
    const item = doc.catalogSnapshot.items[o.catalogItemId];
    const [x, , z] = toWorld(o.position);
    return {
      id, center: [x, (o.elevationMm + o.size.heightMm / 2) / 1000, z], size: [o.size.widthMm / 1000, o.size.heightMm / 1000, o.size.depthMm / 1000],
      rotationY: planRotationToThree(o.rotationDeg), colorHex: o.colorHex ?? item?.defaultColorHex ?? '#bbbbbb', recipe: item ? `${item.recipe.id}@${item.recipe.version}` : 'fallback-box',
    };
  });
  const body = {
    prisms: prisms.map((p) => ({ ...p, polygon: p.polygon.map((q) => ({ x: r3(q.x), y: r3(q.y) })) })),
    floors: floors.map((f) => ({ ...f, polygon: f.polygon.map((q) => ({ x: r3(q.x), y: r3(q.y) })) })), boxes,
  };
  return { prisms, floors, boxes, hash: stableHash(body) };
}

/** Semnătură fără ID-uri (pentru a compara un proiect cu o copie cu ID-uri regenerate). */
export function geometrySignature(s: SceneDescription): string {
  const strip = (p: Pt[]) => p.map((q) => [r3(q.x), r3(q.y)]);
  const prisms = s.prisms.map((p) => [strip(p.polygon), p.y0, p.y1]).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const floors = s.floors.map((f) => [strip(f.polygon), f.colorHex]).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const boxes = s.boxes.map((b) => [b.center, b.size, b.rotationY, b.colorHex, b.recipe]).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  return stableHash({ prisms, floors, boxes });
}
