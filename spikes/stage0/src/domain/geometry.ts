// SPIKE Etapa 0 — geometria pereților conform DATA_MODEL §3.A (axă, grosime simetrică, miter/bevel, goluri).
import type { ProjectDocument, Wall } from './schema';

export interface Pt { x: number; y: number }
const EPS = 1e-9;
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
export const len = (a: Pt): number => Math.hypot(a.x, a.y);
/** Y în jos: „stânga” unui privitor care merge pe d. d=(1,0) → (0,-1). */
export const leftNormal = (d: Pt): Pt => ({ x: d.y, y: -d.x });
export const rightNormal = (d: Pt): Pt => ({ x: -d.y, y: d.x });

/** Limita de miter (A.3): distanța nod→vârf > 2·t_max (= 4·t/2) ⇒ bevel (~29°). */
export const MITER_LIMIT_FACTOR = 2;

function intersect(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const c = cross(d1, d2);
  if (Math.abs(c) < EPS) return null;
  const t = cross(sub(p2, p1), d2) / c;
  return add(p1, mul(d1, t));
}

export interface WallFrame { w: Wall; start: Pt; end: Pt; d: Pt; nL: Pt; length: number }
export function wallFrame(doc: ProjectDocument, w: Wall): WallFrame {
  const a = doc.nodes[w.startNodeId], b = doc.nodes[w.endNodeId];
  if (!a || !b) throw new Error(`Perete ${w.id}: noduri lipsă`);
  const start = { x: a.x, y: a.y }, end = { x: b.x, y: b.y };
  const v = sub(end, start), length = len(v);
  if (length === 0) throw new Error(`Perete ${w.id}: lungime 0`);
  const d = mul(v, 1 / length);
  return { w, start, end, d, nL: leftNormal(d), length };
}

export interface Corner { left: Pt; right: Pt; bevel: boolean }
export type Joins = Map<string, Corner>; // cheie: `${wallId}:start|end`

interface Inc { w: Wall; end: 'start' | 'end'; u: Pt; t: number }

export function computeJoins(doc: ProjectDocument): Joins {
  const joins: Joins = new Map();
  const byNode = new Map<string, Inc[]>();
  for (const w of Object.values(doc.walls)) {
    const f = wallFrame(doc, w);
    (byNode.get(w.startNodeId) ?? byNode.set(w.startNodeId, []).get(w.startNodeId)!).push({ w, end: 'start', u: f.d, t: w.thicknessMm });
    (byNode.get(w.endNodeId) ?? byNode.set(w.endNodeId, []).get(w.endNodeId)!).push({ w, end: 'end', u: mul(f.d, -1), t: w.thicknessMm });
  }
  for (const [nodeId, incs] of byNode) {
    const n = doc.nodes[nodeId]!;
    const N: Pt = { x: n.x, y: n.y };
    incs.sort((a, b) => Math.atan2(a.u.y, a.u.x) - Math.atan2(b.u.y, b.u.x));
    // „spre următorul” (în sens orar pe ecran) = dreapta față de direcția spre exterior
    const next = new Map<Inc, Pt>(); // punctul feței dinspre vecinul următor
    const prev = new Map<Inc, Pt>(); // punctul feței dinspre vecinul precedent
    const bevelFlag = new Map<Inc, boolean>();
    const own = (i: Inc, side: 'r' | 'l'): Pt => add(N, mul(side === 'r' ? rightNormal(i.u) : leftNormal(i.u), i.t / 2));
    if (incs.length === 1) {
      const i = incs[0]!;
      next.set(i, own(i, 'r')); prev.set(i, own(i, 'l')); bevelFlag.set(i, false);
    } else {
      for (let k = 0; k < incs.length; k++) {
        const a = incs[k]!, b = incs[(k + 1) % incs.length]!;
        const pa = own(a, 'r'), pb = own(b, 'l');
        const P = intersect(pa, a.u, pb, b.u);
        let useP = P;
        let bevel = false;
        // Bevel doar pe partea reflexă (gap > 180°): acolo miterul ar produce un vârf lung; în pana îngustă punctul e interior și corect.
        const gap = (((Math.atan2(b.u.y, b.u.x) - Math.atan2(a.u.y, a.u.x)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
        if (P && gap > Math.PI && len(sub(P, N)) > MITER_LIMIT_FACTOR * Math.max(a.t, b.t)) { useP = null; bevel = true; }
        next.set(a, useP ?? pa); prev.set(b, useP ?? pb);
        if (bevel) { bevelFlag.set(a, true); bevelFlag.set(b, true); }
      }
    }
    for (const i of incs) {
      // end==='start': dreapta-spre-exterior = fața dreaptă a peretelui; end==='end': fața stângă
      const toNext = next.get(i)!, toPrev = prev.get(i)!;
      const corner: Corner = i.end === 'start'
        ? { right: toNext, left: toPrev, bevel: bevelFlag.get(i) ?? false }
        : { left: toNext, right: toPrev, bevel: bevelFlag.get(i) ?? false };
      joins.set(`${i.w.id}:${i.end}`, corner);
    }
  }
  return joins;
}

export interface FaceSpan { s0: number; s1: number }
export interface WallFootprint { polygon: Pt[]; left: FaceSpan; right: FaceSpan; frame: WallFrame; c0: Corner; c1: Corner }
export function wallFootprint(doc: ProjectDocument, joins: Joins, w: Wall): WallFootprint {
  const frame = wallFrame(doc, w);
  const c0 = joins.get(`${w.id}:start`)!, c1 = joins.get(`${w.id}:end`)!;
  const s = (p: Pt) => dot(sub(p, frame.start), frame.d);
  return {
    polygon: [c0.left, c1.left, c1.right, c0.right], frame, c0, c1,
    left: { s0: s(c0.left), s1: s(c1.left) }, right: { s0: s(c0.right), s1: s(c1.right) },
  };
}
export const faceLength = (fp: WallFootprint, side: 'left' | 'right'): number => { const f = side === 'left' ? fp.left : fp.right; return f.s1 - f.s0; };

/** Punct pe fața peretelui la coordonata s de-a lungul axei. */
export function facePoint(fp: WallFootprint, side: 'left' | 'right', s: number): Pt {
  const off = mul(fp.frame.nL, (side === 'left' ? 1 : -1) * fp.frame.w.thicknessMm / 2);
  return add(add(fp.frame.start, mul(fp.frame.d, s)), off);
}

export function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i]!, q = poly[(i + 1) % poly.length]!; a += p.x * q.y - q.x * p.y; }
  return a / 2; // Y în jos: pozitiv = sens orar pe ecran
}

export function findWall(doc: ProjectDocument, a: string, b: string): Wall | undefined {
  return Object.values(doc.walls).find((w) => (w.startNodeId === a && w.endNodeId === b) || (w.startNodeId === b && w.endNodeId === a));
}

/** Poligonul interior al camerei (A.2): decalare muchie cu t/2 spre interior + intersecții consecutive; treaptă la grosimi diferite. */
export function interiorPolygon(doc: ProjectDocument, roomId: string): Pt[] {
  const room = doc.rooms[roomId];
  if (!room) throw new Error(`Cameră inexistentă ${roomId}`);
  const pts = room.nodeLoop.map((id) => { const n = doc.nodes[id]; if (!n) throw new Error(`Nod lipsă ${id}`); return { x: n.x, y: n.y }; });
  const cw = signedArea(pts) > 0;
  const edges = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    const w = findWall(doc, room.nodeLoop[i]!, room.nodeLoop[(i + 1) % pts.length]!);
    if (!w) throw new Error(`Lipsește peretele între ${room.nodeLoop[i]} și ${room.nodeLoop[(i + 1) % pts.length]}`);
    const v = sub(q, p), L = len(v), u = mul(v, 1 / L);
    const nrm = cw ? rightNormal(u) : leftNormal(u);
    return { p, u, nrm, t: w.thicknessMm };
  });
  const out: Pt[] = [];
  for (let i = 0; i < edges.length; i++) {
    const a = edges[(i - 1 + edges.length) % edges.length]!, b = edges[i]!;
    const N = b.p;
    const pa = add(N, mul(a.nrm, a.t / 2)), pb = add(N, mul(b.nrm, b.t / 2));
    const P = intersect(pa, a.u, pb, b.u);
    if (P) out.push(P);
    else if (a.t === b.t) out.push(pb);
    else { out.push(pa, pb); } // treaptă (A.2)
  }
  return out;
}

export const polygonArea = (poly: Pt[]): number => Math.abs(signedArea(poly));

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Poligon simplu (fără autointersecții) — verificare O(n²), suficient pentru camere. */
export function isSimplePolygon(poly: Pt[]): boolean {
  const n = poly.length;
  const segInt = (a: Pt, b: Pt, c: Pt, d: Pt) => {
    const o = (p: Pt, q: Pt, r: Pt) => Math.sign(cross(sub(q, p), sub(r, p)));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segInt(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)) return false;
  }
  return true;
}

export interface OpeningIssue { openingId: string; code: 'out-of-range' | 'overlap' | 'too-tall' }
/** A.5: gol în porțiunea dreaptă a ambelor fețe, cu marjă; goluri fără suprapunere; sill+height ≤ H. */
export function validateOpenings(doc: ProjectDocument, joins: Joins, wallId: string): OpeningIssue[] {
  const w = doc.walls[wallId]!;
  const fp = wallFootprint(doc, joins, w);
  const lo = Math.max(fp.left.s0, fp.right.s0) + doc.settings.openingEdgeMarginMm;
  const hi = Math.min(fp.left.s1, fp.right.s1) - doc.settings.openingEdgeMarginMm;
  const ops = Object.values(doc.openings).filter((o) => o.wallId === wallId).sort((a, b) => a.offsetMm - b.offsetMm);
  const issues: OpeningIssue[] = [];
  ops.forEach((o, i) => {
    const a = o.offsetMm - o.widthMm / 2, b = o.offsetMm + o.widthMm / 2;
    if (a < lo - 1e-9 || b > hi + 1e-9) issues.push({ openingId: o.id, code: 'out-of-range' });
    if (o.sillHeightMm + o.heightMm > w.heightMm) issues.push({ openingId: o.id, code: 'too-tall' });
    const nx = ops[i + 1];
    if (nx && nx.offsetMm - nx.widthMm / 2 - b < doc.settings.openingGapMm) issues.push({ openingId: nx.id, code: 'overlap' });
  });
  return issues;
}

/** Aria benzii de finisaj pe o față (A.6): lungime față × înălțime bandă − goluri intersectate (mm²). */
export function faceBandAreaMm2(doc: ProjectDocument, joins: Joins, wallId: string, side: 'left' | 'right', fromH = 0, coveredH?: number): number {
  const w = doc.walls[wallId]!;
  const fp = wallFootprint(doc, joins, w);
  const bandTop = Math.min(fromH + (coveredH ?? w.heightMm - fromH), w.heightMm);
  const bandH = bandTop - fromH;
  let area = faceLength(fp, side) * bandH;
  for (const o of Object.values(doc.openings)) {
    if (o.wallId !== wallId) continue;
    const ovH = Math.max(0, Math.min(o.sillHeightMm + o.heightMm, bandTop) - Math.max(o.sillHeightMm, fromH));
    area -= o.widthMm * ovH;
  }
  return area;
}

/** Față interioară a fiecărui perete al camerei: {wallId, side} în cadrul peretelui (start→end). */
export function roomWallSides(doc: ProjectDocument, roomId: string): Array<{ wallId: string; side: 'left' | 'right' }> {
  const room = doc.rooms[roomId]!;
  const pts = room.nodeLoop.map((id) => ({ x: doc.nodes[id]!.x, y: doc.nodes[id]!.y }));
  const cw = signedArea(pts) > 0;
  return room.nodeLoop.map((id, i) => {
    const nextId = room.nodeLoop[(i + 1) % room.nodeLoop.length]!;
    const w = findWall(doc, id, nextId)!;
    const aligned = w.startNodeId === id;
    const rightOfWall = aligned ? cw : !cw;
    return { wallId: w.id, side: rightOfWall ? ('right' as const) : ('left' as const) };
  });
}

/** Comoditate UI (A.4): axele unei camere dreptunghiulare din dimensiuni interioare W×D și grosimi (N,E,S,V). Ancora = colț interior stânga-sus. */
export function rectAxesFromInterior(W: number, D: number, t: { n: number; e: number; s: number; w: number }, anchor: Pt = { x: 0, y: 0 }): Pt[] {
  const left = anchor.x - t.w / 2, right = anchor.x + W + t.e / 2, top = anchor.y - t.n / 2, bottom = anchor.y + D + t.s / 2;
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
}
