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
  /** Nodurile de pe fiecare latură a dreptunghiului (colțurile + cele intermediare, dacă peretele e despărțit). */
  nodesOn: { n: string[]; e: string[]; s: string[]; w: string[] };
  t: RectThickness;
}

/**
 * Recunoaște o cameră dreptunghiulară aliniată cu axele: exact 4 colțuri; între colțuri pot exista noduri coliniare
 * (un perete comun despărțit de joncțiuni în T). Grosimea unei laturi = a primului ei perete.
 */
function analyzeRect(doc: ProjectDocument, roomId: string): Result<RectInfo> {
  const room = doc.rooms[roomId];
  if (!room) return { ok: false, error: `cameră inexistentă: ${roomId}` };
  const loop = room.nodeLoop.map((id) => doc.nodes[id]);
  if (loop.some((n) => !n)) return { ok: false, error: 'nod inexistent' };
  const all = loop as NonNullable<(typeof loop)[number]>[];
  // colțurile = nodurile unde direcția se schimbă
  const m = all.length;
  const isCorner = all.map((n, i) => {
    const p = all[(i - 1 + m) % m]!;
    const q = all[(i + 1) % m]!;
    return (n.x - p.x) * (q.y - n.y) - (n.y - p.y) * (q.x - n.x) !== 0;
  });
  const cornerIdx = all.map((_, i) => i).filter((i) => isCorner[i]);
  if (cornerIdx.length !== 4)
    return { ok: false, error: 'doar camerele dreptunghiulare cu 4 colțuri sunt suportate' };
  const corners = cornerIdx.map((i) => all[i]!);
  const xs = [...new Set(corners.map((n) => n.x))].sort((a, b) => a - b);
  const ys = [...new Set(corners.map((n) => n.y))].sort((a, b) => a - b);
  if (xs.length !== 2 || ys.length !== 2)
    return { ok: false, error: 'camera nu este un dreptunghi aliniat cu axele' };
  const [xMin, xMax] = xs as [number, number];
  const [yMin, yMax] = ys as [number, number];
  // lanțul de noduri dintre doi colți consecutivi (inclusiv ei), în ordinea buclei
  const chains: string[][] = [];
  for (let c = 0; c < 4; c++) {
    const from = cornerIdx[c]!;
    const to = cornerIdx[(c + 1) % 4]!;
    const chain: string[] = [];
    for (let i = from; ; i = (i + 1) % m) {
      chain.push(all[i]!.id);
      if (i === to && chain.length > 1) break;
      if (chain.length > m + 1) return { ok: false, error: 'buclă invalidă' };
    }
    chains.push(chain);
  }
  const side = (chain: string[]): 'n' | 'e' | 's' | 'w' | null => {
    const a = doc.nodes[chain[0]!]!;
    const b = doc.nodes[chain[chain.length - 1]!]!;
    if (a.y === b.y) return a.y === yMin ? 'n' : a.y === yMax ? 's' : null;
    if (a.x === b.x) return a.x === xMin ? 'w' : a.x === xMax ? 'e' : null;
    return null;
  };
  const nodesOn: RectInfo['nodesOn'] = { n: [], e: [], s: [], w: [] };
  for (const chain of chains) {
    const sd = side(chain);
    if (!sd) return { ok: false, error: 'camera nu are cele 4 colțuri ale unui dreptunghi' };
    nodesOn[sd] = chain;
  }
  if (!nodesOn.n.length || !nodesOn.e.length || !nodesOn.s.length || !nodesOn.w.length)
    return { ok: false, error: 'camera nu are cele 4 colțuri ale unui dreptunghi' };
  const wallByPair = new Map(
    Object.values(doc.walls).map((w) => [pairKey(w.startNodeId, w.endNodeId), w]),
  );
  const thick = (chain: string[]): number | undefined =>
    wallByPair.get(pairKey(chain[0]!, chain[1]!))?.thicknessMm;
  const tn = thick(nodesOn.n),
    te = thick(nodesOn.e),
    ts = thick(nodesOn.s),
    tw = thick(nodesOn.w);
  if (tn === undefined || te === undefined || ts === undefined || tw === undefined) {
    return { ok: false, error: 'lipsesc pereții laturilor dreptunghiului' };
  }
  return {
    ok: true,
    value: { xMin, xMax, yMin, yMax, nodesOn, t: { n: tn, e: te, s: ts, w: tw } },
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
  const set = (ids: string[], axis: 'x' | 'y', value: number) => {
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
