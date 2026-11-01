// Laturile unei camere cu laturi aliniate la axe (dreptunghi, L, T, U…) și mutarea unei laturi (Etapa 9a): baza mânerelor
// de redimensionare ale camerelor care nu sunt dreptunghiuri. Pure: întorc un document nou sau o eroare în română.
import { cloneDocument } from '../factory';
import { pairKey, signedArea, type Pt } from '../geometry';
import type { Result } from '../result';
import type { ProjectDocument } from '../schema';

/** Lungimea axială minimă a unei laturi după mutarea uneia vecine (mm); sub ea camera nu mai are sens practic. */
export const MIN_EDGE_MM = 600;

export interface RoomEdgeInfo {
  /** Indicele laturii (stabil cât timp bucla camerei nu se schimbă). */
  index: number;
  /** Colțurile laturii pe axele pereților. */
  a: Pt;
  b: Pt;
  /** Normala exterioară (vector unitar aliniat cu axele). */
  normal: Pt;
  /** Nodurile de pe latură, colțurile inclusiv (și cele intermediare, dacă peretele e despărțit). */
  nodeIds: string[];
  /** Grosimea primului perete al laturii. */
  thicknessMm: number;
}

/**
 * Laturile unei camere cu toate laturile paralele cu axele: între colțuri (unde direcția se schimbă) pot exista noduri
 * coliniare. Refuză camerele cu laturi oblice sau cu mai puțin de 4 colțuri.
 */
export function roomEdges(doc: ProjectDocument, roomId: string): Result<RoomEdgeInfo[]> {
  const room = doc.rooms[roomId];
  if (!room) return { ok: false, error: 'Camera nu mai există.' };
  const loop = room.nodeLoop.map((id) => doc.nodes[id]);
  if (loop.some((n) => !n)) return { ok: false, error: 'Un nod al camerei lipsește.' };
  const pts = loop as NonNullable<(typeof loop)[number]>[];
  const m = pts.length;
  for (let i = 0; i < m; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % m]!;
    if ((p.x === q.x) === (p.y === q.y))
      return {
        ok: false,
        error: 'Camera are laturi oblice; mânerele merg doar la laturi paralele cu axele.',
      };
  }
  const isCorner = pts.map((n, i) => {
    const p = pts[(i - 1 + m) % m]!;
    const q = pts[(i + 1) % m]!;
    return (n.x - p.x) * (q.y - n.y) - (n.y - p.y) * (q.x - n.x) !== 0;
  });
  const cornerIdx = pts.map((_, i) => i).filter((i) => isCorner[i]);
  if (cornerIdx.length < 4) return { ok: false, error: 'Camera are mai puțin de 4 colțuri.' };
  const cornerPts = cornerIdx.map((i) => ({ x: pts[i]!.x, y: pts[i]!.y }));
  const outward = signedArea(cornerPts) > 0 ? 1 : -1;
  const wallByPair = new Map(
    Object.values(doc.walls).map((w) => [pairKey(w.startNodeId, w.endNodeId), w]),
  );
  const edges: RoomEdgeInfo[] = [];
  for (let c = 0; c < cornerIdx.length; c++) {
    const from = cornerIdx[c]!;
    const to = cornerIdx[(c + 1) % cornerIdx.length]!;
    const nodeIds: string[] = [];
    for (let i = from; ; i = (i + 1) % m) {
      nodeIds.push(pts[i]!.id);
      if (i === to && nodeIds.length > 1) break;
      if (nodeIds.length > m + 1) return { ok: false, error: 'Bucla camerei e invalidă.' };
    }
    const a = cornerPts[c]!;
    const b = cornerPts[(c + 1) % cornerPts.length]!;
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    const wall = wallByPair.get(pairKey(nodeIds[0]!, nodeIds[1]!));
    if (!wall) return { ok: false, error: 'Lipsește un perete al camerei.' };
    edges.push({
      index: c,
      a,
      b,
      normal: { x: outward * dy + 0, y: -outward * dx + 0 }, // `+ 0`: fără −0
      nodeIds,
      thicknessMm: wall.thicknessMm,
    });
  }
  return { ok: true, value: edges };
}

/**
 * Mută latura `edgeIndex` a camerei cu `deltaMm` pe normala ei exterioară (pozitiv = camera crește pe acea direcție):
 * toate nodurile laturii se mută odată, iar laturile vecine se întind sau se scurtează. Refuză o deplasare care ar
 * scurta o latură sub `MIN_EDGE_MM` sau i-ar întoarce sensul. Nodurile comune cu alte camere se mută și ele (vecinii se
 * deformează); validitatea geometrică completă o verifică commit-ul.
 */
export function moveRoomEdge(
  doc: ProjectDocument,
  roomId: string,
  edgeIndex: number,
  deltaMm: number,
): Result<ProjectDocument> {
  if (!Number.isInteger(deltaMm))
    return { ok: false, error: 'Deplasarea trebuie să fie în milimetri întregi.' };
  const edges = roomEdges(doc, roomId);
  if (!edges.ok) return edges;
  const edge = edges.value[edgeIndex];
  if (!edge) return { ok: false, error: 'Latura nu mai există.' };
  if (deltaMm === 0) return { ok: true, value: doc };
  // doar capetele laturii mutate se deplasează: ea însăși, sfârșitul celei dinainte și începutul celei de după
  const n = edges.value.length;
  const prevIdx = (edgeIndex - 1 + n) % n;
  const nextIdx = (edgeIndex + 1) % n;
  const sh = (p: Pt): Pt => ({
    x: p.x + edge.normal.x * deltaMm,
    y: p.y + edge.normal.y * deltaMm,
  });
  for (const e of edges.value) {
    const a = e.index === edgeIndex || e.index === nextIdx ? sh(e.a) : e.a;
    const b = e.index === edgeIndex || e.index === prevIdx ? sh(e.b) : e.b;
    const along = (b.x - a.x) * (e.b.x - e.a.x) + (b.y - a.y) * (e.b.y - e.a.y);
    if (along <= 0 || Math.hypot(b.x - a.x, b.y - a.y) < MIN_EDGE_MM)
      return { ok: false, error: `Camera nu poate fi mai mică de ${MIN_EDGE_MM} mm pe o latură.` };
  }
  const next = cloneDocument(doc);
  for (const id of edge.nodeIds) {
    const node = next.nodes[id];
    if (node)
      next.nodes[id] = {
        ...node,
        x: node.x + edge.normal.x * deltaMm,
        y: node.y + edge.normal.y * deltaMm,
      };
  }
  return { ok: true, value: next };
}
