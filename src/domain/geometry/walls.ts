// Geometria pereților conform DATA_MODEL §3.A: axă, grosime simetrică, miter/bevel, fețe, goluri.
import type { Opening, ProjectDocument, Wall, WallSide } from '../schema';
import { add, dot, intersectLines, leftNormal, len, mul, rightNormal, sub, type Pt } from './vec';

/** Unghi minim acceptat între doi pereți care se întâlnesc într-un nod (limită MVP; sub el datele sunt respinse). */
export const MIN_WALL_ANGLE_DEG = 10;
/** Bevel când distanța nod→vârf miter depășește `MITER_LIMIT_FACTOR × t_max` (≈ 29° între pereți), doar pe partea reflexă. */
export const MITER_LIMIT_FACTOR = 2;

export interface WallFrame {
  wall: Wall;
  start: Pt;
  end: Pt;
  /** Versor start→end. */
  d: Pt;
  /** Normala spre fața „left”. */
  nL: Pt;
  length: number;
}

export function wallFrame(doc: ProjectDocument, wall: Wall): WallFrame {
  const a = doc.nodes[wall.startNodeId];
  const b = doc.nodes[wall.endNodeId];
  if (!a || !b) throw new Error(`Perete ${wall.id}: nod lipsă`);
  const start = { x: a.x, y: a.y };
  const end = { x: b.x, y: b.y };
  const v = sub(end, start);
  const length = len(v);
  if (length === 0) throw new Error(`Perete ${wall.id}: lungime 0`);
  const d = mul(v, 1 / length);
  return { wall, start, end, d, nL: leftNormal(d), length };
}

export interface Corner {
  left: Pt;
  right: Pt;
  bevel: boolean;
}
/** Cheie: `${wallId}:start` | `${wallId}:end`. */
export type Joins = Map<string, Corner>;

interface Incident {
  wall: Wall;
  end: 'start' | 'end';
  /** Versor dinspre nod spre exterior (spre celălalt capăt). */
  u: Pt;
  t: number;
  angle: number;
}

export function incidentWalls(doc: ProjectDocument): Map<string, Incident[]> {
  const byNode = new Map<string, Incident[]>();
  const push = (nodeId: string, inc: Incident) => {
    const list = byNode.get(nodeId);
    if (list) list.push(inc);
    else byNode.set(nodeId, [inc]);
  };
  for (const wall of Object.values(doc.walls)) {
    const f = wallFrame(doc, wall);
    const back = mul(f.d, -1);
    push(wall.startNodeId, {
      wall,
      end: 'start',
      u: f.d,
      t: wall.thicknessMm,
      angle: Math.atan2(f.d.y, f.d.x),
    });
    push(wall.endNodeId, {
      wall,
      end: 'end',
      u: back,
      t: wall.thicknessMm,
      angle: Math.atan2(back.y, back.x),
    });
  }
  for (const list of byNode.values())
    list.sort((a, b) => a.angle - b.angle || a.wall.id.localeCompare(b.wall.id));
  return byNode;
}

/** Colțurile fiecărui perete la fiecare capăt, din graful de pereți (miter / bevel / capăt drept / treaptă). */
export function computeJoins(doc: ProjectDocument, incidents = incidentWalls(doc)): Joins {
  const joins: Joins = new Map();
  for (const [nodeId, incs] of incidents) {
    const n = doc.nodes[nodeId]!;
    const N: Pt = { x: n.x, y: n.y };
    const ownPoint = (i: Incident, side: 'right' | 'left'): Pt =>
      add(N, mul(side === 'right' ? rightNormal(i.u) : leftNormal(i.u), i.t / 2));
    // „spre următorul” = spre vecinul în sens orar pe ecran = dreapta față de direcția spre exterior
    const toNext = new Map<Incident, Pt>();
    const toPrev = new Map<Incident, Pt>();
    const bevel = new Map<Incident, boolean>();
    if (incs.length === 1) {
      const i = incs[0]!;
      toNext.set(i, ownPoint(i, 'right'));
      toPrev.set(i, ownPoint(i, 'left'));
    } else {
      for (let k = 0; k < incs.length; k++) {
        const a = incs[k]!;
        const b = incs[(k + 1) % incs.length]!;
        const pa = ownPoint(a, 'right');
        const pb = ownPoint(b, 'left');
        const P = intersectLines(pa, a.u, pb, b.u);
        let chosen: { a: Pt; b: Pt } = { a: pa, b: pb };
        if (P) {
          const gap =
            (((b.angle - a.angle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
          const tooLong = len(sub(P, N)) > MITER_LIMIT_FACTOR * Math.max(a.t, b.t);
          if (gap > Math.PI && tooLong) {
            bevel.set(a, true);
            bevel.set(b, true);
          } else chosen = { a: P, b: P };
        }
        toNext.set(a, chosen.a);
        toPrev.set(b, chosen.b);
      }
    }
    for (const i of incs) {
      const next = toNext.get(i)!;
      const prev = toPrev.get(i)!;
      // la capătul `start`, „dreapta spre exterior” = fața dreaptă; la `end` = fața stângă
      const corner: Corner =
        i.end === 'start'
          ? { right: next, left: prev, bevel: bevel.get(i) ?? false }
          : { left: next, right: prev, bevel: bevel.get(i) ?? false };
      joins.set(`${i.wall.id}:${i.end}`, corner);
    }
  }
  return joins;
}

export interface FaceSpan {
  /** Coordonate de-a lungul axei, de la nodul `start`. */
  s0: number;
  s1: number;
}
export interface WallFootprint {
  frame: WallFrame;
  /** Contur: left-start, left-end, right-end, right-start. */
  polygon: Pt[];
  left: FaceSpan;
  right: FaceSpan;
  startCorner: Corner;
  endCorner: Corner;
}

export function wallFootprint(doc: ProjectDocument, joins: Joins, wall: Wall): WallFootprint {
  const frame = wallFrame(doc, wall);
  const c0 = joins.get(`${wall.id}:start`)!;
  const c1 = joins.get(`${wall.id}:end`)!;
  const s = (p: Pt) => dot(sub(p, frame.start), frame.d);
  return {
    frame,
    polygon: [c0.left, c1.left, c1.right, c0.right],
    left: { s0: s(c0.left), s1: s(c1.left) },
    right: { s0: s(c0.right), s1: s(c1.right) },
    startCorner: c0,
    endCorner: c1,
  };
}

export const faceLengthMm = (fp: WallFootprint, side: WallSide): number => {
  const f = side === 'left' ? fp.left : fp.right;
  return f.s1 - f.s0;
};

/** Punct pe fața peretelui la coordonata `s` de-a lungul axei. */
export function facePoint(fp: WallFootprint, side: WallSide, s: number): Pt {
  const off = mul(fp.frame.nL, ((side === 'left' ? 1 : -1) * fp.frame.wall.thicknessMm) / 2);
  return add(add(fp.frame.start, mul(fp.frame.d, s)), off);
}

/** Intervalul admis pentru un gol (A.5): porțiunea dreaptă comună a ambelor fețe, minus marja. */
export function openingRange(fp: WallFootprint, edgeMarginMm: number): { lo: number; hi: number } {
  return {
    lo: Math.max(fp.left.s0, fp.right.s0) + edgeMarginMm,
    hi: Math.min(fp.left.s1, fp.right.s1) - edgeMarginMm,
  };
}

export type OpeningIssueCode = 'out-of-range' | 'overlap' | 'too-tall';
export interface OpeningIssue {
  openingId: string;
  code: OpeningIssueCode;
}

export function validateOpeningsOnWall(
  doc: ProjectDocument,
  fp: WallFootprint,
  openings: readonly Opening[],
): OpeningIssue[] {
  const wall = fp.frame.wall;
  const { lo, hi } = openingRange(fp, doc.settings.openingEdgeMarginMm);
  const sorted = [...openings].sort((a, b) => a.offsetMm - b.offsetMm || a.id.localeCompare(b.id));
  const issues: OpeningIssue[] = [];
  sorted.forEach((o, i) => {
    const a = o.offsetMm - o.widthMm / 2;
    const b = o.offsetMm + o.widthMm / 2;
    if (a < lo - 1e-9 || b > hi + 1e-9) issues.push({ openingId: o.id, code: 'out-of-range' });
    if (o.sillHeightMm + o.heightMm > wall.heightMm)
      issues.push({ openingId: o.id, code: 'too-tall' });
    const next = sorted[i + 1];
    if (next && next.offsetMm - next.widthMm / 2 - b < doc.settings.openingGapMm) {
      issues.push({ openingId: next.id, code: 'overlap' });
    }
  });
  return issues;
}

/**
 * Aria benzii de finisaj de pe o față (A.6), în mm²: lungimea feței × înălțimea benzii − intersecțiile golurilor cu banda.
 * Șpaletul și pragul nu se calculează (limită MVP).
 */
export function faceBandAreaMm2(
  fp: WallFootprint,
  side: WallSide,
  openings: readonly Opening[],
  fromHeightMm = 0,
  coveredHeightMm?: number,
): number {
  const wall = fp.frame.wall;
  const bandTop = Math.min(
    fromHeightMm + (coveredHeightMm ?? wall.heightMm - fromHeightMm),
    wall.heightMm,
  );
  const bandHeight = Math.max(0, bandTop - fromHeightMm);
  let area = faceLengthMm(fp, side) * bandHeight;
  for (const o of openings) {
    const overlap = Math.max(
      0,
      Math.min(o.sillHeightMm + o.heightMm, bandTop) - Math.max(o.sillHeightMm, fromHeightMm),
    );
    area -= o.widthMm * overlap;
  }
  return Math.max(0, area);
}
