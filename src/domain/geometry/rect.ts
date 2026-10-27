// Introducerea dimensiunilor interioare (DATA_MODEL A.4): comoditate de UI; în document rămân doar nodurile (axele).
import type { Result } from '../result';
import type { ProjectDocument } from '../schema';
import { pairKey } from './model';
import type { Pt } from './vec';

export type { Result };

export interface RectThickness {
  /** Grosimile pereților nord/est/sud/vest (mm, pare). */
  n: number;
  e: number;
  s: number;
  w: number;
}

const isEvenPositive = (n: number): boolean => Number.isInteger(n) && n > 0 && n % 2 === 0;

/**
 * Axele (colțurile) unei camere dreptunghiulare cu fețele interioare `widthMm × depthMm`.
 * Ancora = colțul interior stânga-sus. Ordinea: NV, NE, SE, SV (orar pe ecran).
 */
export function rectAxesFromInterior(
  widthMm: number,
  depthMm: number,
  t: RectThickness,
  anchor: Pt = { x: 0, y: 0 },
): Result<[Pt, Pt, Pt, Pt]> {
  if (![t.n, t.e, t.s, t.w].every(isEvenPositive))
    return { ok: false, error: 'grosimile trebuie să fie numere pare, pozitive (mm)' };
  if (!Number.isInteger(widthMm) || !Number.isInteger(depthMm) || widthMm <= 0 || depthMm <= 0) {
    return {
      ok: false,
      error: 'dimensiunile interioare trebuie să fie numere întregi pozitive (mm)',
    };
  }
  if (!Number.isInteger(anchor.x) || !Number.isInteger(anchor.y))
    return { ok: false, error: 'ancora trebuie să aibă coordonate întregi' };
  const left = anchor.x - t.w / 2;
  const right = anchor.x + widthMm + t.e / 2;
  const top = anchor.y - t.n / 2;
  const bottom = anchor.y + depthMm + t.s / 2;
  return {
    ok: true,
    value: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
  };
}

interface RectInfo {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Nodurile pe fiecare latură a dreptunghiului. */
  nodesOn: { n: [string, string]; e: [string, string]; s: [string, string]; w: [string, string] };
  t: RectThickness;
}

/** Recunoaște o cameră dreptunghiulară aliniată cu axele (4 noduri, 4 pereți ortogonali). */
function analyzeRect(doc: ProjectDocument, roomId: string): Result<RectInfo> {
  const room = doc.rooms[roomId];
  if (!room) return { ok: false, error: `cameră inexistentă: ${roomId}` };
  if (room.nodeLoop.length !== 4)
    return { ok: false, error: 'doar camerele dreptunghiulare cu 4 noduri sunt suportate' };
  const nodes = room.nodeLoop.map((id) => doc.nodes[id]);
  if (nodes.some((n) => !n)) return { ok: false, error: 'nod inexistent' };
  const ns = nodes as NonNullable<(typeof nodes)[number]>[];
  const xs = [...new Set(ns.map((n) => n.x))].sort((a, b) => a - b);
  const ys = [...new Set(ns.map((n) => n.y))].sort((a, b) => a - b);
  if (xs.length !== 2 || ys.length !== 2)
    return { ok: false, error: 'camera nu este un dreptunghi aliniat cu axele' };
  const [xMin, xMax] = xs as [number, number];
  const [yMin, yMax] = ys as [number, number];
  const at = (x: number, y: number) => ns.find((n) => n.x === x && n.y === y)?.id;
  const nw = at(xMin, yMin),
    ne = at(xMax, yMin),
    se = at(xMax, yMax),
    sw = at(xMin, yMax);
  if (!nw || !ne || !se || !sw)
    return { ok: false, error: 'camera nu are cele 4 colțuri ale unui dreptunghi' };
  const wallByPair = new Map(
    Object.values(doc.walls).map((w) => [pairKey(w.startNodeId, w.endNodeId), w]),
  );
  const thick = (a: string, b: string): number | undefined =>
    wallByPair.get(pairKey(a, b))?.thicknessMm;
  const tn = thick(nw, ne),
    te = thick(ne, se),
    ts = thick(sw, se),
    tw = thick(nw, sw);
  if (tn === undefined || te === undefined || ts === undefined || tw === undefined) {
    return { ok: false, error: 'lipsesc pereții laturilor dreptunghiului' };
  }
  return {
    ok: true,
    value: {
      xMin,
      xMax,
      yMin,
      yMax,
      nodesOn: { n: [nw, ne], e: [ne, se], s: [sw, se], w: [nw, sw] },
      t: { n: tn, e: te, s: ts, w: tw },
    },
  };
}

/** Dimensiunile interioare ale unei camere dreptunghiulare (față interioară la față interioară). */
export function rectInteriorSize(
  doc: ProjectDocument,
  roomId: string,
): Result<{ widthMm: number; depthMm: number }> {
  const r = analyzeRect(doc, roomId);
  if (!r.ok) return r;
  const { xMin, xMax, yMin, yMax, t } = r.value;
  return {
    ok: true,
    value: { widthMm: xMax - xMin - t.w / 2 - t.e / 2, depthMm: yMax - yMin - t.n / 2 - t.s / 2 },
  };
}

export type RectSide = 'n' | 'e' | 's' | 'w';

/**
 * Editarea unei dimensiuni interioare (A.4): mută latura `moveSide` astfel încât dimensiunea interioară pe
 * direcția ei să devină `newLengthMm`; latura opusă rămâne fixă. Întoarce poziții noi pentru noduri;
 * apelantul le aplică și revalidează geometria (nodurile pot fi partajate cu alte camere).
 */
export function resizeRectInterior(
  doc: ProjectDocument,
  roomId: string,
  moveSide: RectSide,
  newLengthMm: number,
): Result<Record<string, Pt>> {
  if (!Number.isInteger(newLengthMm) || newLengthMm <= 0)
    return { ok: false, error: 'dimensiunea trebuie să fie un întreg pozitiv (mm)' };
  const r = analyzeRect(doc, roomId);
  if (!r.ok) return r;
  const { xMin, xMax, yMin, yMax, nodesOn, t } = r.value;
  const out: Record<string, Pt> = {};
  const set = (ids: [string, string], axis: 'x' | 'y', value: number) => {
    for (const id of ids) {
      const n = doc.nodes[id]!;
      out[id] = { x: axis === 'x' ? value : n.x, y: axis === 'y' ? value : n.y };
    }
  };
  switch (moveSide) {
    case 'e':
      set(nodesOn.e, 'x', xMin + t.w / 2 + newLengthMm + t.e / 2);
      break;
    case 'w':
      set(nodesOn.w, 'x', xMax - t.e / 2 - newLengthMm - t.w / 2);
      break;
    case 's':
      set(nodesOn.s, 'y', yMin + t.n / 2 + newLengthMm + t.s / 2);
      break;
    case 'n':
      set(nodesOn.n, 'y', yMax - t.s / 2 - newLengthMm - t.n / 2);
      break;
  }
  return { ok: true, value: out };
}

/** Aplică noi poziții de noduri (copie nouă a documentului). */
export function withNodePositions(
  doc: ProjectDocument,
  positions: Readonly<Record<string, Pt>>,
): ProjectDocument {
  const nodes = { ...doc.nodes };
  for (const [id, p] of Object.entries(positions)) {
    const n = nodes[id];
    if (n) nodes[id] = { ...n, x: p.x, y: p.y };
  }
  return { ...doc, nodes };
}
